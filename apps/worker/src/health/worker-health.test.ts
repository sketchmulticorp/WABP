import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { PinoLogger } from "nestjs-pino";
import type { CampaignExecutionService } from "@whatsapp-platform/api/campaign-runtime";
import type { WorkerHealthRepository } from "./worker-health.repository.js";
import type { WebhookQueue } from "../webhooks/webhook.queue.js";
import { WorkerHealthService } from "./worker-health.service.js";
import { WorkerHealthController } from "./worker-health.controller.js";
import { CampaignSchedulerService } from "../campaigns/campaign-scheduler.service.js";

function health(database: () => Promise<void>, redis: () => Promise<void>) {
  return new WorkerHealthService(
    { ping: database } as unknown as WorkerHealthRepository,
    { ping: redis } as unknown as WebhookQueue,
    "fixture-worker",
  );
}
function deferred() {
  let resolve: () => void = () => {
    throw new Error("Deferred not initialized");
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
void test("readiness coalesces callers and retries after completed dependency failure", async () => {
  let count = 0,
    broken = true;
  const hold = deferred();
  const service = health(
    async () => {
      count++;
      await hold.promise;
      if (broken) throw new Error("private database detail");
    },
    () => Promise.resolve(),
  );
  const first = service.ready();
  assert.equal(service.ready(), first);
  hold.resolve();
  assert.equal(await first, false);
  assert.equal(count, 1);
  broken = false;
  assert.equal(await service.ready(), true);
  assert.equal(count, 2);
});
void test(
  "readiness deadline handles a hung dependency without waiting indefinitely",
  { timeout: 15000 },
  async () => {
    const hold = deferred();
    const service = health(
      () => hold.promise,
      () => Promise.resolve(),
    );
    const started = Date.now();
    assert.equal(await service.ready(), false);
    assert.ok(Date.now() - started < 10000);
    hold.resolve();
  },
);
void test("real health listener returns status only, enforces paths/methods and closes", async () => {
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  assert.ok(address !== null && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    reservation.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  let broken = false;
  const service = health(
    () => (broken ? Promise.reject(new Error("SECRET_MUST_NOT_LEAK")) : Promise.resolve()),
    () => Promise.resolve(),
  );
  const controller = new WorkerHealthController(service, {
    http: { port },
  } as unknown as RuntimeConfig);
  await controller.onApplicationBootstrap();
  const url = `http://127.0.0.1:${String(port)}`;
  try {
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    assert.deepEqual(await (await fetch(`${url}/health/ready`)).json(), {
      service: "fixture-worker",
      status: "ok",
    });
    broken = true;
    const response = await fetch(`${url}/health/ready`);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("SECRET"));
    assert.equal((await fetch(`${url}/health/ready`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${url}/private`)).status, 404);
  } finally {
    await controller.onApplicationShutdown();
  }
  await assert.rejects(fetch(`${url}/health/live`));
});
const logger = {
  setContext() {
    return undefined;
  },
  warn() {
    return undefined;
  },
} as unknown as PinoLogger;
void test("scheduler drains an active tick before shutdown and cannot restart afterwards", async () => {
  const entered = deferred(),
    hold = deferred();
  let advances = 0;
  const runtime = {
    candidates: () => Promise.resolve([{ tenantId: "fixture", id: "campaign" }]),
    advance: async () => {
      advances++;
      entered.resolve();
      await hold.promise;
    },
  } as unknown as CampaignExecutionService;
  const scheduler = new CampaignSchedulerService(runtime, true, logger);
  scheduler.onApplicationBootstrap();
  await entered.promise;
  let stopped = false;
  const stop = scheduler.beforeApplicationShutdown().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  hold.resolve();
  await stop;
  await scheduler.tick();
  assert.equal(advances, 1);
});
void test("deployment-disabled scheduler makes no due-work query", async () => {
  const runtime = {
    candidates: () => {
      throw new Error("scheduler should be disabled");
    },
  } as unknown as CampaignExecutionService;
  const scheduler = new CampaignSchedulerService(runtime, false, logger);
  scheduler.onApplicationBootstrap();
  await scheduler.beforeApplicationShutdown();
});
