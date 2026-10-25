import assert from "node:assert/strict";
import test from "node:test";

import {
  type DatabaseHealthReader,
  HealthService,
  type RedisHealthReader,
} from "./health.service.js";

const availableRedis: RedisHealthReader = { ping: () => Promise.resolve() };

void test("reports ready only when PostgreSQL responds", async () => {
  const healthReader: DatabaseHealthReader = {
    pingDatabase: () => Promise.resolve(),
  };
  const result = await new HealthService(healthReader, availableRedis).getReadiness();

  assert.equal(result.status, "ready");
  assert.deepEqual(result.checks, { configuration: "up", database: "up", redis: "up" });
});

void test("reports not ready without leaking a database error", async () => {
  const healthReader: DatabaseHealthReader = {
    pingDatabase: () => Promise.reject(new Error("secret database diagnostic")),
  };
  const result = await new HealthService(healthReader, availableRedis).getReadiness();

  assert.equal(result.status, "not_ready");
  assert.deepEqual(result.checks, { configuration: "up", database: "down", redis: "up" });
  assert.doesNotMatch(JSON.stringify(result), /secret database diagnostic/u);
});

void test("reports not ready when Redis is unavailable", async () => {
  const database: DatabaseHealthReader = { pingDatabase: () => Promise.resolve() };
  const redis: RedisHealthReader = {
    ping: () => Promise.reject(new Error("secret redis diagnostic")),
  };
  const result = await new HealthService(database, redis).getReadiness();

  assert.equal(result.status, "not_ready");
  assert.deepEqual(result.checks, { configuration: "up", database: "up", redis: "down" });
  assert.doesNotMatch(JSON.stringify(result), /secret redis diagnostic/u);
});
