import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { Queue, QueueEvents } from "bullmq";
import type { PinoLogger } from "nestjs-pino";
import { MessageJobProcessor } from "./message-job.processor.js";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import {
  type MetaWhatsAppProviderAdapter,
  WhatsAppProviderError,
} from "@whatsapp-platform/whatsapp-provider";
import { MessageDeliveryRepository } from "./message-delivery.repository.js";
import {
  MessageDeliveryService,
  MessageDeliveryError,
  CampaignDeliveryDeferred,
} from "./message-delivery.service.js";
import type { MessageTransactionManager } from "./message-transaction.manager.js";
import { MessageQueue } from "./message.queue.js";
import { MESSAGE_QUEUE_NAME, type MessageJobData } from "./message.constants.js";

const config = {
  messaging: { maxAttempts: 5, retryBaseDelayMs: 1000 },
  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    queuePrefix: `task052-${randomUUID()}`,
  },
} as RuntimeConfig;

void test("real PostgreSQL delivery persists acceptance, terminal failure and tenant-safe audited replay", async () => {
  if (process.env.NODE_ENV === "production")
    throw new Error("Use isolated development credentials.");
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
  });
  const session = await pool.connect();
  await session.query("BEGIN");
  try {
    const tenant = randomUUID(),
      plan = randomUUID(),
      account = randomUUID(),
      contact = randomUUID(),
      conversation = randomUUID(),
      message = randomUUID();
    await session.query(
      "INSERT INTO app.tenants (id,name,slug,status) VALUES ($1::uuid,'TASK052 test',$1::text,'ACTIVE')",
      [tenant],
    );
    await session.query(
      "INSERT INTO app.plans (id,code,name,status) VALUES ($1::uuid,$1::text,'test','ACTIVE')",
      [plan],
    );
    await session.query(
      "INSERT INTO app.subscriptions (tenant_id,plan_id,status,starts_at) VALUES ($1,$2,'ACTIVE',now()-interval '1 day')",
      [tenant, plan],
    );
    await session.query(
      "INSERT INTO app.whatsapp_accounts (id,tenant_id,waba_id,phone_number_id,display_phone,status) VALUES ($1::uuid,$2,$1::text,$1::text,'test','CONNECTED')",
      [account, tenant],
    );
    await session.query(
      "INSERT INTO app.provider_credentials (tenant_id,whatsapp_account_id,provider,secret_ref,status) VALUES ($1,$2,'META','env://test','ACTIVE')",
      [tenant, account],
    );
    await session.query(
      "INSERT INTO app.contacts (id,tenant_id,phone_e164) VALUES ($1,$2,'+919876543210')",
      [contact, tenant],
    );
    await session.query(
      "INSERT INTO app.conversations (id,tenant_id,whatsapp_account_id,contact_id,status,window_expires_at) VALUES ($1,$2,$3,$4,'OPEN',now()+interval '1 hour')",
      [conversation, tenant, account, contact],
    );
    await session.query(
      "INSERT INTO app.messages (id,tenant_id,conversation_id,contact_id,whatsapp_account_id,direction,message_type,status,content,policy_decision) VALUES ($1,$2,$3,$4,$5,'OUTBOUND','TEXT','CREATED',$6::jsonb,$7::jsonb)",
      [
        message,
        tenant,
        conversation,
        contact,
        account,
        JSON.stringify({ text: "Test" }),
        JSON.stringify({ outcome: "ALLOWED", source: "INBOX" }),
      ],
    );
    const repository = new MessageDeliveryRepository();
    const transactions = {
      execute: <T>(work: (client: PoolClient) => Promise<T>) => work(session),
    } as MessageTransactionManager;
    let sends = 0;
    const provider = {
      sendText: () => {
        sends++;
        return Promise.resolve({
          providerMessageId: `wamid.${message}`,
          acceptedAt: new Date().toISOString(),
        });
      },
    } as unknown as MetaWhatsAppProviderAdapter;
    const service = new MessageDeliveryService(repository, transactions, provider, config);
    await service.process(message);
    await service.process(message);
    assert.equal(sends, 1);
    assert.equal(
      (
        await session.query<{ status: string }>("SELECT status FROM app.messages WHERE id=$1", [
          message,
        ])
      ).rows[0]?.status,
      "SENT",
    );
    assert.equal(await service.replay(tenant, message), false);
    await session.query(
      "UPDATE app.messages SET status='QUEUED',provider_message_id=NULL WHERE id=$1",
      [message],
    );
    const rejection = {
      sendText: () => Promise.reject(new WhatsAppProviderError("TRANSIENT", "safe")),
    } as unknown as MetaWhatsAppProviderAdapter;
    const failedService = new MessageDeliveryService(repository, transactions, rejection, config);
    await assert.rejects(() => failedService.process(message, 5));
    assert.equal(
      (
        await session.query<{ error_code: string }>(
          "SELECT error_code FROM app.messages WHERE id=$1",
          [message],
        )
      ).rows[0]?.error_code,
      "MESSAGE_DELIVERY_RETRIES_EXHAUSTED",
    );
    assert.equal(await service.replay(randomUUID(), message), false);
    assert.equal(await service.replay(tenant, message), true);
    assert.equal(await service.replay(tenant, message), false);
    const events = await session.query(
      "SELECT payload FROM app.outbox_events WHERE aggregate_id=$1",
      [message],
    );
    assert.deepEqual(events.rows, [{ payload: { message_id: message } }]);
    assert.equal(
      (
        await session.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM app.audit_logs WHERE entity_id=$1 AND action='OUTBOUND_MESSAGE_REPLAY'",
          [message],
        )
      ).rows[0]?.count,
      1,
    );
    // An opt-out after composition must block live dispatch without contacting Meta.
    await session.query("UPDATE app.contacts SET consent_status='OPTED_OUT' WHERE id=$1", [
      contact,
    ]);
    await assert.rejects(() => service.process(message));
    assert.equal(sends, 1);
  } finally {
    await session.query("ROLLBACK");
    session.release();
    await pool.end();
  }
});

void test("real Redis deduplicates the same durable event and permits a distinct replay event", async () => {
  const sender = new MessageQueue(config);
  const inspector = new Queue<MessageJobData>(MESSAGE_QUEUE_NAME, {
    connection: { url: config.redis.url },
    prefix: config.redis.queuePrefix,
  });
  const message = randomUUID(),
    event = randomUUID(),
    replay = randomUUID();
  try {
    await sender.enqueue(message, event);
    await sender.enqueue(message, event);
    assert.equal(await inspector.getWaitingCount(), 1);
    await sender.enqueue(message, replay);
    assert.equal(await inspector.getWaitingCount(), 2);
    for (const job of await inspector.getJobs(["waiting"]))
      assert.deepEqual(job.data, { messageId: message });
  } finally {
    // Only this uniquely prefixed test queue owns these disposable test jobs.
    for (const job of await inspector.getJobs(["waiting"])) await job.remove();
    await sender.close();
    await inspector.close();
  }
});

void test("real BullMQ transport retries service-directed delays and stops permanent errors", async () => {
  const isolated = {
    ...config,
    messaging: { ...config.messaging, queueConcurrency: 1 },
    redis: { ...config.redis, queuePrefix: `task052-worker-${randomUUID()}` },
  };
  const sender = new MessageQueue(isolated);
  const inspector = new Queue<MessageJobData>(MESSAGE_QUEUE_NAME, {
    connection: { url: isolated.redis.url },
    prefix: isolated.redis.queuePrefix,
  });
  const events = new QueueEvents(MESSAGE_QUEUE_NAME, {
    connection: { url: isolated.redis.url },
    prefix: isolated.redis.queuePrefix,
  });
  const transient = randomUUID(),
    permanent = randomUUID(),
    paused = randomUUID();
  let retryCalls = 0,
    permanentCalls = 0,
    pausedCalls = 0;
  const service = {
    process: (id: string) => {
      if (id === paused) {
        pausedCalls++;
        return pausedCalls === 1
          ? Promise.reject(new CampaignDeliveryDeferred("CAMPAIGN_PAUSED"))
          : Promise.resolve();
      }
      if (id === transient) {
        retryCalls++;
        return retryCalls === 1
          ? Promise.reject(new MessageDeliveryError("WHATSAPP_PROVIDER_TRANSIENT", 100))
          : Promise.resolve();
      }
      permanentCalls++;
      return Promise.reject(new MessageDeliveryError("WHATSAPP_PROVIDER_VALIDATION", null));
    },
  } as unknown as MessageDeliveryService;
  const logger = {
    setContext: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as PinoLogger;
  const processor = new MessageJobProcessor(service, isolated, true, logger);
  await events.waitUntilReady();
  processor.onApplicationBootstrap();
  try {
    for (const id of [transient, permanent, paused]) {
      await sender.enqueue(id, id);
      const job = await inspector.getJob(`outbound-message-${id}-${id}`);
      assert.ok(job);
      if (id === transient || id === paused) await job.waitUntilFinished(events, 15000);
      else await assert.rejects(() => job.waitUntilFinished(events, 10000));
    }
    assert.equal(retryCalls, 2);
    assert.equal(permanentCalls, 1);
    assert.equal(pausedCalls, 2);
    assert.equal((await inspector.getJob(`outbound-message-${paused}-${paused}`))?.attemptsMade, 1);
  } finally {
    await processor.onApplicationShutdown();
    for (const job of await inspector.getJobs(["completed", "failed", "waiting", "delayed"]))
      await job.remove();
    await events.close();
    await sender.close();
    await inspector.close();
  }
});
