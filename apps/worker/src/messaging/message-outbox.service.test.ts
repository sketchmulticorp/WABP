import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { PinoLogger } from "nestjs-pino";

import type { MessageOutboxRepository } from "./message-outbox.repository.js";
import { MessageOutboxService } from "./message-outbox.service.js";
import type { MessageQueue } from "./message.queue.js";

const event = {
  id: "f966f247-f65d-4109-9bdd-e71c7f6bb55c",
  messageId: "5af939b3-4022-48ef-8c65-a101c3c3799c",
};

void test("publishes an identifier-only message job and completes its durable handoff", async () => {
  const calls: string[] = [];
  let claimed = false;
  const repository = {
    claimNext: () => Promise.resolve(claimed ? undefined : ((claimed = true), event)),
    publish: () => {
      calls.push("publish");
      return Promise.resolve();
    },
    fail: () => Promise.resolve(),
  } as unknown as MessageOutboxRepository;
  const queue = {
    enqueue: (messageId: string) => {
      calls.push(`enqueue:${messageId}`);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  } as unknown as MessageQueue;

  await service(repository, queue).dispatchAvailable();
  assert.deepEqual(calls, [`enqueue:${event.messageId}`, "publish"]);
});

void test("releases a claimed event for retry when BullMQ publication fails", async () => {
  const failed: string[] = [];
  let claimed = false;
  const repository = {
    claimNext: () => Promise.resolve(claimed ? undefined : ((claimed = true), event)),
    publish: () => Promise.resolve(),
    fail: (id: string) => {
      failed.push(id);
      return Promise.resolve();
    },
  } as unknown as MessageOutboxRepository;
  const queue = {
    enqueue: () => Promise.reject(new Error("Redis unavailable")),
    close: () => Promise.resolve(),
  } as unknown as MessageQueue;

  await service(repository, queue).dispatchAvailable();
  assert.deepEqual(failed, [event.id]);
});

function service(repository: MessageOutboxRepository, queue: MessageQueue): MessageOutboxService {
  const config = {
    messaging: { outboxLockTimeoutSeconds: 60, queueConcurrency: 10, relayPollIntervalMs: 1_000 },
  } as unknown as RuntimeConfig;
  const logger = {
    error: () => undefined,
    setContext: () => undefined,
    warn: () => undefined,
  } as unknown as PinoLogger;
  return new MessageOutboxService(repository, queue, config, logger);
}
