import assert from "node:assert/strict";
import test from "node:test";
import type { CampaignDraftInput } from "@whatsapp-platform/contracts";
import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { parseCampaignInput, parseUpdateCampaignInput } from "./campaign.dto.js";
import type { CampaignRepository } from "./campaign.repository.js";
import { CampaignService } from "./campaign.service.js";
import { campaignRevision } from "./campaign-revision.js";

const id = "00000000-0000-4000-8000-000000000001";
const input: CampaignDraftInput = {
  name: "Reminders",
  description: null,
  whatsappAccountId: id,
  templateId: id,
  audienceDefinition: { version: 1, contactIds: [], groupIds: [] },
  variableMapping: {},
};
const existing = {
  ...input,
  id,
  status: "DRAFT",
  contentVersion: 2,
  updatedAt: "2026-10-13T00:00:00.000Z",
  createdAt: "2026-10-13T00:00:00.000Z",
  approvalStatus: "APPROVED",
  approvedVersion: 2,
  scheduleAt: null,
  scheduleTimezone: "UTC",
  templateContentVersion: null,
};
const context: AuthorizationContext = {
  actorId: id,
  tenantId: id,
  isPlatformActor: false,
  roleSystemKey: "TENANT_USER",
  roleId: id,
  roleName: "User",
  email: "user@example.test",
  requestId: "campaign-test",
  sessionId: id,
  permissions: new Set(["campaign.read", "campaign.write"]),
};
const transactions = {
  execute: <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>) =>
    work({} as AppDatabaseTransaction),
} as DatabaseTransactionManager;
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const repository = {
    references: () => Promise.resolve({ templateFound: true, contactCount: 0, groupCount: 0 }),
    lock: () => Promise.resolve(existing),
    create: (...args: readonly unknown[]) => {
      calls.push({ method: "create", args });
      return Promise.resolve({ ...existing, approvalStatus: String(args[4]) });
    },
    update: (...args: readonly unknown[]) => {
      calls.push({ method: "update", args });
      return Promise.resolve(existing);
    },
    audit: (...args: readonly unknown[]) => {
      calls.push({ method: "audit", args });
      return Promise.resolve();
    },
    invalidatePreflight: (...args: readonly unknown[]) => {
      calls.push({ method: "invalidatePreflight", args });
      return Promise.resolve();
    },
    ...overrides,
  } as unknown as CampaignRepository;
  return {
    calls,
    service: new CampaignService(repository, transactions, new TenantScopeService(), {} as never),
  };
}
const update = {
  ...input,
  expectedContentVersion: 2,
  expectedRevision: campaignRevision(existing),
};
const hasCode = (code: string) => (error: unknown) =>
  error instanceof Error && "code" in error && error.code === code;

void test("normalizes audience sets and validates mapping sources without accepting tenant/status fields", () => {
  const parsed = parseCampaignInput({
    ...input,
    audienceDefinition: { version: 1, contactIds: [id.toUpperCase(), id], groupIds: [] },
    variableMapping: { "1": { source: "CONTACT_FIELD", field: "name" } },
  });
  assert.deepEqual(parsed.audienceDefinition.contactIds, [id]);
  for (const invalid of [
    { ...input, tenantId: id },
    { ...input, approvalStatus: "APPROVED" },
    { ...input, variableMapping: { "1": { source: "CONTACT_FIELD", field: "password" } } },
    { ...input, audienceDefinition: { version: 1, contactIds: [], groupIds: [], segments: [] } },
    {
      ...input,
      variableMapping: JSON.parse('{"__proto__":{"source":"LITERAL","value":"x"}}') as unknown,
    },
  ])
    assert.throws(() => parseCampaignInput(invalid));
  assert.throws(() => parseUpdateCampaignInput({ ...input, expectedContentVersion: 2 }));
});
void test("User drafts require approval while Admin drafts need no second reviewer", async () => {
  for (const role of ["TENANT_USER", "TENANT_ADMIN"] as const) {
    const { service, calls } = fixture();
    await service.create({ ...context, roleSystemKey: role }, input);
    assert.equal(calls[0]?.args[4], role === "TENANT_ADMIN" ? "NOT_REQUIRED" : "DRAFT");
    assert.equal(calls[1]?.method, "audit");
  }
});
void test("material User edits increment version and invalidate prior approval; Admin material edits use NOT_REQUIRED", async () => {
  for (const role of ["TENANT_USER", "TENANT_ADMIN"] as const) {
    const { service, calls } = fixture();
    await service.update({ ...context, roleSystemKey: role }, id, {
      ...update,
      variableMapping: { "1": { source: "LITERAL", value: "Hello" } },
    });
    assert.equal(calls[0]?.args[4], 2);
    assert.equal(calls[0].args[5], role === "TENANT_ADMIN" ? "NOT_REQUIRED" : "DRAFT");
    assert.equal(calls[0].args[6], true);
  }
});
void test("metadata-only edits preserve approval and material version", async () => {
  const { service, calls } = fixture();
  await service.update(context, id, { ...update, name: "Renamed" });
  assert.equal(calls[0]?.args[6], false);
});
void test("stale material or metadata snapshots and non-draft campaigns cannot be edited", async () => {
  const { service, calls } = fixture();
  await assert.rejects(
    service.update(context, id, { ...update, expectedContentVersion: 1 }),
    hasCode("CAMPAIGN_VERSION_CONFLICT"),
  );
  await assert.rejects(
    service.update(context, id, { ...update, expectedRevision: "0".repeat(64) }),
    hasCode("CAMPAIGN_VERSION_CONFLICT"),
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    fixture({ lock: () => Promise.resolve({ ...existing, status: "QUEUED" }) }).service.update(
      context,
      id,
      update,
    ),
    hasCode("CAMPAIGN_NOT_EDITABLE"),
  );
});
void test("missing/cross-tenant selections produce no campaign writes", async () => {
  const { service, calls } = fixture({
    references: () => Promise.resolve({ templateFound: false, contactCount: 0, groupCount: 0 }),
  });
  await assert.rejects(service.create(context, input), hasCode("CAMPAIGN_REFERENCE_NOT_FOUND"));
  assert.equal(calls.length, 0);
  await assert.rejects(
    fixture({ lock: () => Promise.resolve(undefined) }).service.update(context, id, update),
    hasCode("CAMPAIGN_NOT_FOUND"),
  );
});
void test("Super Admin and missing permissions fail before repository access", () => {
  const { service, calls } = fixture();
  assert.throws(
    () =>
      service.create({ ...context, isPlatformActor: true, roleSystemKey: "SUPER_ADMIN" }, input),
    hasCode("FORBIDDEN"),
  );
  assert.throws(
    () => service.create({ ...context, permissions: new Set() }, input),
    hasCode("FORBIDDEN"),
  );
  assert.equal(calls.length, 0);
});
