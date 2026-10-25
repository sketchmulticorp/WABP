import assert from "node:assert/strict";
import test from "node:test";
import { CampaignLifecycleService } from "./campaign-lifecycle.service.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import { campaignRevision } from "./campaign-revision.js";
import { parseCampaignCommand, parseCampaignInput } from "./campaign.dto.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";

const id = "00000000-0000-4000-8000-000000000001";
const user: AuthorizationContext = {
  actorId: id,
  tenantId: id,
  roleId: id,
  roleName: "User",
  roleSystemKey: "TENANT_USER",
  email: "test@example.test",
  isPlatformActor: false,
  sessionId: id,
  requestId: id,
  permissions: new Set(["campaign.read", "campaign.write"]),
};
const admin: AuthorizationContext = {
  ...user,
  actorId: "00000000-0000-4000-8000-000000000002",
  roleSystemKey: "TENANT_ADMIN",
  permissions: new Set([
    "campaign.read",
    "campaign.write",
    "campaign.approve",
    "campaign.send",
    "campaign.cancel",
  ]),
};
function harness() {
  let record = {
    id,
    name: "Test",
    description: null,
    whatsappAccountId: id,
    templateId: id,
    audienceDefinition: { version: 1, contactIds: [], groupIds: [] },
    variableMapping: {},
    contentVersion: 1,
    status: "DRAFT",
    approvalStatus: "DRAFT",
    approvedVersion: null as number | null,
    approvalRequestedBy: null as string | null,
    templateContentVersion: null as number | null,
    updatedAt: "2026-10-15T00:00:00Z",
    scheduleAt: null as string | null,
    scheduleTimezone: "UTC",
    startedAt: null,
    startKey: null as string | null,
    startHash: null as string | null,
    deliveryRequestedBy: null as string | null,
  };
  let templateVersion = 1;
  const audits: string[] = [];
  const repository = {
    lock: () => Promise.resolve(record),
    template: () => Promise.resolve({ contentVersion: templateVersion }),
    update: (_tx: unknown, _tenant: string, _id: string, patch: object) => {
      record = { ...record, ...patch };
      return Promise.resolve();
    },
    cancelUnsent: () => Promise.resolve(),
  };
  const drafts = {
    lock: () => Promise.resolve(record),
    audit: (_tx: unknown, input: { action: string }) => {
      audits.push(input.action);
      return Promise.resolve();
    },
  };
  const transactions = { execute: <T>(work: (tx: never) => Promise<T>) => work({} as never) };
  const service = new CampaignLifecycleService(
    repository as never,
    drafts as never,
    { read: () => Promise.resolve(record) } as never,
    transactions as never,
    new TenantScopeService(),
  );
  return {
    service,
    audits,
    current: () => record,
    patch: (value: Partial<typeof record>) => {
      record = { ...record, ...value };
    },
    template: (version: number) => {
      templateVersion = version;
    },
    command: () => ({
      expectedContentVersion: record.contentVersion,
      expectedRevision: campaignRevision(record),
      reason: null,
      idempotencyKey: null as string | null,
    }),
  };
}
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && "code" in error && error.code === expected;

void test("User review is forbidden; Admin rejection records its reason and permits resubmission", async () => {
  const h = harness();
  await h.service.command(user, id, "request-approval", h.command());
  await assert.rejects(h.service.command(user, id, "approve", h.command()), code("FORBIDDEN"));
  const review = {
    expectedContentVersion: h.command().expectedContentVersion,
    expectedRevision: h.command().expectedRevision,
    reason: "Correct the audience before publishing.",
  };
  assert.throws(() => parseCampaignCommand({ ...review, reason: " " }, true));
  await h.service.command(admin, id, "reject", parseCampaignCommand(review, true));
  assert.equal(h.current().approvalStatus, "REJECTED");
  assert.equal(h.current().approvedVersion, null);
  await h.service.command(user, id, "request-approval", h.command());
  assert.equal(h.current().approvalStatus, "PENDING");
  assert.deepEqual(h.audits, [
    "CAMPAIGN_REQUEST_APPROVAL",
    "CAMPAIGN_REJECT",
    "CAMPAIGN_REQUEST_APPROVAL",
  ]);
});

void test("User requests exact-version approval; different Admin reviews and self-review is denied", async () => {
  const h = harness();
  await h.service.command(user, id, "request-approval", h.command());
  assert.equal(h.current().approvalStatus, "PENDING");
  assert.equal(h.current().templateContentVersion, 1);
  await assert.rejects(
    h.service.command({ ...admin, actorId: user.actorId }, id, "approve", h.command()),
    code("FORBIDDEN"),
  );
  await h.service.command(admin, id, "approve", h.command());
  assert.equal(h.current().approvedVersion, 1);
  assert.equal(h.current().approvalStatus, "APPROVED");
  assert.deepEqual(h.audits, ["CAMPAIGN_REQUEST_APPROVAL", "CAMPAIGN_APPROVE"]);
});
void test("stale review, unapproved start, changed template and platform actor cannot bypass gates", async () => {
  const h = harness();
  await assert.rejects(
    h.service.command(admin, id, "send", { ...h.command(), idempotencyKey: "start" }),
    code("CAMPAIGN_APPROVAL_REQUIRED"),
  );
  await h.service.command(user, id, "request-approval", h.command());
  await assert.rejects(
    h.service.command(admin, id, "approve", { ...h.command(), expectedContentVersion: 2 }),
    code("CAMPAIGN_VERSION_CONFLICT"),
  );
  h.template(2);
  await assert.rejects(
    h.service.command(admin, id, "approve", h.command()),
    code("CAMPAIGN_TEMPLATE_CHANGED"),
  );
  await assert.rejects(
    h.service.command(
      { ...admin, isPlatformActor: true, roleSystemKey: "SUPER_ADMIN" },
      id,
      "approve",
      h.command(),
    ),
    code("FORBIDDEN"),
  );
});
void test("start replay is idempotent, changed input conflicts, and pause/resume/cancel retain the version", async () => {
  const h = harness();
  h.patch({ approvalStatus: "NOT_REQUIRED" });
  const request = { ...h.command(), idempotencyKey: "stable-start" };
  await h.service.command(admin, id, "send", request);
  await h.service.command(admin, id, "send", request);
  assert.equal(h.audits.length, 1);
  await assert.rejects(
    h.service.command(admin, id, "send", { ...request, expectedContentVersion: 2 }),
    code("CAMPAIGN_IDEMPOTENCY_CONFLICT"),
  );
  await h.service.command(admin, id, "pause", h.command());
  assert.equal(h.current().status, "PAUSED");
  await h.service.command(admin, id, "resume", h.command());
  assert.equal(h.current().status, "QUEUED");
  await h.service.command(admin, id, "cancel", h.command());
  assert.equal(h.current().status, "CANCELLED");
  assert.equal(h.current().contentVersion, 1);
});
void test("schedule requires a saved future time; command parser rejects injection and invalid timezone", async () => {
  const h = harness();
  h.patch({ approvalStatus: "NOT_REQUIRED" });
  await assert.rejects(
    h.service.command(admin, id, "schedule", { ...h.command(), idempotencyKey: "schedule" }),
    code("CAMPAIGN_SCHEDULE_INVALID"),
  );
  h.patch({ scheduleAt: new Date(Date.now() + 3600000).toISOString() });
  await h.service.command(admin, id, "schedule", { ...h.command(), idempotencyKey: "schedule" });
  assert.equal(h.current().status, "QUEUED");
  assert.throws(() => parseCampaignCommand({ ...h.command(), tenantId: id }));
  const input = {
    name: "Scheduled campaign",
    whatsappAccountId: id,
    templateId: id,
    audienceDefinition: { version: 1, contactIds: [id], groupIds: [] },
    variableMapping: {},
    scheduleTimezone: "UTC",
  };
  assert.equal(parseCampaignInput(input).scheduleTimezone, "UTC");
  assert.throws(() => parseCampaignInput({ ...input, scheduleTimezone: "Invalid/Zone" }));
});
