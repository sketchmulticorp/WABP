import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { Queue } from "bullmq";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { CampaignPreflightRepository } from "./campaign-preflight.repository.js";
import { CampaignPreflightService } from "./campaign-preflight.service.js";
import { CampaignPreflightQueue } from "./campaign-preflight.queue.js";
import { ContactImportOutboxService } from "../imports/contact-import-outbox.service.js";
import { ContactImportQueue } from "../imports/contact-import.queue.js";
import { WebhookQueue } from "../webhooks/webhook.queue.js";

if (process.env.NODE_ENV === "production")
  throw new Error("Phase 5 fixtures require development services.");

void test(
  "100,000-recipient SQL preflight deduplicates, reports suppression/missing values/quota, persists audit and replays once",
  { timeout: 120000 },
  async () => {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
    });
    const session = await pool.connect();
    await session.query("BEGIN");
    const began = Date.now();
    try {
      const tenant = randomUUID(),
        role = randomUUID(),
        actor = randomUUID(),
        account = randomUUID(),
        plan = randomUUID(),
        template = randomUUID(),
        campaign = randomUUID(),
        group = randomUUID(),
        run = randomUUID();
      await session.query(
        "INSERT INTO app.tenants(id,name,slug,status) VALUES($1::uuid,'Phase5 load',$1::text,'ACTIVE')",
        [tenant],
      );
      await session.query(
        "INSERT INTO app.roles(id,tenant_id,name,system_key) VALUES($1,$2,'Admin','TENANT_ADMIN')",
        [role, tenant],
      );
      await session.query(
        "INSERT INTO app.users(id,home_tenant_id,role_id,email,password_hash,display_name,status) VALUES($1::uuid,$2,$3,$1::text||'@example.test','not-a-login-hash','Fixture','ACTIVE')",
        [actor, tenant, role],
      );
      await session.query(
        "INSERT INTO app.whatsapp_accounts(id,tenant_id,waba_id,phone_number_id,display_phone,status) VALUES($1::uuid,$2,$1::text,$1::text,'test','CONNECTED')",
        [account, tenant],
      );
      await session.query(
        "INSERT INTO app.provider_credentials(tenant_id,whatsapp_account_id,provider,secret_ref,status) VALUES($1,$2,'META','env://test','ACTIVE')",
        [tenant, account],
      );
      await session.query(
        "INSERT INTO app.plans(id,code,name,status,limits) VALUES($1::uuid,$1::text,'Fixture','ACTIVE','{\"monthly_message_limit\":50000}')",
        [plan],
      );
      await session.query(
        "INSERT INTO app.subscriptions(tenant_id,plan_id,status,starts_at) VALUES($1,$2,'ACTIVE',now()-interval '1 day')",
        [tenant, plan],
      );
      await session.query(
        "INSERT INTO app.templates(id,tenant_id,whatsapp_account_id,name,language,category,provider_status,approval_status,components) VALUES($1,$2,$3,'fixture','en_US','UTILITY','APPROVED','NOT_REQUIRED',$4::jsonb)",
        [template, tenant, account, JSON.stringify([{ type: "BODY", text: "Hello {{1}}" }])],
      );
      await session.query(
        "INSERT INTO app.contact_groups(id,tenant_id,name) VALUES($1,$2,'Large group')",
        [group, tenant],
      );
      await session.query(
        `INSERT INTO app.contacts(tenant_id,phone_e164,name,consent_status,consent_source,consent_at,consent_proof_reference)
      SELECT $1,'+91'||lpad(n::text,10,'0'),CASE WHEN n%10=2 THEN NULL ELSE 'Fixture' END,
      CASE WHEN n%10=0 THEN 'SUPPRESSED' WHEN n%10=1 THEN 'OPTED_OUT' WHEN n%10=3 THEN 'UNKNOWN' ELSE 'OPTED_IN' END,
      'TEST',now(),'fixture' FROM generate_series(1,100000)n`,
        [tenant],
      );
      await session.query(
        "INSERT INTO app.contact_group_members(tenant_id,group_id,contact_id) SELECT $1,$2,id FROM app.contacts WHERE tenant_id=$1 AND is_deleted=false",
        [tenant, group],
      );
      const contacts = await session.query<{ id: string }>(
        "SELECT id FROM app.contacts WHERE tenant_id=$1 AND is_deleted=false LIMIT 1",
        [tenant],
      );
      await session.query(
        "INSERT INTO app.campaigns(id,tenant_id,created_by,whatsapp_account_id,template_id,name,status,approval_status,template_content_version,audience_definition,variable_mapping) VALUES($1,$2,$3,$4,$5,'Load fixture','DRAFT','NOT_REQUIRED',1,$6::jsonb,$7::jsonb)",
        [
          campaign,
          tenant,
          actor,
          account,
          template,
          JSON.stringify({ version: 1, contactIds: [contacts.rows[0]?.id], groupIds: [group] }),
          JSON.stringify({ "1": { source: "CONTACT_FIELD", field: "name" } }),
        ],
      );
      await session.query(
        "INSERT INTO app.campaign_preflight_runs(id,tenant_id,campaign_id,content_version,status,requested_by,request_id) VALUES($1,$2,$3,1,'QUEUED',$4,'phase5-load')",
        [run, tenant, campaign, actor],
      );
      const transactions = {
        execute: <T>(work: (client: PoolClient) => Promise<T>) => work(session),
      };
      const service = new CampaignPreflightService(
        new CampaignPreflightRepository(),
        transactions as never,
      );
      await service.process(run);
      await service.process(run);
      const result = await session.query<{
        status: string;
        blockers: string[];
        estimates: {
          resolvedRecipients: number;
          eligibleRecipients: number;
          skippedRecipients: number;
          duplicateSelections: number;
        };
      }>("SELECT status,blockers,estimates FROM app.campaign_preflight_runs WHERE id=$1", [run]);
      assert.equal(result.rows[0]?.status, "COMPLETED");
      assert.deepEqual(result.rows[0].blockers, ["MESSAGE_QUOTA_INSUFFICIENT"]);
      assert.equal(result.rows[0].estimates.resolvedRecipients, 100000);
      assert.equal(result.rows[0].estimates.eligibleRecipients, 60000);
      assert.equal(result.rows[0].estimates.skippedRecipients, 40000);
      assert.equal(result.rows[0].estimates.duplicateSelections, 1);
      const count = await session.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.campaign_recipients WHERE tenant_id=$1 AND campaign_id=$2",
        [tenant, campaign],
      );
      assert.equal(count.rows[0]?.count, 100000);
      const audits = await session.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.audit_logs WHERE tenant_id=$1 AND action='CAMPAIGN_PREFLIGHT_COMPLETED'",
        [tenant],
      );
      assert.equal(audits.rows[0]?.count, 1);
      const usage = await session.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.usage_events WHERE tenant_id=$1",
        [tenant],
      );
      assert.equal(usage.rows[0]?.count, 0);
      console.log(
        `Phase5 100,000-recipient preflight and SQL verification: ${String(Date.now() - began)}ms (local fixture; not production capacity certification)`,
      );
    } finally {
      await session.query("ROLLBACK");
      session.release();
      await pool.end();
    }
  },
);

void test("real Redis accepts deterministic IDs; import relay retries a failed publication using a persistence double", async () => {
  const config = {
    redis: {
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      queuePrefix: `phase5-${randomUUID()}`,
    },
    imports: { maxAttempts: 3, retryBaseDelayMs: 5000 },
  } as RuntimeConfig;
  const preflight = new CampaignPreflightQueue(config),
    imports = new ContactImportQueue(config),
    webhooks = new WebhookQueue(config);
  const queues = ["campaign-preflights", "contact-imports", "webhook-events"].map(
    (name) =>
      new Queue(name, { connection: { url: config.redis.url }, prefix: config.redis.queuePrefix }),
  );
  const id = randomUUID();
  try {
    await preflight.enqueue(id);
    await preflight.enqueue(id);
    await imports.enqueue(id, config.imports);
    await imports.enqueue(id, config.imports);
    await webhooks.enqueue(id, 3, 1000);
    assert.equal(await queues[0]?.getWaitingCount(), 1);
    assert.equal(await queues[1]?.getWaitingCount(), 1);
    assert.deepEqual((await queues[0]?.getJob(`campaign-preflight-${id}`))?.data, {
      preflightRunId: id,
    });
    assert.deepEqual((await queues[1]?.getJob(`contact-import-${id}`))?.data, {
      contactImportId: id,
    });
    assert.deepEqual((await queues[2]?.getJob(`webhook-event-${id}`))?.data, {
      webhookEventId: id,
    });
    let state = "PENDING",
      first = true;
    const repository = {
      claimNext: () => {
        if (state === "PUBLISHED") return Promise.resolve(undefined);
        state = "PROCESSING";
        return Promise.resolve({ id: randomUUID(), contactImportId: id });
      },
      publish: () => {
        state = "PUBLISHED";
        return Promise.resolve();
      },
      fail: () => {
        state = "FAILED";
        return Promise.resolve();
      },
    };
    const queue = {
      enqueue: () => {
        if (first) {
          first = false;
          return Promise.reject(new Error("simulated Redis outage"));
        }
        return imports.enqueue(id, config.imports);
      },
      close: () => Promise.resolve(),
    };
    const logger = { setContext: () => undefined, warn: () => undefined, error: () => undefined };
    const relay = new ContactImportOutboxService(
      repository as never,
      queue as never,
      config,
      true,
      logger as never,
    );
    await relay.dispatchAvailable();
    assert.equal(state, "FAILED");
    await relay.dispatchAvailable();
    assert.equal(state, "PUBLISHED");
    assert.equal(await queues[1]?.getWaitingCount(), 1);
  } finally {
    for (const queue of queues) {
      for (const job of await queue.getJobs(["waiting", "delayed", "failed", "completed"]))
        await job.remove();
      await queue.close();
    }
    await preflight.close();
    await imports.close();
    await webhooks.close();
  }
});
