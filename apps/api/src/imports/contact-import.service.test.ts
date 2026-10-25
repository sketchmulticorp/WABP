import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { S3ObjectStorage } from "@whatsapp-platform/storage";

import type { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { OutboxRepository } from "../database/outbox/outbox.repository.js";
import type { GroupRepository } from "../groups/group.repository.js";
import type { ClamAvScanner } from "./clamav-scanner.adapter.js";
import type { ContactImportRepository } from "./contact-import.repository.js";
import { ContactImportService } from "./contact-import.service.js";

const tenantId = "00000000-0000-4000-8000-000000000010";
const actorId = "00000000-0000-4000-8000-000000000011";

const context: AuthorizationContext = {
  actorId,
  email: "admin@example.test",
  isPlatformActor: false,
  permissions: new Set(["contact.import", "contact.read"]),
  requestId: "imports-test-request",
  roleId: "00000000-0000-4000-8000-000000000012",
  roleName: "Tenant Admin",
  roleSystemKey: "TENANT_ADMIN",
  sessionId: "00000000-0000-4000-8000-000000000013",
  tenantId,
};

void test("creates a clean import with tenant-scoped protected storage, outbox, and audit evidence", async () => {
  const storageKeys: string[] = [];
  const outboxEvents: unknown[] = [];
  const audits: unknown[] = [];
  const service = createService({
    audit: (
      _transaction: unknown,
      _tenant: string,
      _actor: string,
      _role: string,
      _id: string,
      requestId: string,
    ) => {
      audits.push(requestId);
      return Promise.resolve();
    },
    create: (
      _transaction: unknown,
      receivedTenantId: string,
      receivedActorId: string,
      storageKey: string,
    ) => {
      assert.equal(receivedTenantId, tenantId);
      assert.equal(receivedActorId, actorId);
      assert.match(storageKey, new RegExp(`^contact-imports/${tenantId}/`, "u"));
      return Promise.resolve({ id: "00000000-0000-4000-8000-000000000014" });
    },
    groups: { hasActiveGroup: () => Promise.resolve(true) },
    outbox: {
      create: (_transaction: unknown, event: unknown) => {
        outboxEvents.push(event);
        return Promise.resolve();
      },
    },
    scanner: { scan: () => Promise.resolve() },
    storage: {
      delete: () => Promise.resolve(),
      put: (key: string) => {
        storageKeys.push(key);
        return Promise.resolve();
      },
    },
  });

  const result = await service.create(context, csvFile(), {
    defaultCountryCode: "IN",
    groupId: null,
    mapping: { phone: "phone" },
  });

  assert.deepEqual(result, { id: "00000000-0000-4000-8000-000000000014" });
  assert.equal(storageKeys.length, 1);
  assert.equal(outboxEvents.length, 1);
  assert.deepEqual(audits, [context.requestId]);
});

void test("cleans up a scanned upload when its selected Group is not in the tenant", async () => {
  const deletedKeys: string[] = [];
  const service = createService({
    groups: { hasActiveGroup: () => Promise.resolve(false) },
    storage: {
      delete: (key: string) => {
        deletedKeys.push(key);
        return Promise.resolve();
      },
      put: () => Promise.resolve(),
    },
  });

  await assert.rejects(
    () =>
      service.create(context, csvFile(), {
        defaultCountryCode: "IN",
        groupId: "00000000-0000-4000-8000-000000000015",
        mapping: { phone: "phone" },
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CONTACT_GROUP_NOT_FOUND",
  );
  assert.equal(deletedKeys.length, 1);
});

function createService(overrides: Record<string, unknown>): ContactImportService {
  const tenantScope = {
    requireTenantContext: () => ({
      actorId,
      permissions: context.permissions,
      requestId: context.requestId,
      roleSystemKey: "TENANT_ADMIN" as const,
      sessionId: context.sessionId,
      tenantId,
    }),
  } as unknown as TenantScopeService;
  const transactions = {
    execute: <T>(work: (transaction: object) => Promise<T>) => work({}),
  } as unknown as DatabaseTransactionManager;
  const repository = {
    audit: () => Promise.resolve(),
    create: () => Promise.resolve({ id: "00000000-0000-4000-8000-000000000014" }),
    ...(overrides as object),
  } as unknown as ContactImportRepository;
  const groups = (overrides.groups ?? {
    hasActiveGroup: () => Promise.resolve(true),
  }) as GroupRepository;
  const outbox = (overrides.outbox ?? { create: () => Promise.resolve() }) as OutboxRepository;
  const scanner = (overrides.scanner ?? { scan: () => Promise.resolve() }) as ClamAvScanner;
  const storage = (overrides.storage ?? {
    delete: () => Promise.resolve(),
    put: () => Promise.resolve(),
  }) as S3ObjectStorage;
  return new ContactImportService(
    repository,
    groups,
    transactions,
    outbox,
    tenantScope,
    scanner,
    storage,
    { maxImportFileBytes: 10_485_760 } as RuntimeConfig["uploads"],
  );
}

function csvFile(): Express.Multer.File {
  return {
    buffer: Buffer.from("phone\n9876543210\n"),
    originalname: "contacts.csv",
  } as Express.Multer.File;
}
