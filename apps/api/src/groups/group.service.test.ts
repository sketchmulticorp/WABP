import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { TenantScopeService } from "../authorization/authorization.service.js";
import type { ApplicationError } from "../common/errors/application-error.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type { GroupRepository } from "./group.repository.js";
import { GroupService } from "./group.service.js";

const tenantId = "00000000-0000-4000-8000-000000000010";
const groupId = "00000000-0000-4000-8000-000000000011";
const contactId = "00000000-0000-4000-8000-000000000012";

const context: AuthorizationContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.test",
  isPlatformActor: false,
  permissions: new Set(["contact.delete", "contact.read", "contact.write"]),
  requestId: "groups-test-request",
  roleId: "00000000-0000-4000-8000-000000000002",
  roleName: "Tenant Admin",
  roleSystemKey: "TENANT_ADMIN",
  sessionId: "00000000-0000-4000-8000-000000000003",
  tenantId,
};

const transactions = {
  execute: <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>) =>
    work({} as AppDatabaseTransaction),
} as unknown as DatabaseTransactionManager;

const tenantScope = {
  requireTenantContext: () => ({
    actorId: context.actorId,
    permissions: context.permissions,
    requestId: context.requestId,
    roleSystemKey: "TENANT_ADMIN" as const,
    sessionId: context.sessionId,
    tenantId,
  }),
} as unknown as TenantScopeService;

void test("adds only active same-tenant Contacts to a Group and records the action", async () => {
  const audited: unknown[] = [];
  const repository = {
    activeContactIds: (_transaction: unknown, receivedTenantId: string, ids: readonly string[]) => {
      assert.equal(receivedTenantId, tenantId);
      assert.deepEqual(ids, [contactId]);
      return Promise.resolve(new Set(ids));
    },
    addOrRestoreMember: (_transaction: unknown, receivedTenantId: string) => {
      assert.equal(receivedTenantId, tenantId);
      return Promise.resolve(true);
    },
    audit: (_transaction: unknown, input: unknown) => {
      audited.push(input);
      return Promise.resolve();
    },
    hasActiveGroup: (_transaction: unknown, receivedTenantId: string, receivedGroupId: string) => {
      assert.equal(receivedTenantId, tenantId);
      assert.equal(receivedGroupId, groupId);
      return Promise.resolve(true);
    },
  } as unknown as GroupRepository;
  const service = new GroupService(repository, transactions, tenantScope);

  assert.deepEqual(await service.addMembers(context, groupId, { contactIds: [contactId] }), {
    added: 1,
    group_id: groupId,
  });
  assert.equal(audited.length, 1);
});

void test("does not add a missing or cross-tenant Contact to a Group", async () => {
  const repository = {
    activeContactIds: () => Promise.resolve(new Set<string>()),
    hasActiveGroup: () => Promise.resolve(true),
  } as unknown as GroupRepository;
  const service = new GroupService(repository, transactions, tenantScope);

  await assert.rejects(
    () => service.addMembers(context, groupId, { contactIds: [contactId] }),
    (error: unknown) => hasCode(error, "CONTACT_GROUP_MEMBER_CONTACT_NOT_FOUND"),
  );
});

void test("rejects a duplicate active Group name with a stable error", async () => {
  const repository = {
    create: () => Promise.reject(Object.assign(new Error("duplicate group"), { code: "23505" })),
  } as unknown as GroupRepository;
  const service = new GroupService(repository, transactions, tenantScope);

  await assert.rejects(
    () => service.create(context, { name: "Patients" }),
    (error: unknown) => hasCode(error, "CONTACT_GROUP_NAME_EXISTS"),
  );
});

function hasCode(error: unknown, code: string): error is ApplicationError {
  return error instanceof Error && "code" in error && error.code === code;
}
