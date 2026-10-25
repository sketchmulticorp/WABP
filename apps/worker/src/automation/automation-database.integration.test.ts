import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { WhatsAppProvider } from "@whatsapp-platform/whatsapp-provider";
import type { PinoLogger } from "nestjs-pino";
// Test-only reuse of disposable migrated databases and real API runtime services.
import {
  automationFixture,
  linearGraph,
  withAutomationDatabase,
} from "../../../api/dist/automation/automation.test-fixture.js";
import { AutomationOutboxRepository } from "./automation-outbox.repository.js";
import { AutomationTransactionManager } from "./automation-transaction.manager.js";
import { AutomationTransportService } from "./automation-transport.service.js";
import type { AutomationQueue } from "./automation-queue.adapter.js";
import { MessageDeliveryRepository } from "../messaging/message-delivery.repository.js";
import { MessageTransactionManager } from "../messaging/message-transaction.manager.js";
import {
  MessageDeliveryService,
  MessageDeliveryError,
} from "../messaging/message-delivery.service.js";

void test(
  "SQL exhausted-event replay is concurrent-once, atomic with audit and cannot resurrect a handed-off run",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database, connection) => {
      const f = await automationFixture(database);
      await f.publish(
        linearGraph(f.accountId, [
          { key: "text", type: "MESSAGE", config: { text: "Never send" } },
        ]),
      );
      await f.trigger.inbound(await f.inbound("hello"));
      const run = await f.current();
      assert.ok(run);
      const rows = await connection.pool.query<{ id: string }>(
        "SELECT id FROM app.outbox_events WHERE aggregate_id=$1",
        [run.id],
      );
      const eventId = rows.rows[0]?.id;
      assert.ok(eventId);
      const repository = new AutomationOutboxRepository(connection.pool);
      const transport = new AutomationTransportService(
        repository,
        {} as AutomationQueue,
        f.trigger,
        f.execution,
        false,
        {} as PinoLogger,
        new AutomationTransactionManager(connection.pool),
      );
      const event = await repository.find(eventId);
      assert.ok(event);
      await transport.exhausted(event);
      assert.equal((await f.current())?.status, "HANDED_OFF");
      const failed = await connection.pool.query<{ status: string; available: string }>(
        "SELECT status,available_at::text AS available FROM app.outbox_events WHERE id=$1",
        [eventId],
      );
      assert.deepEqual(failed.rows, [{ status: "FAILED", available: "infinity" }]);
      const replayed = await Promise.all(
        Array.from({ length: 4 }, () => transport.replay(eventId)),
      );
      const replacements = replayed.filter((id) => id !== null);
      assert.equal(replacements.length, 1);
      assert.ok(replacements[0]);
      const replacement = await repository.find(replacements[0]);
      assert.ok(replacement);
      await transport.process(replacement);
      assert.equal((await f.current())?.status, "HANDED_OFF");
      const evidence = await connection.pool.query<{ messages: number; audits: number }>(`SELECT
      (SELECT count(*)::int FROM app.messages WHERE direction='OUTBOUND') AS messages,
      (SELECT count(*)::int FROM app.audit_logs WHERE action='AUTOMATION_EVENT_REPLAY') AS audits`);
      assert.deepEqual(evidence.rows, [{ messages: 0, audits: 1 }]);
      const rollbackId = randomUUID();
      await connection.pool.query(
        `INSERT INTO app.outbox_events(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,status,available_at)
      VALUES ($1,$2,'automation_run',$3,'automation.run.advance','{}','fixture','FAILED','infinity')`,
        [rollbackId, f.tenantId, run.id],
      );
      const before = await connection.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.outbox_events",
      );
      const auditFailure = new Error("Injected replay audit failure");
      repository.auditReplay = () => Promise.reject(auditFailure);
      await assert.rejects(
        transport.replay(rollbackId),
        (error: unknown) => error === auditFailure,
      );
      assert.deepEqual(
        (await connection.pool.query("SELECT count(*)::int AS count FROM app.outbox_events")).rows,
        before.rows,
      );
      assert.equal(
        (
          await connection.pool.query<{ status: string }>(
            "SELECT status FROM app.outbox_events WHERE id=$1",
            [rollbackId],
          )
        ).rows[0]?.status,
        "FAILED",
      );
    }),
);

function signal() {
  let release: () => void = () => {
    throw new Error("Signal not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release: () => {
      release();
    },
  };
}

void test(
  "SQL pause/takeover before dispatch blocks a queued bot message, while a committed SENDING claim may finish once",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database, connection) => {
      for (const action of ["pause", "takeover"] as const) {
        for (const first of ["control", "claim"] as const) {
          const f = await automationFixture(database);
          const flow = await f.publish(
            linearGraph(f.accountId, [
              { key: "text", type: "MESSAGE", config: { text: "One fake send" } },
            ]),
          );
          await f.trigger.inbound(await f.inbound("hello"));
          const run = await f.current();
          assert.ok(run);
          await f.advance(run.id);
          const pending = await f.current();
          assert.ok(pending?.state.waitingMessageId);
          const messageId = pending.state.waitingMessageId;
          const repository = new MessageDeliveryRepository(),
            held = signal(),
            release = signal(),
            providerEntered = signal(),
            finishProvider = signal();
          let sends = 0;
          const provider = {
            sendText: async () => {
              sends++;
              providerEntered.release();
              await finishProvider.promise;
              return {
                providerMessageId: `wamid.${randomUUID()}`,
                acceptedAt: new Date().toISOString(),
              };
            },
          } as unknown as WhatsAppProvider;
          const delivery = new MessageDeliveryService(
            repository,
            new MessageTransactionManager(connection.pool),
            provider,
            { messaging: { maxAttempts: 5, retryBaseDelayMs: 1000 } } as RuntimeConfig,
          );
          const control = () =>
            action === "pause"
              ? f.controls.flow(f.context, flow.id, flow.revision, "pause")
              : f.controls.conversation(f.context, f.conversationId, "takeover");
          if (first === "control") {
            const state = f.runs.state.bind(f.runs);
            f.runs.state = async (...args) => {
              await state(...args);
              held.release();
              await release.promise;
            };
            const controlling = control();
            await held.promise;
            const sending = delivery.process(messageId);
            release.release();
            await controlling;
            await assert.rejects(sending, MessageDeliveryError);
            assert.equal(sends, 0);
            assert.equal(
              (
                await connection.pool.query<{ status: string }>(
                  "SELECT status FROM app.messages WHERE id=$1",
                  [messageId],
                )
              ).rows[0]?.status,
              "FAILED",
            );
          } else {
            const markSending = repository.markSending.bind(repository);
            repository.markSending = async (...args) => {
              await markSending(...args);
              held.release();
              await release.promise;
            };
            const sending = delivery.process(messageId);
            await held.promise;
            const controlling = control();
            release.release();
            await providerEntered.promise;
            await controlling;
            assert.equal(sends, 1);
            assert.equal(
              (
                await connection.pool.query<{ status: string }>(
                  "SELECT status FROM app.messages WHERE id=$1",
                  [messageId],
                )
              ).rows[0]?.status,
              "SENDING",
            );
            finishProvider.release();
            await sending;
            await delivery.process(messageId);
            assert.equal(sends, 1);
            assert.equal(
              (
                await connection.pool.query<{ status: string }>(
                  "SELECT status FROM app.messages WHERE id=$1",
                  [messageId],
                )
              ).rows[0]?.status,
              "SENT",
            );
          }
        }
      }
    }),
);
