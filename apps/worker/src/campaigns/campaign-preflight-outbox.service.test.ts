import assert from "node:assert/strict";
import test from "node:test";
import { CampaignPreflightOutboxService } from "./campaign-preflight-outbox.service.js";

void test("preflight relay publishes an identifier-only job and completes the outbox handoff", async () => {
  const calls: string[] = [];
  let claimed = false;
  const repository = {
    claimNext: () => {
      if (claimed) return Promise.resolve(undefined);
      claimed = true;
      return Promise.resolve({ id: "event-1", preflightRunId: "run-1" });
    },
    publish: () => {
      calls.push("published");
      return Promise.resolve();
    },
    fail: () => Promise.resolve(),
  };
  const queue = {
    enqueue: (id: string) => {
      calls.push(`queued:${id}`);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  };
  const logger = { setContext: () => undefined, warn: () => undefined, error: () => undefined };
  const service = new CampaignPreflightOutboxService(
    repository as never,
    queue as never,
    true,
    logger as never,
  );
  await service.dispatch();
  assert.deepEqual(calls, ["queued:run-1", "published"]);
});

void test("preflight relay releases a claimed event when queue publication fails", async () => {
  const calls: string[] = [];
  const repository = {
    claimNext: () => Promise.resolve({ id: "event-1", preflightRunId: "run-1" }),
    publish: () => Promise.resolve(),
    fail: () => {
      calls.push("failed");
      return Promise.resolve();
    },
  };
  const queue = {
    enqueue: () => Promise.reject(new Error("redis unavailable")),
    close: () => Promise.resolve(),
  };
  const logger = { setContext: () => undefined, warn: () => undefined, error: () => undefined };
  const service = new CampaignPreflightOutboxService(
    repository as never,
    queue as never,
    true,
    logger as never,
  );
  await service.dispatch();
  assert.deepEqual(calls, ["failed"]);
});
