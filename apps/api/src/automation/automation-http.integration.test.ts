import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { sql } from "drizzle-orm";
import { AccessTokenService } from "../auth/access-token.service.js";
import {
  automationFixture,
  linearGraph,
  withAutomationDatabase,
} from "./automation.test-fixture.js";
import { validateGraph } from "./automation.validation.js";

void test(
  "authenticated valid >100 KB graph saves, reads and publishes; HTTP guards and parser limits stay enforced",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database, connection) => {
      const f = await automationFixture(database),
        sessionId = randomUUID();
      const secret = "automation-http-test-secret-at-least-thirty-two-characters";
      const signer = new AccessTokenService({
        accessSecret: secret,
        accessTtlSeconds: 900,
        allowedOrigins: [],
        cookieSecure: false,
        loginEmailLimit: 10,
        loginIpLimit: 10,
        loginWindowSeconds: 60,
        refreshPepper: "fixture",
        refreshTtlSeconds: 3600,
        redisKeyPrefix: "automation-http-test",
      });
      await database.execute(sql`INSERT INTO app.auth_sessions(id,user_id,refresh_token_hash,token_family_id,expires_at)
      VALUES (${sessionId},${f.actorId},${randomUUID()},${randomUUID()},now()+interval '1 hour')`);
      const token = signer.sign({ sessionId, userId: f.actorId, tenantId: f.tenantId }).token;
      const server = createServer();
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address !== null && typeof address !== "string");
      const port = address.port;
      server.close();
      await once(server, "close");
      const child = spawn(process.execPath, ["dist/main.js"], {
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: connection.url,
          PORT: String(port),
          LOG_LEVEL: "error",
          JWT_ACCESS_SECRET: secret,
          META_APP_SECRET: "local-automation-webhook-secret",
          META_WEBHOOK_VERIFY_TOKEN: "local-automation-token",
          REFRESH_TOKEN_PEPPER: "local-test-refresh-pepper-at-least-thirty-two-characters",
          REDIS_URL: "redis://localhost:6379",
        },
        stdio: "ignore",
      });
      const base = `http://127.0.0.1:${String(port)}`;
      try {
        let ready = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          assert.equal(child.exitCode, null, "Fixture API exited during startup");
          try {
            ready = (await fetch(`${base}/health/live`)).ok;
          } catch {
            /* Bounded local startup. */
          }
          if (ready) break;
          await delay(100);
        }
        assert.ok(ready, "Fixture API did not start");
        const call = (path: string, body?: object, bearer = token) =>
          fetch(`${base}/api/v1${path}`, {
            headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
            ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
          });
        const graph = linearGraph(
          f.accountId,
          Array.from({ length: 28 }, (_, index) => ({
            key: `message${String(index)}`,
            type: "MESSAGE" as const,
            config: { text: "x".repeat(4096) },
          })),
        );
        assert.deepEqual(validateGraph(graph), []);
        const input = { name: "Large valid HTTP graph", graph };
        assert.ok(Buffer.byteLength(JSON.stringify(input)) > 102400);
        const response = await call("/automations", input);
        assert.equal(response.status, 201);
        const saved: unknown = await response.json();
        assert.ok(typeof saved === "object" && saved !== null && "data" in saved);
        const data = saved.data;
        assert.ok(typeof data === "object" && data !== null && "id" in data && "revision" in data);
        assert.equal(typeof data.id, "string");
        assert.equal(typeof data.revision, "string");
        const path = `/automations/${String(data.id)}`;
        const read = await call(path);
        assert.equal(read.status, 200);
        assert.equal(Buffer.byteLength(await read.text()) > 102400, true);
        assert.equal(
          (await call(`${path}/publish`, { expectedRevision: data.revision })).status,
          200,
        );
        assert.equal((await call(`/automations/${randomUUID()}`)).status, 404);
        assert.equal((await call(path, undefined, "invalid-token")).status, 401);
        assert.equal(
          (await call("/automations", { ...input, tenantId: randomUUID() })).status,
          400,
        );
        assert.equal(
          (await call("/automations", { name: "oversized", text: "x".repeat(2100000) })).status,
          413,
        );
        assert.equal((await call("/auth/login", { text: "x".repeat(120000) })).status, 413);
        const count = await database.execute<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM app.messages WHERE tenant_id=${f.tenantId}::uuid AND direction='OUTBOUND'`,
        );
        assert.equal(count.rows[0]?.count, 0);
        await database.execute(
          sql`UPDATE app.auth_sessions SET revoked_at=now() WHERE id=${sessionId}::uuid`,
        );
        assert.equal((await call(path)).status, 401);
      } finally {
        if (child.exitCode === null) {
          child.kill();
          await once(child, "exit");
        }
      }
    }),
);
