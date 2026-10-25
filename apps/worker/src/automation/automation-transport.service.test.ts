import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PinoLogger } from "nestjs-pino";
import type {
  AutomationTriggerService,
  AutomationExecutionService,
} from "@whatsapp-platform/api/automation-runtime";
import type {
  AutomationOutboxRepository,
  AutomationEvent,
} from "./automation-outbox.repository.js";
import type { AutomationQueue } from "./automation-queue.adapter.js";
import type { AutomationTransactionManager } from "./automation-transaction.manager.js";
import { AutomationTransportService } from "./automation-transport.service.js";

function fixture() {
  const event: AutomationEvent = { eventId: randomUUID(), targetId: randomUUID(), kind: "advance" };
  const calls: string[] = [],
    warnings: unknown[] = [];
  let claimed = false;
  const repository = {
    claim: () => Promise.resolve(claimed ? undefined : ((claimed = true), event)),
    find: () => Promise.resolve(event),
    published: () => {
      calls.push("published");
      return Promise.resolve();
    },
    failedPublication: () => {
      calls.push("publication-failed");
      return Promise.resolve();
    },
    exhausted: () => {
      calls.push("exhausted");
      return Promise.resolve();
    },
  } as unknown as AutomationOutboxRepository;
  const queue = {
    enqueue: (value: AutomationEvent) => {
      assert.deepEqual(value, event);
      calls.push("enqueue");
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  } as unknown as AutomationQueue;
  const triggers = {
    inbound: () => {
      calls.push("inbound");
      return Promise.resolve();
    },
  } as unknown as AutomationTriggerService;
  const execution = {
    advance: (targetId: string, eventId: string) => {
      assert.equal(targetId, event.targetId);
      assert.equal(eventId, event.eventId);
      calls.push("advance");
      return Promise.resolve();
    },
    fail: () => {
      calls.push("handoff");
      return Promise.resolve();
    },
  } as unknown as AutomationExecutionService;
  const logger = { warn: (value: unknown) => warnings.push(value) } as unknown as PinoLogger;
  const transactions = {} as AutomationTransactionManager;
  const service = new AutomationTransportService(
    repository,
    queue,
    triggers,
    execution,
    false,
    logger,
    transactions,
  );
  return { event, calls, warnings, repository, queue, service };
}

void test("relay publishes identifier-only event once and releases failed publication", async () => {
  const f = fixture();
  await f.service.dispatch();
  assert.deepEqual(f.calls, ["enqueue", "published"]);
  const failed = fixture();
  failed.queue.enqueue = () => Promise.reject(new Error("private queue diagnostic"));
  await failed.service.dispatch();
  assert.deepEqual(failed.calls, ["publication-failed"]);
});
void test("process and exhaustion resolve durable identity; tampered jobs cannot advance or stop another run", async () => {
  const f = fixture();
  await f.service.process(f.event);
  await f.service.exhausted(f.event);
  assert.deepEqual(f.calls, ["advance", "exhausted", "handoff"]);
  f.calls.length = 0;
  for (const tampered of [
    { ...f.event, targetId: randomUUID() },
    { ...f.event, kind: "inbound" as const },
  ]) {
    await assert.rejects(f.service.process(tampered), /AUTOMATION_EVENT_MISMATCH/u);
    await f.service.exhausted(tampered);
  }
  f.repository.find = () => Promise.resolve(undefined);
  await assert.rejects(f.service.process(f.event), /AUTOMATION_EVENT_MISMATCH/u);
  await f.service.exhausted(f.event);
  assert.deepEqual(f.calls, []);
});
void test("unexpected relay exceptions are redacted and disabled bootstrap starts no work", async () => {
  const f = fixture();
  f.service.onApplicationBootstrap();
  assert.deepEqual(f.calls, []);
  f.repository.claim = () => Promise.reject(new Error("private-message-body-secret"));
  await f.service.dispatch();
  assert.deepEqual(f.warnings, [{ event: "automation_relay_retry" }]);
  assert.doesNotMatch(JSON.stringify(f.warnings), /private-message-body-secret/u);
  await f.service.onApplicationShutdown();
});
