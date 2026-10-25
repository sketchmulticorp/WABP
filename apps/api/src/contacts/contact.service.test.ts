import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { TenantScopeService } from "../authorization/authorization.service.js";
import type { ApplicationError } from "../common/errors/application-error.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type { ContactRepository } from "./contact.repository.js";
import { ContactService } from "./contact.service.js";

const tenantId = "00000000-0000-4000-8000-000000000004";

const context: AuthorizationContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.test",
  isPlatformActor: false,
  permissions: new Set(["contact.delete", "contact.read", "contact.write"]),
  requestId: "contacts-test-request",
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

void test("creates a manual contact with a normalized Indian local phone and UNKNOWN consent", async () => {
  let createdInput: Record<string, unknown> | undefined;
  const audited: unknown[] = [];
  const repository = {
    audit: (_transaction: unknown, input: unknown) => {
      audited.push(input);
      return Promise.resolve();
    },
    create: (_transaction: unknown, _tenantId: string, input: Record<string, unknown>) => {
      createdInput = input;
      return Promise.resolve({ id: "00000000-0000-4000-8000-000000000005" });
    },
    isActiveTenantAssignee: () => Promise.resolve(true),
  } as unknown as ContactRepository;
  const service = new ContactService(repository, transactions, tenantScope);

  const result = await service.create(context, {
    address: null,
    assignedUserId: "00000000-0000-4000-8000-000000000006",
    company: null,
    customFields: {},
    email: null,
    name: "Asha",
    phone: "09876543210",
  });

  assert.deepEqual(result, { id: "00000000-0000-4000-8000-000000000005" });
  assert.equal(createdInput?.phoneE164, "+919876543210");
  assert.equal(audited.length, 1);
});

void test("rejects an assignee outside the active tenant", async () => {
  const repository = {
    isActiveTenantAssignee: () => Promise.resolve(false),
  } as unknown as ContactRepository;
  const service = new ContactService(repository, transactions, tenantScope);

  await assert.rejects(
    () =>
      service.create(context, {
        address: null,
        assignedUserId: "00000000-0000-4000-8000-000000000006",
        company: null,
        customFields: {},
        email: null,
        name: null,
        phone: "+919876543210",
      }),
    (error: unknown) => isApplicationError(error, "CONTACT_ASSIGNEE_INVALID"),
  );
});

void test("maps the active-phone unique constraint to a stable duplicate error", async () => {
  const repository = {
    create: () => Promise.reject(Object.assign(new Error("duplicate phone"), { code: "23505" })),
  } as unknown as ContactRepository;
  const service = new ContactService(repository, transactions, tenantScope);

  await assert.rejects(
    () =>
      service.create(context, {
        address: null,
        assignedUserId: null,
        company: null,
        customFields: {},
        email: null,
        name: null,
        phone: "+919876543210",
      }),
    (error: unknown) => isApplicationError(error, "CONTACT_PHONE_EXISTS"),
  );
});

void test("soft-deletes with actor evidence and does not issue a hard-delete workflow", async () => {
  const calls: unknown[][] = [];
  const repository = {
    audit: () => Promise.resolve(),
    softDelete: (...input: unknown[]) => {
      calls.push(input);
      return Promise.resolve({ id: "00000000-0000-4000-8000-000000000005" });
    },
  } as unknown as ContactRepository;
  const service = new ContactService(repository, transactions, tenantScope);

  assert.deepEqual(await service.remove(context, "00000000-0000-4000-8000-000000000005"), {
    deleted: true,
    id: "00000000-0000-4000-8000-000000000005",
  });
  assert.equal(calls[0]?.[3], context.actorId);
});

void test("records opt-in consent evidence inside the tenant transaction", async () => {
  const audited: unknown[] = [];
  const repository = {
    audit: (_transaction: unknown, input: unknown) => {
      audited.push(input);
      return Promise.resolve();
    },
    updateConsent: (_transaction: unknown, receivedTenantId: string, receivedContactId: string) => {
      assert.equal(receivedTenantId, tenantId);
      assert.equal(receivedContactId, "00000000-0000-4000-8000-000000000005");
      return Promise.resolve({ id: receivedContactId, consentStatus: "OPTED_IN" });
    },
  } as unknown as ContactRepository;
  const service = new ContactService(repository, transactions, tenantScope);

  const result = await service.updateConsent(context, "00000000-0000-4000-8000-000000000005", {
    category: null,
    occurredAt: "2026-10-11T00:00:00.000Z",
    proofReference: "intake-form-42",
    source: "MANUAL",
    status: "OPTED_IN",
    suppressionReason: null,
  });

  assert.deepEqual(result, {
    consentStatus: "OPTED_IN",
    id: "00000000-0000-4000-8000-000000000005",
  });
  assert.equal(audited.length, 1);
});

function isApplicationError(error: unknown, code: string): error is ApplicationError {
  return error instanceof Error && "code" in error && error.code === code;
}
