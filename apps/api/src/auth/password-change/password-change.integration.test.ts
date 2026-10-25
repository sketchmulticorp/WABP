import "reflect-metadata";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { loadApiRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { AppModule } from "../../app.module.js";
import { PlatformRepository } from "../../platform/platform.repository.js";
import { PlatformService } from "../../platform/platform.service.js";
import { PlatformInsightsService } from "../../insights/platform-insights.service.js";
import { PlatformInsightsRepository } from "../../insights/platform-insights.repository.js";
import { TenantRoleProvisioningService } from "../../authorization/tenant-role-provisioning.service.js";
import { SeedRepository } from "../../database/seed/seed.repository.js";
import {
  TENANT_ADMIN_PERMISSION_KEYS,
  TENANT_USER_PERMISSION_KEYS,
} from "../../database/seed/seed.catalog.js";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import { TenantScopeService } from "../../authorization/authorization.service.js";
import { UserService } from "../../users/user.service.js";
import { WHATSAPP_PROVIDER } from "../../whatsapp/whatsapp-provider.constants.js";
import type { WhatsAppProvider } from "../../whatsapp/whatsapp-provider.types.js";
import { MetaEmbeddedSignupAdapter } from "../../whatsapp/signup/meta-embedded-signup.adapter.js";
import { ProviderCredentialService } from "@whatsapp-platform/whatsapp-provider";
import { UserRepository } from "../../users/user.repository.js";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { AccessTokenService } from "../access-token.service.js";
import { AuthRepository } from "../auth.repository.js";
import { AuthService } from "../auth.service.js";
import type { AuthModuleConfig } from "../auth.types.js";
import { RefreshTokenService } from "../refresh-token.service.js";
import { LoginRateLimiterAdapter } from "../login-rate-limiter.adapter.js";
import { AuthorizationRepository } from "../../authorization/authorization.repository.js";
import { AuthorizationService } from "../../authorization/authorization.service.js";
import { Argon2idPasswordHasher } from "../../common/security/password-hasher.js";
import { createDatabaseClient, createDatabasePool } from "../../database/database.client.js";
import { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import { createRedisClient } from "../../redis/redis.client.js";
import { PasswordChangeRepository } from "./password-change.repository.js";
import { PasswordChangeService } from "./password-change.service.js";
import { SuperAdminService } from "../../platform/super-admin/super-admin.service.js";
import { SuperAdminRepository } from "../../platform/super-admin/super-admin.repository.js";

// Intentionally no .env fallback: this suite can touch only its named disposable DB.
const expectedUrl = "postgresql://password_test:disposable_test_only@127.0.0.1:55439/password_test";
assert.equal(
  process.env.PASSWORD_TEST_DATABASE_URL,
  expectedUrl,
  "Set PASSWORD_TEST_DATABASE_URL to the documented disposable test URL, never the application DB",
);
const pool = createDatabasePool({ url: expectedUrl, poolMax: 10, poolMin: 0 });
const database = createDatabaseClient(pool);
const redis = createRedisClient("redis://127.0.0.1:56439");
const transactions = new DatabaseTransactionManager(database);
const hasher = new Argon2idPasswordHasher();
const config: AuthModuleConfig = {
  accessSecret: "disposable-access-secret-at-least-thirty-two-characters",
  refreshPepper: "disposable-refresh-pepper-at-least-thirty-two-characters",
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3600,
  cookieSecure: false,
  allowedOrigins: ["http://localhost:3000"],
  loginEmailLimit: 100,
  loginIpLimit: 1000,
  loginWindowSeconds: 60,
  redisKeyPrefix: `password-test:${randomUUID()}`,
};
const repository = new AuthRepository(database);
const limiter = new LoginRateLimiterAdapter(redis, config);
const tokens = new AccessTokenService(config);
const auth = new AuthService(
  repository,
  transactions,
  hasher,
  tokens,
  new RefreshTokenService(config),
  limiter,
  config,
);
const authorization = new AuthorizationService(new AuthorizationRepository(database), tokens);
const change = new PasswordChangeService(
  new PasswordChangeRepository(database),
  repository,
  transactions,
  hasher,
  limiter,
);
const request = { ipAddress: "127.0.0.1", requestId: "password-integration", userAgent: "test" };
const temporary = "Temporary!Password123";
const replacement = "Replacement!Password456";
const migrationFolder = resolve(import.meta.dirname, "../../../database/migrations");

after(async () => {
  redis.disconnect();
  await pool.end();
});

async function fixture(required = true) {
  const userId = randomUUID();
  const tenantId = randomUUID();
  const roleId = randomUUID();
  const email = `${userId}@example.test`;
  await pool.query("insert into app.tenants(id,name,slug,status) values($1,'Test',$2,'ACTIVE')", [
    tenantId,
    `test-${tenantId}`,
  ]);
  await pool.query(
    "insert into app.roles(id,tenant_id,name,system_key,is_system) values($1,$2,'Tenant User','TENANT_USER',true)",
    [roleId, tenantId],
  );
  await pool.query(
    `insert into app.users(id,home_tenant_id,role_id,email,password_hash,display_name,status,must_change_password)
    values($1,$2,$3,$4,$5,'Test','ACTIVE',$6)`,
    [userId, tenantId, roleId, email, await hasher.hash(temporary), required],
  );
  await pool.query(
    "insert into app.user_tenant_scopes(user_id,tenant_id,role_id) values($1,$2,$3)",
    [userId, tenantId, roleId],
  );
  const login = await auth.login({ email, password: temporary }, request);
  const context = await authorization.authenticate(
    `Bearer ${login.accessToken}`,
    request.requestId,
    true,
  );
  return { userId, tenantId, email, login, context };
}

async function state(userId: string) {
  const user = await pool.query<{
    password_hash: string;
    must_change_password: boolean;
    token_version: number;
  }>("select password_hash,must_change_password,token_version from app.users where id=$1", [
    userId,
  ]);
  const sessions = await pool.query<{ active: number }>(
    "select count(*)::int as active from app.auth_sessions where user_id=$1 and revoked_at is null",
    [userId],
  );
  const audit = await pool.query<{ metadata: unknown }>(
    "select metadata from app.audit_logs where actor_id=$1 and action='INITIAL_PASSWORD_CHANGED'",
    [userId],
  );
  const savedUser = user.rows[0];
  const sessionCount = sessions.rows[0];
  assert.ok(savedUser);
  assert.ok(sessionCount);
  return { user: savedUser, active: sessionCount.active, audit: audit.rows };
}

function platformService() {
  const persistence = new PlatformRepository(database);
  return new PlatformService(
    persistence,
    transactions,
    hasher,
    new PlatformInsightsService(new PlatformInsightsRepository(database), persistence),
    new TenantRoleProvisioningService(new SeedRepository()),
  );
}

async function ownerContext(): Promise<AuthorizationContext> {
  const result = await pool.query<{ id: string; role_id: string }>(
    "select id,role_id from app.users where email='existing@example.test'",
  );
  const owner = result.rows[0];
  assert.ok(owner);
  return {
    actorId: owner.id,
    roleId: owner.role_id,
    roleName: "Super Admin",
    roleSystemKey: "SUPER_ADMIN",
    email: "existing@example.test",
    isPlatformActor: true,
    tenantId: null,
    permissions: new Set(["tenant.manage"]),
    requestId: "provisioning-test",
    sessionId: randomUUID(),
  };
}

function businessInput() {
  const id = randomUUID();
  return {
    adminEmail: `created-${id}@example.test`,
    adminDisplayName: "Created Admin",
    adminTemporaryPassword: temporary,
    defaultCountryCode: "IN",
    defaultTimezone: "Asia/Kolkata",
    name: "Created Clinic",
    slug: `created-${id}`,
  };
}

async function signIn(email: string, password: string, allowPending = true) {
  const session = await auth.login({ email, password }, request);
  return authorization.authenticate(`Bearer ${session.accessToken}`, "provisioning", allowPending);
}

async function finishHandover(email: string) {
  const pending = await signIn(email, temporary);
  assert.equal(pending.passwordChangeRequired, true);
  await change.complete(pending, { currentPassword: temporary, newPassword: replacement });
  return signIn(email, replacement, false);
}

void test("password handover against disposable PostgreSQL and Redis", async (suite) => {
  await redis.connect();
  await suite.test(
    "runtime migrator preserves existing users and is idempotent with 35 tables",
    async () => {
      const empty = await pool.query<{ count: number }>(
        "select count(*)::int as count from pg_tables where schemaname='app'",
      );
      assert.equal(empty.rows[0]?.count, 0, "Requires a fresh disposable container");
      // A temporary migration fixture exercises the real 9 -> 10 migration boundary.
      const folder = await mkdtemp(resolve(tmpdir(), "password-migrations-"));
      try {
        await cp(migrationFolder, folder, { recursive: true });
        const journalPath = resolve(folder, "meta/_journal.json");
        const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: unknown[] };
        journal.entries = journal.entries.slice(0, 9);
        await writeFile(journalPath, JSON.stringify(journal));
        await migrate(database, { migrationsFolder: folder });
        const role = randomUUID();
        const user = randomUUID();
        await pool.query(
          "insert into app.roles(id,name,system_key,is_system) values($1,'Super Admin','SUPER_ADMIN',true)",
          [role],
        );
        await pool.query(
          "insert into app.users(id,role_id,email,password_hash,display_name,status) values($1,$2,'existing@example.test','old-hash','Existing','ACTIVE')",
          [user, role],
        );
        await migrate(database, { migrationsFolder: migrationFolder });
        await migrate(database, { migrationsFolder: migrationFolder });
        const existing = await pool.query<{ must_change_password: boolean }>(
          "select must_change_password from app.users where id=$1",
          [user],
        );
        assert.equal(existing.rows[0]?.must_change_password, false);
        const counts =
          await pool.query(`select (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
        (select count(*)::int from pg_tables where schemaname='app') as tables`);
        assert.deepEqual(counts.rows, [{ migrations: 11, tables: 35 }]);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  );

  for (const mode of ["preview", "full"] as const) {
    await suite.test(
      `${mode} partner Super Admin HTTP creation, identity safety and password handover`,
      async () => {
        // Only this suite's fresh disposable database is reachable (guarded above).
        await pool.query(
          "update app.users set password_hash=$1 where email='existing@example.test'",
          [await hasher.hash(temporary)],
        );
        const owner = await ownerContext();
        await pool.query(
          "insert into app.permissions(permission_key,description) values('user.invite','Test invite') on conflict(permission_key) do nothing",
        );
        await pool.query(
          "insert into app.role_permissions(role_id,permission_id) select $1,id from app.permissions where permission_key='user.invite' on conflict do nothing",
          [owner.roleId],
        );
        const ownerLogin = await auth.login({ email: owner.email, password: temporary }, request);
        const ownerLive = await authorization.authenticate(
          `Bearer ${ownerLogin.accessToken}`,
          "partner-tests",
        );
        const app = await NestFactory.create(
          AppModule.register(
            loadApiRuntimeConfig({
              APP_MODE: mode,
              NODE_ENV: "test",
              DATABASE_URL: expectedUrl,
              REDIS_URL: "redis://127.0.0.1:56439",
              LOG_LEVEL: "fatal",
              JWT_ACCESS_SECRET: config.accessSecret,
              REFRESH_TOKEN_PEPPER: config.refreshPepper,
              CORS_ALLOWED_ORIGINS: "http://localhost:3000",
              AUTH_LOGIN_EMAIL_LIMIT: "100",
              AUTH_LOGIN_IP_LIMIT: "1000",
              QUEUE_PREFIX: `partner-${mode}-${randomUUID()}`,
              BOOTSTRAP_SECRET: "disposable-bootstrap-secret-at-least-thirty-two",
              S3_ACCESS_KEY_ID: "disposable",
              S3_SECRET_ACCESS_KEY: "disposable",
              S3_BUCKET: "disposable",
              S3_ENDPOINT: "http://127.0.0.1:59999",
              S3_REGION: "us-east-1",
              S3_FORCE_PATH_STYLE: "true",
              SMTP_HOST: "127.0.0.1",
              SMTP_PORT: "59998",
              SMTP_FROM: "test@example.test",
              META_APP_SECRET: "disposable-app-secret",
              META_WEBHOOK_VERIFY_TOKEN: "disposable-webhook-token",
            }),
          ),
          { logger: false, abortOnError: false },
        );
        app.setGlobalPrefix("api/v1");
        await app.listen(0, "127.0.0.1");
        const base = `${await app.getUrl()}/api/v1`;
        const candidate = () => ({
          display_name: "Partner",
          email: `partner-${randomUUID()}@example.test`,
          initial_password: temporary,
        });
        const call = (
          path: string,
          payload: unknown,
          token = ownerLogin.accessToken,
          origin = "http://localhost:3000",
        ) =>
          fetch(`${base}${path}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
              origin,
            },
            body: JSON.stringify(payload),
          });
        const endpoint = "/platform/super-admins";
        try {
          assert.equal((await call(endpoint, candidate(), "")).status, 401);
          assert.equal(
            (await call(endpoint, candidate(), ownerLogin.accessToken, "https://foreign.example"))
              .status,
            403,
          );
          assert.equal((await call(endpoint, { ...candidate(), role: "SUPER_ADMIN" })).status, 400);
          assert.equal(
            (await call(endpoint, { ...candidate(), initial_password: "weak" })).status,
            400,
          );
          const tenant = await fixture(false);
          assert.equal((await call(endpoint, candidate(), tenant.login.accessToken)).status, 403);
          const payload = candidate();
          const createdResponse = await call(endpoint, payload);
          assert.equal(createdResponse.status, 201);
          const createdBody = await createdResponse.text();
          assert.equal(createdBody.includes(temporary), false);
          assert.equal(createdBody.includes("password_hash"), false);
          const created = JSON.parse(createdBody) as {
            data: { user: { id: string; role: string; password_change_required: boolean } };
          };
          assert.equal(created.data.user.role, "SUPER_ADMIN");
          assert.equal(created.data.user.password_change_required, true);
          const partnerId = created.data.user.id;
          const stored = await pool.query<{
            home_tenant_id: null;
            role_id: string;
            must_change_password: boolean;
            password_hash: string;
          }>(
            "select home_tenant_id,role_id,must_change_password,password_hash from app.users where id=$1",
            [partnerId],
          );
          assert.equal(stored.rows[0]?.home_tenant_id, null);
          assert.equal(stored.rows[0].role_id, owner.roleId);
          assert.equal(stored.rows[0].must_change_password, true);
          assert.equal(await hasher.verify(temporary, stored.rows[0].password_hash), true);
          assert.equal(
            (
              await pool.query("select id from app.user_tenant_scopes where user_id=$1", [
                partnerId,
              ])
            ).rowCount,
            0,
          );
          assert.equal((await call(endpoint, payload)).status, 409);
          const tenantEmail = tenant.email;
          assert.equal((await call(endpoint, { ...candidate(), email: tenantEmail })).status, 409);
          await pool.query("update app.users set is_deleted=true,deleted_at=now() where id=$1", [
            tenant.userId,
          ]);
          assert.equal((await call(endpoint, { ...candidate(), email: tenantEmail })).status, 409);
          const pending = await auth.login({ email: payload.email, password: temporary }, request);
          const other = await auth.login({ email: payload.email, password: temporary }, request);
          const identity = await fetch(`${base}/me`, {
            headers: { authorization: `Bearer ${pending.accessToken}` },
          });
          assert.equal(identity.status, 200);
          const me = (await identity.json()) as {
            data: { permissions: unknown[]; tenant: unknown; password_change_required: boolean };
          };
          assert.deepEqual(me.data.permissions, []);
          assert.equal(me.data.tenant, null);
          assert.equal(me.data.password_change_required, true);
          assert.equal((await call(endpoint, candidate(), pending.accessToken)).status, 403);
          const handover = "/auth/change-initial-password";
          assert.equal(
            (
              await call(
                handover,
                { current_password: "wrong", new_password: replacement },
                pending.accessToken,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                handover,
                { current_password: temporary, new_password: temporary },
                pending.accessToken,
              )
            ).status,
            400,
          );
          const changed = await call(
            handover,
            { current_password: temporary, new_password: replacement },
            pending.accessToken,
          );
          assert.equal(changed.status, 200);
          assert.match(changed.headers.get("set-cookie") ?? "", /Max-Age=0/u);
          await assert.rejects(() =>
            authorization.authenticate(`Bearer ${pending.accessToken}`, "old"),
          );
          await assert.rejects(() =>
            authorization.authenticate(`Bearer ${other.accessToken}`, "old-other"),
          );
          await assert.rejects(() => auth.refresh(other.refreshToken, request));
          await assert.rejects(() =>
            auth.login({ email: payload.email, password: temporary }, request),
          );
          const ready = await signIn(payload.email, replacement, false);
          assert.equal(ready.roleSystemKey, "SUPER_ADMIN");
          assert.equal(ready.tenantId, null);
          const partnerLogin = await auth.login(
            { email: payload.email, password: replacement },
            request,
          );
          assert.equal(
            (
              await fetch(`${base}/contacts`, {
                headers: { authorization: `Bearer ${partnerLogin.accessToken}` },
              })
            ).status,
            403,
          );
          const saved = await state(partnerId);
          assert.equal(saved.user.token_version, 2);
          assert.equal(saved.audit.length, 1);
          const audit = await pool.query<{ metadata: unknown }>(
            "select metadata from app.audit_logs where action='SUPER_ADMIN_CREATED' and entity_id=$1",
            [partnerId],
          );
          assert.deepEqual(audit.rows[0]?.metadata, {
            role: "SUPER_ADMIN",
            password_change_required: true,
          });
          const duplicate = candidate();
          const outcomes = await Promise.all([
            call(endpoint, duplicate),
            call(endpoint, duplicate),
          ]);
          assert.deepEqual(outcomes.map((r) => r.status).sort(), [201, 409]);
          const rollback = candidate();
          await pool.query(
            "create function app.fail_partner_audit() returns trigger language plpgsql as $$ begin if NEW.action='SUPER_ADMIN_CREATED' then raise exception 'synthetic audit failure'; end if; return NEW; end $$",
          );
          await pool.query(
            "create trigger fail_partner_audit before insert on app.audit_logs for each row execute function app.fail_partner_audit()",
          );
          try {
            assert.equal((await call(endpoint, rollback)).status, 503);
            assert.equal(
              (await pool.query("select id from app.users where email=$1", [rollback.email]))
                .rowCount,
              0,
            );
          } finally {
            await pool.query("drop trigger fail_partner_audit on app.audit_logs");
            await pool.query("drop function app.fail_partner_audit()");
          }
          const bootstrap = await fetch(`${base}/bootstrap/super-admin`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-bootstrap-secret": "disposable-bootstrap-secret-at-least-thirty-two",
            },
            body: JSON.stringify({
              email: `bootstrap-${randomUUID()}@example.test`,
              password: temporary,
            }),
          });
          assert.equal(bootstrap.status, 409);
          // Service must recheck session state even with a previously authorized context.
          const service = new SuperAdminService(
            new SuperAdminRepository(),
            transactions,
            hasher,
            limiter,
            repository,
          );
          const stale = await auth.login({ email: owner.email, password: temporary }, request);
          const staleContext = await authorization.authenticate(
            `Bearer ${stale.accessToken}`,
            "stale",
          );
          await pool.query("update app.auth_sessions set revoked_at=now() where id=$1", [
            staleContext.sessionId,
          ]);
          await assert.rejects(
            () =>
              service.create(staleContext, {
                email: `stale-${randomUUID()}@example.test`,
                displayName: "No",
                initialPassword: temporary,
              }),
            { message: "SUPER_ADMIN_FORBIDDEN" },
          );
          assert.equal((await state(ownerLive.actorId)).user.must_change_password, false);
        } finally {
          await app.close();
        }
      },
    );
  }

  await suite.test(
    "revokes all sessions atomically; old credentials fail and new login succeeds",
    async () => {
      const item = await fixture();
      const other = await auth.login({ email: item.email, password: temporary }, request);
      await assert.rejects(() =>
        authorization.authenticate(`Bearer ${item.login.accessToken}`, "blocked"),
      );
      await change.complete(item.context, { currentPassword: temporary, newPassword: replacement });
      const saved = await state(item.userId);
      assert.equal(saved.user.must_change_password, false);
      assert.equal(saved.user.token_version, 2);
      assert.equal(saved.active, 0);
      assert.deepEqual(saved.audit, [{ metadata: { all_sessions_revoked: true } }]);
      assert.equal(await hasher.verify(replacement, saved.user.password_hash), true);
      assert.equal(await hasher.verify(temporary, saved.user.password_hash), false);
      for (const session of [item.login, other]) {
        await assert.rejects(() => auth.refresh(session.refreshToken, request));
        await assert.rejects(() =>
          authorization.authenticate(`Bearer ${session.accessToken}`, "old"),
        );
      }
      await assert.rejects(() => auth.login({ email: item.email, password: temporary }, request));
      const fresh = await auth.login({ email: item.email, password: replacement }, request);
      const context = await authorization.authenticate(`Bearer ${fresh.accessToken}`, "fresh");
      assert.equal(context.passwordChangeRequired, false);
    },
  );

  await suite.test(
    "audit insert failure rolls back hash, flag, version and session revocations",
    async () => {
      const item = await fixture();
      const before = await state(item.userId);
      await pool.query(`create function app.fail_password_test_audit() returns trigger language plpgsql as $$
      begin if NEW.action='INITIAL_PASSWORD_CHANGED' then raise exception 'injected audit failure'; end if; return NEW; end $$`);
      await pool.query(
        "create trigger password_test_audit before insert on app.audit_logs for each row execute function app.fail_password_test_audit()",
      );
      try {
        await assert.rejects(
          () =>
            change.complete(item.context, { currentPassword: temporary, newPassword: replacement }),
          { message: "PASSWORD_CHANGE_UNAVAILABLE" },
        );
        assert.deepEqual(await state(item.userId), before);
      } finally {
        await pool.query("drop trigger password_test_audit on app.audit_logs");
        await pool.query("drop function app.fail_password_test_audit()");
      }
    },
  );

  await suite.test(
    "concurrent old-password login and refresh cannot escape revocation",
    async () => {
      const item = await fixture();
      const other = await auth.login({ email: item.email, password: temporary }, request);
      const blocker = await pool.connect();
      try {
        await blocker.query("begin");
        await blocker.query(
          "select pg_advisory_xact_lock(hashtext('auth-user-credentials:v1'),hashtext($1))",
          [item.userId],
        );
        const pending = [
          change.complete(item.context, { currentPassword: temporary, newPassword: replacement }),
          auth.login({ email: item.email, password: temporary }, request),
          auth.refresh(other.refreshToken, request),
        ];
        // Observe real advisory-lock contention rather than relying on a timed sleep.
        let waiters = 0;
        for (let attempt = 0; attempt < 200; attempt++) {
          const result = await pool.query<{ count: number }>(
            "select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event='advisory'",
          );
          waiters = result.rows[0]?.count ?? 0;
          if (waiters >= 3) break;
          await new Promise((done) => setTimeout(done, 25));
        }
        await blocker.query("commit");
        const outcomes = await Promise.allSettled(pending);
        assert.equal(waiters, 3, "All three requests must overlap at the database lock");
        assert.equal(outcomes[0]?.status, "fulfilled");
        assert.equal((await state(item.userId)).active, 0);
        assert.equal((await state(item.userId)).audit.length, 1);
      } finally {
        await blocker.query("rollback");
        blocker.release();
      }
    },
  );

  await suite.test("duplicate concurrent password changes commit exactly once", async () => {
    const item = await fixture();
    const outcomes = await Promise.allSettled([
      change.complete(item.context, { currentPassword: temporary, newPassword: replacement }),
      change.complete(item.context, { currentPassword: temporary, newPassword: replacement }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const saved = await state(item.userId);
    assert.equal(saved.user.token_version, 2);
    assert.equal(saved.active, 0);
    assert.equal(saved.audit.length, 1);
  });

  for (const mode of ["preview", "full"] as const) {
    await suite.test(`${mode} HTTP guards, restricted me, cookie expiry and handover`, async () => {
      const runtime = loadApiRuntimeConfig({
        APP_MODE: mode,
        NODE_ENV: "test",
        DATABASE_URL: expectedUrl,
        REDIS_URL: "redis://127.0.0.1:56439",
        LOG_LEVEL: "fatal",
        JWT_ACCESS_SECRET: config.accessSecret,
        REFRESH_TOKEN_PEPPER: config.refreshPepper,
        CORS_ALLOWED_ORIGINS: "http://localhost:3000",
        S3_ACCESS_KEY_ID: "disposable",
        S3_SECRET_ACCESS_KEY: "disposable",
        S3_BUCKET: "disposable",
        S3_ENDPOINT: "http://127.0.0.1:59999",
        S3_REGION: "us-east-1",
        S3_FORCE_PATH_STYLE: "true",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "59998",
        SMTP_FROM: "test@example.test",
        META_APP_SECRET: "disposable-app-secret",
        META_WEBHOOK_VERIFY_TOKEN: "disposable-webhook-token",
      });
      const app = await NestFactory.create(AppModule.register(runtime), {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      try {
        const item = await fixture();
        const base = `${await app.getUrl()}/api/v1`;
        const headers = {
          authorization: `Bearer ${item.login.accessToken}`,
          "content-type": "application/json",
          origin: "http://localhost:3000",
        };
        const me = await fetch(`${base}/me`, { headers });
        assert.equal(me.status, 200);
        const identity = (await me.json()) as {
          data: {
            password_change_required: boolean;
            permissions: unknown[];
            tenant: unknown;
            subscription: unknown;
          };
        };
        assert.equal(identity.data.password_change_required, true);
        assert.deepEqual(identity.data.permissions, []);
        assert.equal(identity.data.tenant, null);
        assert.equal(identity.data.subscription, null);
        for (const path of [
          "/contacts",
          "/groups",
          "/me/sessions",
          "/users",
          "/platform/tenants",
        ]) {
          const denied = await fetch(`${base}${path}`, { headers });
          assert.equal(denied.status, 403, path);
          const body = (await denied.json()) as { error: { code: string } };
          assert.equal(body.error.code, "PASSWORD_CHANGE_REQUIRED", path);
        }
        const endpoint = `${base}/auth/change-initial-password`;
        const body = JSON.stringify({ current_password: temporary, new_password: replacement });
        assert.equal(
          (
            await fetch(endpoint, {
              method: "POST",
              headers: { ...headers, origin: "https://foreign.example" },
              body,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await fetch(endpoint, {
              method: "POST",
              headers,
              body: JSON.stringify({
                current_password: temporary,
                new_password: replacement,
                role: "SUPER_ADMIN",
              }),
            })
          ).status,
          400,
        );
        const changed = await fetch(endpoint, { method: "POST", headers, body });
        assert.equal(changed.status, 200);
        const cookie = changed.headers.get("set-cookie") ?? "";
        assert.match(cookie, /Max-Age=0/u);
        assert.match(cookie, /HttpOnly/u);
        assert.match(cookie, /SameSite=Strict/u);
        assert.match(cookie, /Path=\/api\/v1\/auth/u);
        assert.equal((await fetch(`${base}/me`, { headers })).status, 401);
        const login = await fetch(`${base}/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: item.email, password: replacement }),
        });
        assert.equal(login.status, 200);
      } finally {
        await app.close();
      }
    });
  }

  await suite.test(
    "new business/Admin creation can reach the mandatory-password flow",
    async () => {
      // Mirrors bootstrap's catalog: Super Admin exists, no global tenant roles are fabricated.
      const created = await platformService().createTenant(await ownerContext(), businessInput());
      const admin = await finishHandover(created.admin.email);
      assert.equal(admin.tenantId, created.tenant.id);
      assert.deepEqual([...admin.permissions].sort(), [...TENANT_ADMIN_PERMISSION_KEYS].sort());
      const users = new UserService(
        new UserRepository(database),
        transactions,
        new TenantScopeService(),
        hasher,
      );
      const email = `team-${randomUUID()}@example.test`;
      const member = await users.create(admin, {
        email,
        displayName: "Team User",
        initialPassword: temporary,
      });
      const memberContext = await finishHandover(email);
      assert.equal(memberContext.tenantId, admin.tenantId);
      assert.deepEqual(
        [...memberContext.permissions].sort(),
        [...TENANT_USER_PERMISSION_KEYS].sort(),
      );
      assert.equal(memberContext.permissions.has("campaign.approve"), false);
      assert.equal(memberContext.permissions.has("platform.dashboard.read"), false);
      await users.remove(admin, member.user.id);
      const restored = await users.create(admin, {
        email,
        displayName: "Restored User",
        initialPassword: temporary,
      });
      assert.equal(restored.user.id, member.user.id);
      const restoredContext = await signIn(email, temporary, false);
      assert.equal(restoredContext.passwordChangeRequired, false);
    },
  );

  await suite.test(
    "foreign roles cannot authenticate and Team lookup never falls back across tenants",
    async () => {
      const service = platformService();
      const owner = await ownerContext();
      const first = await service.createTenant(owner, businessInput());
      const second = await service.createTenant(owner, businessInput());
      const firstAdmin = await finishHandover(first.admin.email);
      const secondAdmin = await finishHandover(second.admin.email);
      const firstRole = await transactions.execute((transaction) =>
        new UserRepository(database).findSystemTenantUserRole(transaction, first.tenant.id),
      );
      const secondRole = await transactions.execute((transaction) =>
        new UserRepository(database).findSystemTenantUserRole(transaction, second.tenant.id),
      );
      assert.notEqual(firstRole.id, secondRole.id);
      const users = new UserService(
        new UserRepository(database),
        transactions,
        new TenantScopeService(),
        hasher,
      );
      const email = `foreign-${randomUUID()}@example.test`;
      const created = await users.create(firstAdmin, {
        email,
        displayName: "First User",
        initialPassword: temporary,
      });
      const session = await auth.login({ email, password: temporary }, request);
      // Corrupt a disposable fixture's role and membership to prove the live guard fails closed.
      await pool.query("update app.users set role_id=$1 where id=$2", [
        secondRole.id,
        created.user.id,
      ]);
      await pool.query("update app.user_tenant_scopes set role_id=$1 where user_id=$2", [
        secondRole.id,
        created.user.id,
      ]);
      await assert.rejects(() => signIn(email, temporary));
      await assert.rejects(() =>
        authorization.authenticate(`Bearer ${session.accessToken}`, "foreign", true),
      );
      await assert.rejects(() => users.remove(secondAdmin, created.user.id));
      await assert.rejects(() =>
        transactions.execute((transaction) =>
          new UserRepository(database).findSystemTenantUserRole(transaction, randomUUID()),
        ),
      );
    },
  );

  await suite.test(
    "storage-free preview authoring, reporting and delivery boundaries",
    async () => {
      const created = await platformService().createTenant(await ownerContext(), businessInput());
      await finishHandover(created.admin.email);
      const adminLogin = await auth.login(
        { email: created.admin.email, password: replacement },
        request,
      );
      const foreign = await platformService().createTenant(await ownerContext(), businessInput());
      await finishHandover(foreign.admin.email);
      const foreignLogin = await auth.login(
        { email: foreign.admin.email, password: replacement },
        request,
      );
      const runtime = loadApiRuntimeConfig({
        APP_MODE: "preview",
        NODE_ENV: "test",
        LOG_LEVEL: "fatal",
        DATABASE_URL: expectedUrl,
        REDIS_URL: "redis://127.0.0.1:56439",
        JWT_ACCESS_SECRET: config.accessSecret,
        REFRESH_TOKEN_PEPPER: config.refreshPepper,
      });
      assert.equal("storage" in runtime, false);
      assert.equal("email" in runtime, false);
      const app = await NestFactory.create(AppModule.register(runtime), {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      try {
        const base = `${await app.getUrl()}/api/v1`;
        async function call(
          path: string,
          method = "GET",
          body?: unknown,
          token = adminLogin.accessToken,
        ) {
          return fetch(`${base}${path}`, {
            method,
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        }
        async function data<T>(response: Response, status = 200): Promise<T> {
          const json = (await response.json()) as { data: T };
          assert.equal(response.status, status, JSON.stringify(json));
          return json.data;
        }
        for (const path of [
          "/dashboard",
          "/usage",
          "/billing/payments",
          "/audit-logs",
          "/templates",
          "/campaigns",
          "/whatsapp/accounts",
        ])
          assert.equal((await call(path)).status, 200, path);
        const account = await data<{ id: string }>(
          await call("/whatsapp/connect", "POST", {
            waba_id: `test-${randomUUID()}`,
            phone_number_id: `test-${randomUUID()}`,
            display_phone: "+919876543210",
            secret_ref: "env://META_DEVELOPMENT_ACCESS_TOKEN",
          }),
          201,
        );
        // No credentials are supplied: provider calls fail locally, never contact Meta.
        const sync = await call(`/whatsapp/accounts/${account.id}/sync`, "POST");
        assert.notEqual(sync.status, 200);
        const provider = app.get<WhatsAppProvider>(WHATSAPP_PROVIDER);
        provider.syncAccount = (input) =>
          Promise.resolve({
            phoneNumberId: input.phoneNumberId,
            wabaId: input.wabaId,
            displayName: "Mock business",
            displayPhone: "+919876543210",
            health: "CONNECTED",
            qualityRating: "GREEN",
          });
        assert.equal((await call(`/whatsapp/accounts/${account.id}/sync`, "POST")).status, 201);
        const template = await data<{ id: string }>(
          await call("/templates", "POST", {
            whatsapp_account_id: account.id,
            name: "preview_text",
            category: "MARKETING",
            language: "en",
            components: [{ type: "BODY", text: "Hello" }],
          }),
          201,
        );
        const draft = await data<{ id: string; contentVersion: number; revision: string }>(
          await call("/campaigns", "POST", {
            name: "Preview draft",
            whatsappAccountId: account.id,
            templateId: template.id,
            audienceDefinition: { version: 1, contactIds: [], groupIds: [] },
            variableMapping: {},
          }),
          201,
        );
        for (const action of ["send", "schedule", "resume", "pause", "cancel"]) {
          const result = await call(`/campaigns/${draft.id}/${action}`, "POST", {
            expectedContentVersion: draft.contentVersion,
            expectedRevision: draft.revision,
            ...(["send", "schedule"].includes(action) ? { idempotencyKey: randomUUID() } : {}),
          });
          assert.equal(result.status, 503, action);
          assert.equal(
            ((await result.json()) as { error: { code: string } }).error.code,
            "BACKGROUND_PROCESSING_UNAVAILABLE",
          );
        }
        assert.equal((await call(`/campaigns/${draft.id}/preflight`, "POST")).status, 503);
        assert.equal(
          (await call(`/campaigns/${draft.id}`, "GET", undefined, foreignLogin.accessToken)).status,
          404,
        );
        assert.equal(
          (
            await call(
              `/templates/${template.id}/preview`,
              "GET",
              undefined,
              foreignLogin.accessToken,
            )
          ).status,
          404,
        );
        const exportResponse = await call("/reports/exports", "POST", { kind: "dashboard" });
        assert.equal(exportResponse.status, 200);
        assert.match(exportResponse.headers.get("content-type") ?? "", /text\/csv/u);
        for (const path of ["/conversations", "/automation", "/webhooks/meta"])
          assert.equal((await call(path)).status, 404, path);
        const pending = await pool.query<{ count: number }>(
          "select count(*)::int as count from app.outbox_events where tenant_id=$1",
          [created.tenant.id],
        );
        assert.equal(pending.rows[0]?.count, 0);
      } finally {
        await app.close();
      }
    },
  );

  await suite.test(
    "embedded signup atomically stores encrypted credentials and rejects replay/foreign sessions/assets",
    async () => {
      const first = await platformService().createTenant(await ownerContext(), businessInput());
      const second = await platformService().createTenant(await ownerContext(), businessInput());
      await finishHandover(first.admin.email);
      await finishHandover(second.admin.email);
      const login = await auth.login({ email: first.admin.email, password: replacement }, request);
      const anotherSession = await auth.login(
        { email: first.admin.email, password: replacement },
        request,
      );
      const foreign = await auth.login(
        { email: second.admin.email, password: replacement },
        request,
      );
      const prefix = `signup-test-${randomUUID()}`;
      const runtime = loadApiRuntimeConfig({
        APP_MODE: "preview",
        NODE_ENV: "test",
        LOG_LEVEL: "fatal",
        DATABASE_URL: expectedUrl,
        REDIS_URL: "redis://127.0.0.1:56439",
        QUEUE_PREFIX: prefix,
        AUTH_LOGIN_EMAIL_LIMIT: "100",
        AUTH_LOGIN_IP_LIMIT: "1000",
        JWT_ACCESS_SECRET: config.accessSecret,
        REFRESH_TOKEN_PEPPER: config.refreshPepper,
        WHATSAPP_ONBOARDING_MODE: "embedded_signup",
        META_APP_ID: "1234",
        META_GRAPH_API_VERSION: "v99.0",
        META_APP_SECRET: "synthetic-app-secret",
        META_EMBEDDED_SIGNUP_CONFIG_ID: "5678",
        WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: "v1",
        WHATSAPP_CREDENTIAL_KEYRING: JSON.stringify({ v1: Buffer.alloc(32, 1).toString("base64") }),
      });
      const app = await NestFactory.create(AppModule.register(runtime), {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      let verifiedCalls = 0;
      const phoneNumberId = String(Date.now());
      app.get(MetaEmbeddedSignupAdapter).exchangeAndVerify = (
        _code: string,
        wabaId: string,
        phone: string,
      ) => {
        verifiedCalls++;
        return Promise.resolve({
          token: `synthetic-token-${String(verifiedCalls)}`,
          wabaId,
          phoneNumberId: phone,
          displayPhone: "+919876543210",
          displayName: "Mock signup",
        });
      };
      try {
        const base = `${await app.getUrl()}/api/v1`;
        const call = (path: string, body: unknown, token = login.accessToken) =>
          fetch(`${base}${path}`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify(body),
          });
        async function start(token = login.accessToken) {
          const response = await call("/whatsapp/onboarding/start", {}, token);
          assert.equal(response.status, 201);
          const value = (await response.json()) as { data: { attemptId: string; nonce: string } };
          const ttl = await redis.ttl(`${prefix}:whatsapp-signup:${value.data.attemptId}`);
          assert.ok(ttl > 0 && ttl <= 600);
          return {
            attemptId: value.data.attemptId,
            nonce: value.data.nonce,
            code: "synthetic-code",
            wabaId: "100",
            phoneNumberId,
          };
        }
        assert.equal(
          (
            await call("/whatsapp/connect", {
              waba_id: "100",
              phone_number_id: phoneNumberId,
              display_phone: "+919876543210",
              secret_ref: "env://META_DEVELOPMENT_ACCESS_TOKEN",
            })
          ).status,
          409,
        );
        const attempt = await start();
        const ordinary = await fixture(false);
        assert.equal(
          (await call("/whatsapp/onboarding/start", {}, ordinary.login.accessToken)).status,
          403,
        );
        assert.equal(
          (await fetch(`${base}/whatsapp/onboarding/start`, { method: "POST" })).status,
          401,
        );
        assert.equal(
          (await call("/whatsapp/onboarding/complete", { ...attempt, token: "not-accepted" }))
            .status,
          400,
        );
        assert.equal(
          (await call("/whatsapp/onboarding/complete", attempt, foreign.accessToken)).status,
          409,
        );
        assert.equal(
          (await call("/whatsapp/onboarding/complete", attempt, anotherSession.accessToken)).status,
          409,
        );
        assert.equal(verifiedCalls, 0);
        const races = await Promise.all([
          call("/whatsapp/onboarding/complete", attempt),
          call("/whatsapp/onboarding/complete", attempt),
        ]);
        assert.deepEqual(races.map((value) => value.status).sort(), [201, 409]);
        const response = races.find((value) => value.status === 201);
        assert.ok(response);
        const result = (await response.json()) as { data: { accountId: string }; error?: unknown };
        assert.equal(response.status, 201, JSON.stringify(result));
        const accountId = result.data.accountId;
        assert.equal((await call("/whatsapp/onboarding/complete", attempt)).status, 409);
        assert.equal(verifiedCalls, 1);
        const credentials = await pool.query<{
          id: string;
          secret_ref: string;
          encrypted_token: string;
        }>(
          "select id,secret_ref,encrypted_token from app.provider_credentials where whatsapp_account_id=$1",
          [accountId],
        );
        const credential = credentials.rows[0];
        assert.ok(credential);
        assert.equal(credential.secret_ref, `encrypted://${credential.id}`);
        assert.equal(credential.encrypted_token.includes("synthetic-token"), false);
        const resolver = app.get(ProviderCredentialService);
        assert.equal(await resolver.resolve(credential.secret_ref, accountId), "synthetic-token-1");
        await assert.rejects(() => resolver.resolve(credential.secret_ref, randomUUID()));
        const before = credential.encrypted_token;
        const reconnection = await call("/whatsapp/onboarding/complete", await start());
        assert.equal(reconnection.status, 201);
        assert.equal(
          ((await reconnection.json()) as { data: { accountId: string } }).data.accountId,
          accountId,
        );
        assert.equal(await resolver.resolve(credential.secret_ref, accountId), "synthetic-token-2");
        const expired = await start();
        await redis.pexpire(`${prefix}:whatsapp-signup:${expired.attemptId}`, -1);
        assert.equal((await call("/whatsapp/onboarding/complete", expired)).status, 409);
        assert.equal(verifiedCalls, 2);
        await pool.query(`CREATE FUNCTION app.signup_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.action='WHATSAPP_CREDENTIAL_REPLACED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
        await pool.query(
          "CREATE TRIGGER signup_test_fail_audit BEFORE INSERT ON app.audit_logs FOR EACH ROW EXECUTE FUNCTION app.signup_test_fail_audit()",
        );
        try {
          const failedAttempt = await start();
          assert.equal((await call("/whatsapp/onboarding/complete", failedAttempt)).status, 503);
          assert.equal((await call("/whatsapp/onboarding/complete", failedAttempt)).status, 409);
          assert.equal(
            await resolver.resolve(credential.secret_ref, accountId),
            "synthetic-token-2",
          );
        } finally {
          await pool.query("DROP TRIGGER signup_test_fail_audit ON app.audit_logs");
          await pool.query("DROP FUNCTION app.signup_test_fail_audit()");
        }
        const foreignResponse = await call(
          "/whatsapp/onboarding/complete",
          await start(foreign.accessToken),
          foreign.accessToken,
        );
        assert.equal(foreignResponse.status, 409);
        assert.equal(await resolver.resolve(credential.secret_ref, accountId), "synthetic-token-2");
        const stored = await pool.query<{ encrypted_token: string }>(
          "select encrypted_token from app.provider_credentials where id=$1",
          [credential.id],
        );
        assert.notEqual(stored.rows[0]?.encrypted_token, before);
        await assert.rejects(() =>
          pool.query(
            "update app.provider_credentials set secret_ref='encrypted://wrong' where id=$1",
            [credential.id],
          ),
        );
        await pool.query("update app.provider_credentials set status='REVOKED' where id=$1", [
          credential.id,
        ]);
        await assert.rejects(() => resolver.resolve(credential.secret_ref, accountId));
        const audit = await pool.query<{ count: number }>(
          "select count(*)::int as count from app.audit_logs where tenant_id=$1 and action='WHATSAPP_CREDENTIAL_REPLACED'",
          [first.tenant.id],
        );
        assert.equal(audit.rows[0]?.count, 2);
        const rows = await pool.query<{ count: number }>(
          "select count(*)::int as count from app.outbox_events where tenant_id=$1",
          [first.tenant.id],
        );
        assert.equal(rows.rows[0]?.count, 0);
      } finally {
        await app.close();
      }
    },
  );

  await suite.test(
    "failed Admin insert rolls back tenant, roles and grants without changing existing accounts",
    async () => {
      const service = platformService();
      const owner = await ownerContext();
      const input = businessInput();
      const first = await service.createTenant(owner, input);
      const before = await state(first.admin.id);
      const counts = () =>
        pool.query<{ tenants: number; roles: number; grants: number }>(
          `select (select count(*)::int from app.tenants) as tenants,
        (select count(*)::int from app.roles) as roles,
        (select count(*)::int from app.role_permissions) as grants`,
        );
      const original = (await counts()).rows;
      await assert.rejects(() =>
        service.createTenant(owner, { ...input, slug: `duplicate-${randomUUID()}` }),
      );
      assert.deepEqual((await counts()).rows, original);
      assert.deepEqual(await state(first.admin.id), before);
    },
  );
});
