import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type { MeRepository } from "./me.repository.js";
import { MeService } from "./me.service.js";
import type { SessionRecord } from "./me.types.js";

const tenantId = "00000000-0000-4000-8000-000000000010";
const actorId = "00000000-0000-4000-8000-000000000020";
const currentSessionId = "00000000-0000-4000-8000-000000000030";
const otherSessionId = "00000000-0000-4000-8000-000000000040";

const context: AuthorizationContext = {
  actorId,
  email: "doctor@example.test",
  isPlatformActor: false,
  permissions: new Set(["contact.read", "tenant.read"]),
  requestId: "request-1",
  roleId: "00000000-0000-4000-8000-000000000050",
  roleName: "Tenant Admin",
  roleSystemKey: "TENANT_ADMIN",
  sessionId: currentSessionId,
  tenantId,
};

const sessions: readonly SessionRecord[] = [
  {
    createdAt: "2026-10-10T10:00:00.000Z",
    expiresAt: "2026-11-09T10:00:00.000Z",
    id: currentSessionId,
    ipAddress: "127.0.0.1",
    tokenFamilyId: "00000000-0000-4000-8000-000000000060",
    userAgent: "current-browser",
  },
  {
    createdAt: "2026-10-09T10:00:00.000Z",
    expiresAt: "2026-11-08T10:00:00.000Z",
    id: otherSessionId,
    ipAddress: "127.0.0.2",
    tokenFamilyId: "00000000-0000-4000-8000-000000000070",
    userAgent: "other-browser",
  },
];

void test("returns the safe current-user, tenant, permission, and entitlement projection", async () => {
  const repository = {
    findCurrentUser: () =>
      Promise.resolve({
        defaultCountryCode: "IN",
        defaultTimezone: "Asia/Kolkata",
        displayName: "Example Doctor",
        email: context.email,
        roleName: context.roleName,
        roleSystemKey: context.roleSystemKey,
        tenantId,
        tenantName: "Example Clinic",
        tenantSlug: "example-clinic",
        userId: actorId,
      }),
    findActiveSubscription: () =>
      Promise.resolve({
        endsAt: null,
        featureFlags: { automation: true },
        limits: { max_users: 100 },
        planCode: "MVP_INTERNAL",
        planName: "MVP Internal",
        startsAt: "2026-10-01T00:00:00.000Z",
        status: "ACTIVE",
      }),
  } as unknown as MeRepository;
  const service = new MeService(repository, transactionManager());

  const response = await service.getCurrentUser(context);

  assert.equal(response.id, actorId);
  assert.equal(response.tenant?.id, tenantId);
  assert.equal(response.subscription?.plan.code, "MVP_INTERNAL");
  assert.deepEqual(response.permissions, ["contact.read", "tenant.read"]);
});

void test("returns no tenant or subscription projection for Super Admin", async () => {
  const platformContext: AuthorizationContext = {
    ...context,
    isPlatformActor: true,
    roleName: "Super Admin",
    roleSystemKey: "SUPER_ADMIN",
    tenantId: null,
  };
  const repository = {
    findCurrentUser: () =>
      Promise.resolve({
        defaultCountryCode: null,
        defaultTimezone: null,
        displayName: "Platform Owner",
        email: "owner@example.test",
        roleName: "Super Admin",
        roleSystemKey: "SUPER_ADMIN",
        tenantId: null,
        tenantName: null,
        tenantSlug: null,
        userId: actorId,
      }),
    findActiveSubscription: () => Promise.reject(new Error("must not query tenant plan")),
  } as unknown as MeRepository;

  const response = await new MeService(repository, transactionManager()).getCurrentUser(
    platformContext,
  );

  assert.equal(response.tenant, null);
  assert.equal(response.subscription, null);
});

void test("lists active sessions and revokes only an owned session family with audit evidence", async () => {
  let revokedFamily: string | undefined;
  let auditedSession: string | undefined;
  const repository = {
    listActiveSessions: () => Promise.resolve(sessions),
    findOwnedSessionForUpdate: (
      _transaction: AppDatabaseTransaction,
      userId: string,
      sessionId: string,
    ) =>
      Promise.resolve(
        userId === actorId ? sessions.find((item) => item.id === sessionId) : undefined,
      ),
    revokeSessionFamily: (_transaction: AppDatabaseTransaction, tokenFamilyId: string) => {
      revokedFamily = tokenFamilyId;
      return Promise.resolve();
    },
    recordSessionRevocation: (
      _transaction: AppDatabaseTransaction,
      input: { readonly sessionId: string },
    ) => {
      auditedSession = input.sessionId;
      return Promise.resolve();
    },
  } as unknown as MeRepository;
  const service = new MeService(repository, transactionManager());

  const listed = await service.listSessions(context);
  assert.equal(listed.sessions[0]?.current, true);
  assert.equal(listed.sessions[1]?.current, false);

  assert.deepEqual(await service.revokeSession(context, otherSessionId), { revoked: true });
  assert.equal(revokedFamily, sessions[1]?.tokenFamilyId);
  assert.equal(auditedSession, otherSessionId);
  await assert.rejects(
    () => service.revokeSession(context, "00000000-0000-4000-8000-000000000099"),
    hasCode("SESSION_NOT_FOUND"),
  );
});

function transactionManager(): DatabaseTransactionManager {
  return {
    execute: async <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>): Promise<T> =>
      work({} as AppDatabaseTransaction),
  } as unknown as DatabaseTransactionManager;
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && "code" in error && error.code === expected;
}
