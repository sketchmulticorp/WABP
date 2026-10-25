import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Queue, QueueEvents } from "bullmq";
import type { PinoLogger } from "nestjs-pino";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { AutomationQueue, AUTOMATION_QUEUE } from "./automation-queue.adapter.js";
import { AutomationJobProcessor } from "./automation-job.processor.js";
import type { AutomationEvent } from "./automation-outbox.repository.js";
import type { AutomationTransportService } from "./automation-transport.service.js";

void test(
  "isolated Redis retains event identity, distinct continuations, retry and terminal handoff",
  { timeout: 60000 },
  async () => {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    assert.notEqual(process.env.NODE_ENV, "production");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
    const prefix = `automation-test-${randomUUID()}`;
    assert.match(prefix, /^automation-test-[a-f0-9-]{36}$/u);
    const config = { redis: { url, queuePrefix: prefix } } as RuntimeConfig;
    const queue = new AutomationQueue(config),
      observer = new Queue<AutomationEvent>(AUTOMATION_QUEUE, { connection: { url }, prefix });
    const events = new QueueEvents(AUTOMATION_QUEUE, { connection: { url }, prefix });
    const attempts = new Map<string, number>(),
      exhausted: string[] = [],
      logs: unknown[] = [];
    const targetId = randomUUID(),
      event: AutomationEvent = { eventId: randomUUID(), targetId, kind: "advance" },
      failing: AutomationEvent = { ...event, eventId: randomUUID() };
    const service = {
      process: (value: AutomationEvent) => {
        const count = (attempts.get(value.eventId) ?? 0) + 1;
        attempts.set(value.eventId, count);
        return value.eventId === failing.eventId || count === 1
          ? Promise.reject(new Error("test failure with private content"))
          : Promise.resolve();
      },
      exhausted: (value: AutomationEvent) => {
        exhausted.push(value.eventId);
        return Promise.resolve();
      },
    } as unknown as AutomationTransportService;
    const logger = {
      warn: (value: unknown) => logs.push(value),
      error: (value: unknown) => logs.push(value),
    } as unknown as PinoLogger;
    const processor = new AutomationJobProcessor(service, config, true, logger);
    try {
      await events.waitUntilReady();
      await queue.enqueue(event);
      await queue.enqueue(event);
      await queue.enqueue(failing);
      const first = await observer.getJob(`automation-${event.eventId}`),
        second = await observer.getJob(`automation-${failing.eventId}`);
      assert.ok(first);
      assert.ok(second);
      assert.deepEqual(first.data, event);
      assert.equal(first.opts.attempts, 5);
      assert.deepEqual(first.opts.backoff, { type: "exponential", delay: 1000 });
      assert.equal(await observer.count(), 2);
      processor.onApplicationBootstrap();
      await first.waitUntilFinished(events, 30000);
      await assert.rejects(second.waitUntilFinished(events, 30000));
      assert.equal(attempts.get(event.eventId), 2);
      assert.equal(attempts.get(failing.eventId), 5);
      assert.deepEqual(exhausted, [failing.eventId]);
      assert.doesNotMatch(JSON.stringify(logs), /private content/u);
    } finally {
      await processor.onApplicationShutdown();
      await events.close();
      await queue.close();
      // Cleanup is confined to the exact validated random test prefix, never an application queue.
      await observer.obliterate({ force: true });
      await observer.close();
    }
  },
);
