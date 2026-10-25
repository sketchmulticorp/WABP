import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { AccessTokenService } from "../auth/access-token.service.js";
import {
  automationFixture,
  withAutomationDatabase,
} from "../automation/automation.test-fixture.js";

void test(
  "actual API enforces live tenant/platform permissions and emits audited raw CSV with safe JSON errors",
  { timeout: 90000 },
  async () =>
    withAutomationDatabase(async (database, connection) => {
      const f = await automationFixture(database),
        superRole = randomUUID(),
        superUser = randomUUID(),
        superSession = randomUUID(),
        tenantSession = randomUUID();
      const keys = [
        "report.read",
        "plan.read",
        "billing.read",
        "audit.read",
        "platform.dashboard.read",
        "tenant.read",
        "campaign.read",
        "campaign.export",
        "contact.read",
        "contact.export",
      ];
      await database.execute(
        sql`INSERT INTO app.roles(id,name,system_key) VALUES(${superRole},'Fixture Super Admin','SUPER_ADMIN')`,
      );
      await database.execute(
        sql`INSERT INTO app.users(id,role_id,email,display_name,password_hash,status) VALUES(${superUser},${superRole},${`${superUser}@example.test`},'Fixture Platform','not-a-password','ACTIVE')`,
      );
      for (const key of keys) {
        await database.execute(
          sql`INSERT INTO app.permissions(permission_key,description) VALUES(${key},'Phase8 fixture') ON CONFLICT DO NOTHING`,
        );
        for (const role of [f.roleId, superRole])
          await database.execute(
            sql`INSERT INTO app.role_permissions(role_id,permission_id) SELECT ${role}::uuid,id FROM app.permissions WHERE permission_key=${key} ON CONFLICT DO NOTHING`,
          );
      }
      for (const [session, user] of [
        [tenantSession, f.actorId],
        [superSession, superUser],
      ])
        await database.execute(
          sql`INSERT INTO app.auth_sessions(id,user_id,refresh_token_hash,token_family_id,expires_at) VALUES(${session},${user},${randomUUID()},${randomUUID()},now()+interval '1 hour')`,
        );
      await database.execute(
        sql`INSERT INTO app.payment_records(tenant_id,recorded_by,amount_minor,currency,paid_at,reference,note) VALUES(${f.tenantId},${superUser},123,'INR',now(),'SAFE_REF','PRIVATE_OPERATIONAL_NOTE')`,
      );
      const secret = "phase8-http-fixture-access-secret-at-least-32-characters";
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
        redisKeyPrefix: "phase8-http",
      });
      const token = signer.sign({
        sessionId: tenantSession,
        userId: f.actorId,
        tenantId: f.tenantId,
      }).token;
      const platformToken = signer.sign({
        sessionId: superSession,
        userId: superUser,
        tenantId: null,
      }).token;
      const socket = createServer();
      socket.listen(0, "127.0.0.1");
      await once(socket, "listening");
      const address = socket.address();
      assert.ok(address !== null && typeof address !== "string");
      const port = address.port;
      socket.close();
      await once(socket, "close");
      const child = spawn(process.execPath, ["dist/main.js"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          LOG_LEVEL: "info",
          PORT: String(port),
          DATABASE_URL: connection.url,
          DATABASE_POOL_MIN: "0",
          DATABASE_POOL_MAX: "3",
          REDIS_URL: "redis://localhost:6379",
          QUEUE_PREFIX: `phase8-http-${randomUUID()}`,
          JWT_ACCESS_SECRET: secret,
          REFRESH_TOKEN_PEPPER: "phase8-refresh-fixture-at-least-thirty-two-characters",
          META_APP_ID: "fixture",
          META_APP_SECRET: "phase8-fixture-never-used-secret",
          META_WEBHOOK_VERIFY_TOKEN: "phase8-fixture-no-provider",
          META_DEVELOPMENT_ACCESS_TOKEN: "",
          S3_ENDPOINT: "https://storage.example.invalid",
          S3_REGION: "fixture",
          S3_BUCKET: "fixture",
          S3_ACCESS_KEY_ID: "fixture",
          S3_SECRET_ACCESS_KEY: "fixture-secret",
          SMTP_HOST: "localhost",
          SMTP_PORT: "1025",
          SMTP_FROM: "fixture@example.test",
        },
      });
      const startupMarkers: string[] = [];
      const capture = (chunk: Buffer) => {
        const markers = chunk
          .toString()
          .match(
            /UnknownDependenciesException|ConfigurationValidationError|EADDRINUSE|MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|Nest application successfully started|Starting Nest application/gu,
          );
        if (markers !== null) startupMarkers.push(...markers);
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      const base = `http://127.0.0.1:${String(port)}`;
      try {
        let ready = false;
        let lastStatus: number | null = null;
        for (let attempt = 0; attempt < 150; attempt++) {
          assert.equal(child.exitCode, null, "Fixture API exited");
          try {
            const health = await fetch(`${base}/health/live`);
            lastStatus = health.status;
            ready = health.ok;
          } catch {
            /* Startup retry only. */
          }
          if (ready) break;
          await delay(100);
        }
        assert.ok(
          ready,
          `Fixture API failed to start (HTTP ${String(lastStatus)}; markers ${startupMarkers.join(",")})`,
        );
        const call = (path: string, body?: object, bearer = token) =>
          fetch(`${base}/api/v1${path}`, {
            headers: {
              authorization: `Bearer ${bearer}`,
              "content-type": "application/json",
              "x-request-id": "phase8-http-fixture",
            },
            ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
          });
        assert.equal((await call("/dashboard")).status, 200);
        assert.equal(
          (await call("/reports/exports", { kind: "dashboard", tenantId: randomUUID() })).status,
          400,
        );
        assert.equal((await call("/platform/reports/exports", { kind: "dashboard" })).status, 403);
        for (const kind of ["dashboard", "payments", "audit"]) {
          const response = await call("/reports/exports", { kind });
          assert.equal(response.status, 200);
          assert.ok(response.headers.get("content-type")?.startsWith("text/csv"));
          assert.equal(response.headers.get("cache-control"), "no-store");
          assert.equal(response.headers.get("x-request-id"), "phase8-http-fixture");
          assert.equal(response.headers.get("x-content-type-options"), "nosniff");
          assert.ok(response.headers.get("content-disposition")?.includes("attachment"));
          const bytes = Buffer.from(await response.arrayBuffer());
          assert.equal(bytes.length, Number(response.headers.get("content-length")));
          assert.equal(bytes.subarray(0, 3).toString("hex"), "efbbbf");
          assert.ok(!bytes.toString().includes("PRIVATE_OPERATIONAL_NOTE"));
        }
        assert.equal(
          (await call("/reports/exports", { kind: "payments" }, platformToken)).status,
          403,
        );
        assert.equal(
          (
            await call(
              "/platform/reports/exports",
              { kind: "campaign-recipients", campaignId: randomUUID() },
              platformToken,
            )
          ).status,
          400,
        );
        const platformPayment = await call(
          "/platform/reports/exports",
          { kind: "payments", businessId: f.tenantId },
          platformToken,
        );
        assert.equal(platformPayment.status, 200);
        assert.ok(!(await platformPayment.text()).includes("PRIVATE_OPERATIONAL_NOTE"));
        assert.equal(
          (await call("/platform/insights/businesses", undefined, platformToken)).status,
          200,
        );
        assert.equal(
          (
            await call(
              "/platform/reports/exports",
              { kind: "audit", filters: { tenantId: randomUUID() } },
              platformToken,
            )
          ).status,
          200,
        );
        await database.execute(
          sql`DELETE FROM app.role_permissions WHERE role_id=${f.roleId} AND permission_id IN (SELECT id FROM app.permissions WHERE permission_key='report.read')`,
        );
        const denied = await call("/reports/exports", { kind: "dashboard" });
        assert.equal(denied.status, 403);
        assert.ok(denied.headers.get("content-type")?.includes("json"));
        await database.execute(
          sql`UPDATE app.auth_sessions SET revoked_at=now() WHERE id=${tenantSession}`,
        );
        assert.equal((await call("/reports/exports", { kind: "payments" })).status, 401);
        const audits = await database.execute<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM app.audit_logs WHERE action='REPORT_EXPORT_PREPARED'`,
        );
        assert.equal(audits.rows[0]?.count, 5);
      } finally {
        if (child.exitCode === null) {
          child.kill();
          await once(child, "exit");
        }
      }
    }),
);
