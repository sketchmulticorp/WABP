import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import type { AuthRepository } from "../../auth/auth.repository.js";
import type { LoginRateLimiterAdapter } from "../../auth/login-rate-limiter.adapter.js";
import type { Argon2idPasswordHasher } from "../../common/security/password-hasher.js";
import type { DatabaseTransactionManager } from "../../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../../database/database.types.js";
import { parseCreateAccountInput } from "../../users/user.dto.js";
import { SuperAdminService } from "./super-admin.service.js";
import type { SuperAdminRepository } from "./super-admin.repository.js";
import { SuperAdminError } from "./super-admin.error.js";
import { SuperAdminController } from "./super-admin.controller.js";
import { ApplicationError } from "../../common/errors/application-error.js";

const context: AuthorizationContext = {
  actorId: "owner",
  roleId: "role",
  roleName: "Super Admin",
  roleSystemKey: "SUPER_ADMIN",
  email: "owner@example.test",
  isPlatformActor: true,
  tenantId: null,
  passwordChangeRequired: false,
  permissions: new Set(["user.invite"]),
  requestId: "test",
  sessionId: "session",
};
const body = {
  display_name: " Partner ",
  email: " PARTNER@EXAMPLE.TEST ",
  initial_password: "Temporary!Password123",
};
const input = parseCreateAccountInput(body);
function fixture(
  options: {
    live?: boolean;
    reserved?: boolean;
    allowed?: boolean;
    error?: Error;
    stage?: string;
  } = {},
) {
  const events: string[] = [];
  let persisted: unknown;
  const fail = (stage: string) => {
    if (options.stage === stage) throw options.error ?? new Error("SQL secret credential");
  };
  const repository = {
    lockCreator: () => {
      events.push("creator");
      return Promise.resolve(options.live !== false);
    },
    isEmailReservedIncludingDeleted: () => {
      events.push("email");
      return Promise.resolve(options.reserved === true);
    },
    create: (_tx: unknown, value: unknown) => {
      fail("create");
      persisted = value;
      events.push("insert");
      return Promise.resolve({
        id: "partner",
        display_name: input.displayName,
        email: input.email,
      });
    },
    auditCreation: () => {
      fail("audit");
      events.push("audit");
      return Promise.resolve();
    },
  } as unknown as SuperAdminRepository;
  const transactions = {
    execute: async (work: (tx: AppDatabaseTransaction) => Promise<unknown>, settings: unknown) => {
      assert.deepEqual(settings, { isolationLevel: "read committed" });
      events.push("transaction");
      return work({} as AppDatabaseTransaction);
    },
  } as unknown as DatabaseTransactionManager;
  const hasher = {
    hash: () => {
      fail("hash");
      events.push("hash");
      return Promise.resolve("synthetic-hash");
    },
  } as unknown as Argon2idPasswordHasher;
  const limiter = {
    consume: () => {
      fail("limiter");
      events.push("limit");
      return Promise.resolve({ allowed: options.allowed !== false });
    },
  } as unknown as LoginRateLimiterAdapter;
  const auth = {
    lockUserAuthentication: () => {
      events.push("auth-lock");
      return Promise.resolve();
    },
  } as unknown as AuthRepository;
  return {
    service: new SuperAdminService(repository, transactions, hasher, limiter, auth),
    events,
    persisted: () => persisted,
  };
}

void test("normalizes identity without trimming temporary password", () => {
  assert.equal(input.email, "partner@example.test");
  assert.equal(input.displayName, "Partner");
  assert.equal(
    parseCreateAccountInput({ ...body, initial_password: " Temporary!Password123 " })
      .initialPassword,
    " Temporary!Password123 ",
  );
});
for (const candidate of [
  null,
  [],
  {},
  { ...body, role: "SUPER_ADMIN" },
  { ...body, tenant_id: "foreign" },
  { ...body, display_name: " " },
  { ...body, email: "bad" },
  { ...body, initial_password: "short" },
  { ...body, initial_password: "A1!".repeat(44) },
]) {
  void test("rejects malformed, overposted or weak account input", () => {
    assert.throws(() => parseCreateAccountInput(candidate));
  });
}
for (const override of [
  { roleSystemKey: "TENANT_ADMIN" as const },
  { isPlatformActor: false },
  { tenantId: "tenant" },
  { passwordChangeRequired: true },
  { permissions: new Set<string>() },
]) {
  void test("denies non-platform or pending/unprivileged creator before hash/database", async () => {
    const f = fixture();
    await assert.rejects(() => f.service.create({ ...context, ...override }, input), {
      message: "SUPER_ADMIN_FORBIDDEN",
    });
    assert.deepEqual(f.events, []);
  });
}
void test("hashes before transaction, locks/rechecks creator and atomically requests audit", async () => {
  const f = fixture();
  const result = await f.service.create(context, input);
  assert.deepEqual(f.events, [
    "limit",
    "hash",
    "transaction",
    "auth-lock",
    "creator",
    "email",
    "insert",
    "audit",
  ]);
  assert.deepEqual(f.persisted(), {
    displayName: "Partner",
    email: "partner@example.test",
    passwordHash: "synthetic-hash",
    roleId: "role",
  });
  assert.equal(result.user.password_change_required, true);
  assert.equal(result.user.role, "SUPER_ADMIN");
  assert.equal(JSON.stringify(result).includes("hash"), false);
  assert.equal(JSON.stringify(result).includes(body.initial_password), false);
});
for (const [options, code] of [
  [{ live: false }, "SUPER_ADMIN_FORBIDDEN"],
  [{ reserved: true }, "SUPER_ADMIN_EMAIL_UNAVAILABLE"],
  [{ allowed: false }, "SUPER_ADMIN_RATE_LIMITED"],
  [{ stage: "limiter" }, "SUPER_ADMIN_CREATE_UNAVAILABLE"],
  [{ stage: "hash" }, "SUPER_ADMIN_CREATE_UNAVAILABLE"],
  [{ stage: "create" }, "SUPER_ADMIN_CREATE_UNAVAILABLE"],
  [{ stage: "audit" }, "SUPER_ADMIN_CREATE_UNAVAILABLE"],
] as const) {
  void test(`fails closed safely: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(
      () => f.service.create(context, input),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminError);
        assert.equal(error.code, code);
        assert.equal("cause" in error, false);
        return true;
      },
    );
    assert.equal(f.events.includes("audit"), false);
  });
}
void test("wrapped PostgreSQL duplicate becomes safe email conflict", async () => {
  const cause = Object.assign(new Error("sensitive SQL"), { code: "23505" });
  await assert.rejects(
    () =>
      fixture({ stage: "create", error: new Error("query", { cause }) }).service.create(
        context,
        input,
      ),
    { message: "SUPER_ADMIN_EMAIL_UNAVAILABLE" },
  );
});
void test("controller maps domain failures without leaking causes and keeps success metadata", async () => {
  for (const [code, status] of [
    ["SUPER_ADMIN_FORBIDDEN", 403],
    ["SUPER_ADMIN_EMAIL_UNAVAILABLE", 409],
    ["SUPER_ADMIN_RATE_LIMITED", 429],
    ["SUPER_ADMIN_CREATE_UNAVAILABLE", 503],
  ] as const) {
    const service = {
      create: () => Promise.reject(new SuperAdminError(code)),
    } as unknown as SuperAdminService;
    await assert.rejects(
      () => new SuperAdminController(service).create(body, context),
      (error: unknown) => {
        assert.ok(error instanceof ApplicationError);
        assert.equal(error.statusCode, status);
        assert.equal(error.code, code);
        return true;
      },
    );
  }
  assert.equal(
    (await new SuperAdminController(fixture().service).create(body, context)).user.role,
    "SUPER_ADMIN",
  );
});
