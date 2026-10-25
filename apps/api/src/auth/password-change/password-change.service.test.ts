import assert from "node:assert/strict";
import test from "node:test";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import type { Argon2idPasswordHasher } from "../../common/security/password-hasher.js";
import type { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../../database/database.types.js";
import type { AuthRepository } from "../auth.repository.js";
import type { LoginRateLimiterAdapter } from "../login-rate-limiter.adapter.js";
import type { PasswordChangeRepository } from "./password-change.repository.js";
import { PasswordChangeService } from "./password-change.service.js";

const context: AuthorizationContext = {
  actorId: "user",
  email: "test@example.test",
  isPlatformActor: false,
  passwordChangeRequired: true,
  permissions: new Set(),
  requestId: "request",
  roleId: "role",
  roleName: "Tenant User",
  roleSystemKey: "TENANT_USER",
  sessionId: "session",
  tenantId: "tenant",
};

function fixture(
  options: {
    allowed?: boolean;
    outage?: boolean;
    activeSession?: boolean;
    changedHash?: boolean;
    suspended?: boolean;
    persistenceFailure?: boolean;
    platform?: boolean;
  } = {},
) {
  const events: string[] = [];
  const repository = {
    findCredentials: () => Promise.resolve({ required: true, passwordHash: "old-hash" }),
    lockCredentials: () => {
      events.push("credentials-lock");
      return Promise.resolve({
        required: true,
        passwordHash: options.changedHash ? "changed" : "old-hash",
      });
    },
    sessionIsActive: () => Promise.resolve(options.activeSession !== false),
    complete: () => {
      if (options.persistenceFailure) throw new Error("SQL secret-hash");
      events.push("persist");
      return Promise.resolve();
    },
  } as unknown as PasswordChangeRepository;
  const auth = {
    lockUserAuthentication: () => {
      events.push("user-lock");
      return Promise.resolve();
    },
    findPrincipalById: () =>
      Promise.resolve({
        homeTenantId: options.platform ? null : "tenant",
        membershipId: options.platform ? null : "membership",
        membershipRoleId: options.platform ? null : "role",
        membershipTenantId: options.platform ? null : "tenant",
        roleId: "role",
        roleIsDeleted: false,
        roleSystemKey: options.platform ? "SUPER_ADMIN" : "TENANT_USER",
        roleTenantId: options.platform ? null : "tenant",
        tenantIsDeleted: false,
        tenantStatus: options.suspended ? "SUSPENDED" : "ACTIVE",
        userStatus: "ACTIVE",
      }),
  } as unknown as AuthRepository;
  const transactions = {
    execute: async (work: (tx: AppDatabaseTransaction) => Promise<void>, settings: unknown) => {
      assert.deepEqual(settings, { isolationLevel: "read committed" });
      await work({} as AppDatabaseTransaction);
    },
  } as unknown as DatabaseTransactionManager;
  const hasher = {
    verify: (password: string) => Promise.resolve(password === "Temporary!123"),
    hash: () => {
      events.push("hash");
      return Promise.resolve("new-hash");
    },
  } as unknown as Argon2idPasswordHasher;
  const limiter = {
    consume: () => {
      if (options.outage) throw new Error("Redis secret");
      return Promise.resolve({ allowed: options.allowed !== false });
    },
  } as unknown as LoginRateLimiterAdapter;
  return {
    events,
    service: new PasswordChangeService(repository, auth, transactions, hasher, limiter),
  };
}

const input = { currentPassword: "Temporary!123", newPassword: "Replacement!123" };

void test("hashes outside transaction then locks user before credentials and persists", async () => {
  const { service, events } = fixture();
  await service.complete(context, input);
  assert.deepEqual(events, ["hash", "user-lock", "credentials-lock", "persist"]);
});

for (const [name, options, code] of [
  ["rate limit", { allowed: false }, "PASSWORD_CHANGE_RATE_LIMITED"],
  ["limiter outage", { outage: true }, "PASSWORD_CHANGE_UNAVAILABLE"],
  ["revoked session", { activeSession: false }, "PASSWORD_CHANGE_SESSION_INVALID"],
  ["concurrent credential edit", { changedHash: true }, "PASSWORD_CHANGE_SESSION_INVALID"],
  ["suspended tenant", { suspended: true }, "PASSWORD_CHANGE_SESSION_INVALID"],
  ["persistence failure", { persistenceFailure: true }, "PASSWORD_CHANGE_UNAVAILABLE"],
] as const) {
  void test(`fails closed for ${name} without leaking infrastructure errors`, async () => {
    const { service, events } = fixture(options);
    await assert.rejects(
      () => service.complete(context, input),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, code);
        assert.equal("cause" in error, false);
        return true;
      },
    );
    assert.equal(events.includes("persist"), false);
  });
}

void test("rejects wrong current password and reuse before persistence", async () => {
  for (const candidate of [
    { ...input, currentPassword: "wrong" },
    { ...input, newPassword: input.currentPassword },
  ]) {
    const { service, events } = fixture();
    await assert.rejects(() => service.complete(context, candidate));
    assert.deepEqual(events, []);
  }
});

void test("does not permit non-pending accounts", async () => {
  const { service, events } = fixture();
  await assert.rejects(() =>
    service.complete({ ...context, passwordChangeRequired: false }, input),
  );
  assert.deepEqual(events, []);
});

void test("new pending platform partner can complete the same password handover", async () => {
  const { service, events } = fixture({ platform: true });
  await service.complete(
    { ...context, tenantId: null, isPlatformActor: true, roleSystemKey: "SUPER_ADMIN" },
    input,
  );
  assert.equal(events.includes("persist"), true);
});

void test("inconsistent platform principal cannot complete handover", async () => {
  const { service, events } = fixture();
  await assert.rejects(() =>
    service.complete({ ...context, tenantId: null, roleSystemKey: "SUPER_ADMIN" }, input),
  );
  assert.equal(events.includes("persist"), false);
});
