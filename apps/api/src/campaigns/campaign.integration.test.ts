import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { createDatabaseClient, createDatabasePool } from "../database/database.client.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  campaignPreflightRunsInApp,
  campaignsInApp,
  contactGroupsInApp,
  contactsInApp,
  rolesInApp,
  templatesInApp,
  tenantsInApp,
  usersInApp,
  whatsappAccountsInApp,
  outboxEventsInApp,
  userTenantScopesInApp,
  rolePermissionsInApp,
  permissionsInApp,
  plansInApp,
  subscriptionsInApp,
  providerCredentialsInApp,
  campaignRecipientsInApp,
  messagesInApp,
} from "../database/schema/index.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { CampaignRepository } from "./campaign.repository.js";
import { CampaignService } from "./campaign.service.js";
import { CampaignLifecycleService } from "./campaign-lifecycle.service.js";
import { CampaignLifecycleRepository } from "./campaign-lifecycle.repository.js";
import { CampaignExecutionService } from "./campaign-execution.service.js";
import { CampaignExecutionRepository } from "./campaign-execution.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";

if (process.env.NODE_ENV === "production")
  throw new Error("Campaign fixtures cannot run in production.");
const pool = createDatabasePool({
  poolMax: 2,
  poolMin: 0,
  url:
    process.env.DATABASE_URL ??
    "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
});
const database = createDatabaseClient(pool);
after(async () => {
  await pool.end();
});
const rollback = new Error("rollback campaign fixtures");
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && "code" in error && error.code === expected;

async function fixture(transaction: AppDatabaseTransaction) {
  const tenantId = randomUUID(),
    otherTenantId = randomUUID(),
    roleId = randomUUID(),
    actorId = randomUUID(),
    reviewerId = randomUUID(),
    accountId = randomUUID(),
    templateId = randomUUID(),
    contactId = randomUUID(),
    groupId = randomUUID();
  await transaction.insert(tenantsInApp).values([
    { id: tenantId, name: "Campaign test", slug: randomUUID(), status: "ACTIVE" },
    { id: otherTenantId, name: "Other test", slug: randomUUID(), status: "ACTIVE" },
  ]);
  await transaction.insert(rolesInApp).values({ id: roleId, tenantId, name: "Test member" });
  await transaction.insert(usersInApp).values(
    [actorId, reviewerId].map((id) => ({
      id,
      homeTenantId: tenantId,
      roleId,
      email: `${id}@example.test`,
      passwordHash: "test-only-not-a-login-hash",
      displayName: "Test member",
      status: "ACTIVE",
    })),
  );
  await transaction.insert(whatsappAccountsInApp).values({
    id: accountId,
    tenantId,
    wabaId: randomUUID(),
    phoneNumberId: randomUUID(),
    displayPhone: "+919876543210",
    status: "DISCONNECTED",
  });
  await transaction.insert(templatesInApp).values({
    id: templateId,
    tenantId,
    whatsappAccountId: accountId,
    name: "reminder",
    language: "en_US",
    category: "UTILITY",
    providerStatus: "DRAFT",
  });
  await transaction
    .insert(contactsInApp)
    .values({ id: contactId, tenantId, phoneE164: "+919876543210", consentStatus: "UNKNOWN" });
  await transaction
    .insert(contactGroupsInApp)
    .values({ id: groupId, tenantId, name: "Appointments" });
  const context: AuthorizationContext = {
    actorId,
    roleId,
    tenantId,
    roleSystemKey: "TENANT_USER",
    roleName: "Test User",
    email: `${actorId}@example.test`,
    isPlatformActor: false,
    requestId: randomUUID(),
    sessionId: randomUUID(),
    permissions: new Set(["campaign.read", "campaign.write"]),
  };
  const repository = new CampaignRepository(transaction);
  const transactions = {
    execute: <T>(work: (tx: AppDatabaseTransaction) => Promise<T>) => work(transaction),
  } as DatabaseTransactionManager;
  const service = new CampaignService(
    repository,
    transactions,
    new TenantScopeService(),
    new OutboxRepository(),
  );
  const input = {
    name: "Draft",
    description: null,
    whatsappAccountId: accountId,
    templateId,
    audienceDefinition: { version: 1 as const, contactIds: [contactId], groupIds: [groupId] },
    variableMapping: { "1": { source: "CONTACT_FIELD" as const, field: "name" as const } },
  };
  return {
    actorId,
    accountId,
    templateId,
    transactions,
    repository,
    context,
    otherTenantId,
    service,
    input,
    reviewerId,
    transaction,
    tenantId,
    contactId,
    groupId,
  };
}

async function deliveryFixture(tx: AppDatabaseTransaction) {
  const data = await fixture(tx);
  const adminRole = randomUUID(),
    plan = randomUUID();
  await tx
    .update(rolesInApp)
    .set({ systemKey: "TENANT_USER" })
    .where(eq(rolesInApp.id, data.context.roleId));
  await tx.insert(rolesInApp).values({
    id: adminRole,
    tenantId: data.tenantId,
    name: "Test Admin",
    systemKey: "TENANT_ADMIN",
  });
  await tx.update(usersInApp).set({ roleId: adminRole }).where(eq(usersInApp.id, data.reviewerId));
  await tx.insert(userTenantScopesInApp).values([
    { userId: data.actorId, tenantId: data.tenantId, roleId: data.context.roleId },
    { userId: data.reviewerId, tenantId: data.tenantId, roleId: adminRole },
  ]);
  const keys = [
    "campaign.read",
    "campaign.write",
    "campaign.approve",
    "campaign.send",
    "campaign.cancel",
  ];
  await tx
    .insert(permissionsInApp)
    .values(keys.map((permissionKey) => ({ permissionKey, description: "Fixture" })))
    .onConflictDoNothing();
  const permissions = await tx.select().from(permissionsInApp);
  await tx
    .insert(rolePermissionsInApp)
    .values(
      permissions
        .filter((p) => keys.includes(p.permissionKey))
        .map((p) => ({ roleId: adminRole, permissionId: p.id })),
    );
  await tx.insert(plansInApp).values({
    id: plan,
    code: plan,
    name: "Fixture",
    status: "ACTIVE",
    limits: { monthly_message_limit: 1000000 },
  });
  await tx.insert(subscriptionsInApp).values({
    tenantId: data.tenantId,
    planId: plan,
    status: "ACTIVE",
    startsAt: new Date(Date.now() - 86400000).toISOString(),
  });
  await tx
    .update(whatsappAccountsInApp)
    .set({ status: "CONNECTED" })
    .where(eq(whatsappAccountsInApp.id, data.accountId));
  await tx.insert(providerCredentialsInApp).values({
    tenantId: data.tenantId,
    whatsappAccountId: data.accountId,
    provider: "META",
    secretRef: "env://test",
    status: "ACTIVE",
  });
  await tx
    .update(templatesInApp)
    .set({
      providerStatus: "APPROVED",
      approvalStatus: "NOT_REQUIRED",
      components: [{ type: "BODY", text: "Hello {{1}}" }],
    })
    .where(eq(templatesInApp.id, data.templateId));
  await tx
    .update(contactsInApp)
    .set({
      name: "Ada",
      consentStatus: "OPTED_IN",
      consentSource: "TEST",
      consentAt: new Date().toISOString(),
      consentProofReference: "test",
    })
    .where(eq(contactsInApp.id, data.contactId));
  const admin: AuthorizationContext = {
    ...data.context,
    actorId: data.reviewerId,
    roleId: adminRole,
    roleSystemKey: "TENANT_ADMIN",
    permissions: new Set(keys),
  };
  const lifecycle = new CampaignLifecycleService(
    new CampaignLifecycleRepository(tx),
    data.repository,
    data.service,
    data.transactions,
    new TenantScopeService(),
  );
  const execution = new CampaignExecutionService(
    new CampaignExecutionRepository(tx),
    data.transactions,
    new MessagingService(
      new MessagingRepository(),
      data.transactions,
      new TenantScopeService(),
      new OutboxRepository(),
    ),
    new OutboxRepository(),
  );
  return { ...data, admin, lifecycle, execution, plan };
}
function command(
  draft: { contentVersion: number; revision: string },
  idempotencyKey: string | null = null,
) {
  return {
    expectedContentVersion: draft.contentVersion,
    expectedRevision: draft.revision,
    reason: null,
    idempotencyKey,
  };
}

void test("Phase5 SQL approval, final-preflight handoff, composition, duplicate start, pause and cancellation", async () => {
  await assert.rejects(
    database.transaction(async (tx) => {
      const d = await deliveryFixture(tx);
      let draft = await d.service.create(d.context, d.input);
      await assert.rejects(
        d.lifecycle.command(d.admin, draft.id, "send", command(draft, "start")),
        code("CAMPAIGN_APPROVAL_REQUIRED"),
      );
      draft = await d.lifecycle.command(d.context, draft.id, "request-approval", command(draft));
      await assert.rejects(
        d.lifecycle.command(
          { ...d.admin, actorId: d.actorId },
          draft.id,
          "approve",
          command(draft),
        ),
        code("FORBIDDEN"),
      );
      draft = await d.lifecycle.command(d.admin, draft.id, "approve", command(draft));
      const start = command(draft, "start");
      draft = await d.lifecycle.command(d.admin, draft.id, "send", start);
      await d.lifecycle.command(d.admin, draft.id, "send", start);
      await d.execution.advance(d.tenantId, draft.id);
      const [row] = await tx.select().from(campaignsInApp).where(eq(campaignsInApp.id, draft.id));
      assert.ok(row?.finalPreflightId);
      await tx
        .update(campaignPreflightRunsInApp)
        .set({ status: "COMPLETED", blockers: [], completedAt: new Date().toISOString() })
        .where(eq(campaignPreflightRunsInApp.id, row.finalPreflightId));
      await tx.insert(campaignRecipientsInApp).values({
        tenantId: d.tenantId,
        campaignId: draft.id,
        contactId: d.contactId,
        preflightRunId: row.finalPreflightId,
        contentVersion: 1,
        status: "PENDING",
        renderedVariables: { "1": "Ada" },
      });
      await d.execution.advance(d.tenantId, draft.id);
      await d.execution.advance(d.tenantId, draft.id);
      const messages = await tx
        .select()
        .from(messagesInApp)
        .where(eq(messagesInApp.campaignId, draft.id));
      assert.equal(messages.length, 1);
      assert.equal(messages[0]?.status, "CREATED");
      const usages = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from app.usage_events where tenant_id=${d.tenantId}`,
      );
      assert.equal(usages.rows[0]?.count, 1);
      draft = await d.service.read(d.admin, draft.id);
      draft = await d.lifecycle.command(d.admin, draft.id, "pause", command(draft));
      assert.equal(draft.status, "PAUSED");
      draft = await d.lifecycle.command(d.admin, draft.id, "resume", command(draft));
      draft = await d.lifecycle.command(d.admin, draft.id, "cancel", command(draft));
      assert.equal(draft.status, "CANCELLED");
      const report = await d.lifecycle.report(d.admin, draft.id);
      assert.deepEqual(report.counts, [{ status: "CANCELLED", count: 1 }]);
      const retainedUsage = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from app.usage_events where tenant_id=${d.tenantId}`,
      );
      assert.equal(retainedUsage.rows[0]?.count, 1);
      await assert.rejects(
        d.lifecycle.report({ ...d.admin, tenantId: d.otherTenantId }, draft.id),
        code("CAMPAIGN_NOT_FOUND"),
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

void test("Phase5 SQL scheduled delivery rechecks when due, and failed final preflight pauses without messages", async () => {
  await assert.rejects(
    database.transaction(async (tx) => {
      const d = await deliveryFixture(tx);
      let draft = await d.service.create(d.admin, {
        ...d.input,
        scheduleAt: new Date(Date.now() + 3600000).toISOString(),
        scheduleTimezone: "UTC",
      });
      draft = await d.lifecycle.command(d.admin, draft.id, "schedule", command(draft, "schedule"));
      await d.execution.advance(d.tenantId, draft.id);
      const [initial] = await tx
        .select()
        .from(campaignsInApp)
        .where(eq(campaignsInApp.id, draft.id));
      assert.ok(initial?.finalPreflightId);
      await tx
        .update(campaignPreflightRunsInApp)
        .set({ status: "COMPLETED", blockers: [] })
        .where(eq(campaignPreflightRunsInApp.id, initial.finalPreflightId));
      await d.execution.advance(d.tenantId, draft.id);
      assert.equal((await d.service.read(d.admin, draft.id)).status, "SCHEDULED");
      // Move the persisted due time only inside this rollback fixture; do not sleep or change the host clock.
      await tx
        .update(campaignsInApp)
        .set({ scheduleAt: new Date(Date.now() - 60000).toISOString() })
        .where(eq(campaignsInApp.id, draft.id));
      await d.execution.advance(d.tenantId, draft.id);
      const [due] = await tx.select().from(campaignsInApp).where(eq(campaignsInApp.id, draft.id));
      assert.ok(due?.finalPreflightId);
      assert.notEqual(due.finalPreflightId, initial.finalPreflightId);
      await tx
        .update(campaignPreflightRunsInApp)
        .set({ status: "FAILED", errorCode: "TEST_FAILURE" })
        .where(eq(campaignPreflightRunsInApp.id, due.finalPreflightId));
      await d.execution.advance(d.tenantId, draft.id);
      const paused = await d.service.read(d.admin, draft.id);
      assert.equal(paused.status, "PAUSED");
      assert.equal(paused.pauseReason, "CAMPAIGN_PREFLIGHT_FAILED");
      assert.equal(
        (await tx.select().from(messagesInApp).where(eq(messagesInApp.campaignId, draft.id)))
          .length,
        0,
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

void test("Phase5 SQL competing quota consumption pauses expansion without reserving usage", async () => {
  await assert.rejects(
    database.transaction(async (tx) => {
      const d = await deliveryFixture(tx);
      let draft = await d.service.create(d.admin, d.input);
      draft = await d.lifecycle.command(d.admin, draft.id, "send", command(draft, "quota"));
      await d.execution.advance(d.tenantId, draft.id);
      const [row] = await tx.select().from(campaignsInApp).where(eq(campaignsInApp.id, draft.id));
      assert.ok(row?.finalPreflightId);
      await tx
        .update(campaignPreflightRunsInApp)
        .set({ status: "COMPLETED", blockers: [] })
        .where(eq(campaignPreflightRunsInApp.id, row.finalPreflightId));
      await tx.insert(campaignRecipientsInApp).values({
        tenantId: d.tenantId,
        campaignId: draft.id,
        contactId: d.contactId,
        preflightRunId: row.finalPreflightId,
        contentVersion: 1,
        status: "PENDING",
        renderedVariables: { "1": "Ada" },
      });
      await tx
        .update(plansInApp)
        .set({ limits: { monthly_message_limit: 0 } })
        .where(eq(plansInApp.id, d.plan));
      await d.execution.advance(d.tenantId, draft.id);
      const paused = await d.service.read(d.admin, draft.id);
      assert.equal(paused.status, "PAUSED");
      assert.equal(paused.pauseReason, "MESSAGE_QUOTA_INSUFFICIENT");
      assert.equal(
        (await tx.select().from(messagesInApp).where(eq(messagesInApp.campaignId, draft.id)))
          .length,
        0,
      );
      const usages = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from app.usage_events where tenant_id=${d.tenantId}`,
      );
      assert.equal(usages.rows[0]?.count, 0);
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

void test("Phase5 SQL schedule invalidation and template change prevent stale publication", async () => {
  await assert.rejects(
    database.transaction(async (tx) => {
      const d = await deliveryFixture(tx);
      let draft = await d.service.create(d.context, d.input);
      draft = await d.lifecycle.command(d.context, draft.id, "request-approval", command(draft));
      draft = await d.lifecycle.command(d.admin, draft.id, "approve", command(draft));
      draft = await d.service.update(d.context, draft.id, {
        ...d.input,
        scheduleAt: "2030-01-01T09:00:00+05:30",
        scheduleTimezone: "Asia/Kolkata",
        expectedContentVersion: draft.contentVersion,
        expectedRevision: draft.revision,
      });
      assert.equal(draft.contentVersion, 2);
      assert.equal(draft.approvalStatus, "DRAFT");
      const same = await d.service.update(d.context, draft.id, {
        ...d.input,
        scheduleAt: "2030-01-01T03:30:00Z",
        scheduleTimezone: "Asia/Kolkata",
        expectedContentVersion: draft.contentVersion,
        expectedRevision: draft.revision,
      });
      assert.equal(same.contentVersion, 2);
      draft = await d.lifecycle.command(d.context, draft.id, "request-approval", command(same));
      await tx
        .update(templatesInApp)
        .set({ contentVersion: 2 })
        .where(eq(templatesInApp.id, d.templateId));
      await assert.rejects(
        d.lifecycle.command(d.admin, draft.id, "approve", command(draft)),
        code("CAMPAIGN_TEMPLATE_CHANGED"),
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

void test(
  "isolated database: concurrent starts and concurrent expansion create one campaign send and one reservation",
  { timeout: 120000 },
  async () => {
    // Only this generated database is created/dropped; running workers remain on their normal DB.
    const name = `phase5_${randomUUID().replaceAll("-", "")}`;
    if (!/^phase5_[0-9a-f]{32}$/u.test(name))
      throw new Error("Invalid isolated fixture database name");
    await pool.query(`CREATE DATABASE "${name}"`);
    const url = new URL(
      process.env.DATABASE_URL ??
        "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
    );
    url.pathname = `/${name}`;
    const isolatedPool = createDatabasePool({ url: url.toString(), poolMin: 0, poolMax: 6 });
    const isolated = createDatabaseClient(isolatedPool);
    try {
      await migrate(isolated, {
        migrationsFolder: fileURLToPath(new URL("../../database/migrations", import.meta.url)),
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });
      const seeded = await isolated.transaction(async (tx) => {
        const data = await deliveryFixture(tx);
        const draft = await data.service.create(data.admin, data.input);
        return {
          admin: data.admin,
          input: data.input,
          tenantId: data.tenantId,
          contactId: data.contactId,
          draft,
        };
      });
      const transactions = new DatabaseTransactionManager(isolated),
        repository = new CampaignRepository(isolated);
      const campaigns = new CampaignService(
        repository,
        transactions,
        new TenantScopeService(),
        new OutboxRepository(),
      );
      const lifecycle = new CampaignLifecycleService(
        new CampaignLifecycleRepository(isolated),
        repository,
        campaigns,
        transactions,
        new TenantScopeService(),
      );
      const execution = new CampaignExecutionService(
        new CampaignExecutionRepository(isolated),
        transactions,
        new MessagingService(
          new MessagingRepository(),
          transactions,
          new TenantScopeService(),
          new OutboxRepository(),
        ),
        new OutboxRepository(),
      );
      const start = command(seeded.draft, "concurrent-start");
      const started = await Promise.all([
        lifecycle.command(seeded.admin, seeded.draft.id, "send", start),
        lifecycle.command(seeded.admin, seeded.draft.id, "send", start),
      ]);
      assert.equal(started[0].id, started[1].id);
      await execution.advance(seeded.tenantId, seeded.draft.id);
      await isolated.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(campaignsInApp)
          .where(eq(campaignsInApp.id, seeded.draft.id));
        assert.ok(row?.finalPreflightId);
        await tx
          .update(campaignPreflightRunsInApp)
          .set({ status: "COMPLETED", blockers: [] })
          .where(eq(campaignPreflightRunsInApp.id, row.finalPreflightId));
        await tx.insert(campaignRecipientsInApp).values({
          tenantId: seeded.tenantId,
          campaignId: row.id,
          contactId: seeded.contactId,
          preflightRunId: row.finalPreflightId,
          contentVersion: 1,
          status: "PENDING",
          renderedVariables: { "1": "Ada" },
        });
      });
      await Promise.all([
        execution.advance(seeded.tenantId, seeded.draft.id),
        execution.advance(seeded.tenantId, seeded.draft.id),
      ]);
      assert.equal((await isolated.select().from(messagesInApp)).length, 1);
      const reservations = await isolated.execute<{ count: number }>(
        sql`select count(*)::int as count from app.usage_events`,
      );
      assert.equal(reservations.rows[0]?.count, 1);
      const another = await campaigns.create(seeded.admin, seeded.input);
      const competing = await Promise.allSettled([
        lifecycle.command(seeded.admin, another.id, "send", command(another, "key-a")),
        lifecycle.command(seeded.admin, another.id, "send", command(another, "key-b")),
      ]);
      assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
    } finally {
      await isolatedPool.end();
      await pool.query(`DROP DATABASE "${name}"`);
    }
  },
);

void test("queues one durable version-bound preflight and returns the active run idempotently", async () => {
  await assert.rejects(
    database.transaction(async (transaction) => {
      const data = await fixture(transaction);
      const draft = await data.service.create(data.context, data.input);
      const first = await data.service.preflight(data.context, draft.id);
      const second = await data.service.preflight(data.context, draft.id);
      assert.equal(first.id, second.id);
      assert.equal(first.status, "QUEUED");
      const runs = await transaction
        .select({ id: campaignPreflightRunsInApp.id })
        .from(campaignPreflightRunsInApp)
        .where(eq(campaignPreflightRunsInApp.campaignId, draft.id));
      const events = await transaction
        .select({ eventType: outboxEventsInApp.eventType })
        .from(outboxEventsInApp)
        .where(eq(outboxEventsInApp.aggregateId, first.id));
      assert.equal(runs.length, 1);
      assert.deepEqual(events, [{ eventType: "campaign.preflight.queued" }]);
      throw rollback;
    }),
    (error) => error === rollback,
  );
});
async function isolated(work: (current: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  await assert.rejects(
    database.transaction(async (transaction) => {
      await work(await fixture(transaction));
      throw rollback;
    }),
    (error: unknown) => error === rollback,
  );
}

void test("campaign drafts preserve approval for metadata, invalidate material edits and atomically audit the new version", async () => {
  await isolated(
    async ({ context, service, input, reviewerId, transaction, groupId, tenantId }) => {
      const created = await service.create(context, input);
      assert.equal(created.status, "DRAFT");
      assert.equal(created.approvalStatus, "DRAFT");
      // Seed exact-version approval directly: TASK-055 owns its HTTP workflow.
      await transaction
        .update(campaignsInApp)
        .set({
          approvalStatus: "APPROVED",
          approvalRequestedBy: context.actorId,
          approvalRequestedAt: new Date().toISOString(),
          reviewedBy: reviewerId,
          reviewedAt: new Date().toISOString(),
          approvedVersion: 1,
        })
        .where(eq(campaignsInApp.id, created.id));
      const approved = await service.read(context, created.id);
      const renamed = await service.update(context, created.id, {
        ...input,
        name: "Renamed",
        expectedContentVersion: 1,
        expectedRevision: approved.revision,
      });
      assert.equal(renamed.contentVersion, 1);
      assert.equal(renamed.approvalStatus, "APPROVED");
      await assert.rejects(
        service.update(context, created.id, {
          ...input,
          expectedContentVersion: 1,
          expectedRevision: approved.revision,
        }),
        code("CAMPAIGN_VERSION_CONFLICT"),
      );
      const changed = await service.update(context, created.id, {
        ...input,
        audienceDefinition: { version: 1, contactIds: [], groupIds: [groupId] },
        expectedContentVersion: 1,
        expectedRevision: renamed.revision,
      });
      assert.equal(changed.contentVersion, 2);
      assert.equal(changed.approvalStatus, "DRAFT");
      assert.equal(changed.approvedVersion, null);
      const [stored] = await transaction
        .select()
        .from(campaignsInApp)
        .where(eq(campaignsInApp.id, created.id));
      assert.equal(stored?.reviewedBy, null);
      assert.equal(stored.approvalRequestedBy, null);
      const audits = await transaction
        .select()
        .from(auditLogsInApp)
        .where(and(eq(auditLogsInApp.tenantId, tenantId), eq(auditLogsInApp.entityId, created.id)));
      assert.equal(audits.length, 3);
      assert.equal(
        JSON.stringify(audits.map((audit) => audit.metadata)).includes("919876543210"),
        false,
      );
    },
  );
});
void test("campaign content and options cannot cross tenants or use soft-deleted selections", async () => {
  await isolated(async ({ context, otherTenantId, service, input, transaction, contactId }) => {
    const created = await service.create(context, input);
    const other = { ...context, tenantId: otherTenantId };
    await assert.rejects(service.read(other, created.id), code("CAMPAIGN_NOT_FOUND"));
    await assert.rejects(
      service.update(other, created.id, {
        ...input,
        expectedContentVersion: 1,
        expectedRevision: created.revision,
      }),
      code("CAMPAIGN_NOT_FOUND"),
    );
    await assert.rejects(service.create(other, input), code("CAMPAIGN_REFERENCE_NOT_FOUND"));
    assert.deepEqual(await service.options(other), { accounts: [], templates: [], groups: [] });
    await transaction
      .update(contactsInApp)
      .set({ isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: context.actorId })
      .where(eq(contactsInApp.id, contactId));
    await assert.rejects(service.create(context, input), code("CAMPAIGN_REFERENCE_NOT_FOUND"));
    await transaction
      .update(campaignsInApp)
      .set({ isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: context.actorId })
      .where(eq(campaignsInApp.id, created.id));
    assert.deepEqual((await service.list(context)).campaigns, []);
    await assert.rejects(service.read(context, created.id), code("CAMPAIGN_NOT_FOUND"));
  });
});
void test("Admin material edits clear review fields without a second approval and audit failure rolls back draft creation", async () => {
  await isolated(async ({ context, service, input, transaction, tenantId }) => {
    const admin = { ...context, roleSystemKey: "TENANT_ADMIN" as const };
    const created = await service.create(admin, input);
    assert.equal(created.approvalStatus, "NOT_REQUIRED");
    const changed = await service.update(admin, created.id, {
      ...input,
      variableMapping: {},
      expectedContentVersion: 1,
      expectedRevision: created.revision,
    });
    assert.equal(changed.contentVersion, 2);
    assert.equal(changed.approvalStatus, "NOT_REQUIRED");
    const repository = new CampaignRepository(transaction);
    repository.audit = () => Promise.reject(new Error("audit unavailable"));
    const failing = new CampaignService(
      repository,
      {
        execute: <T>(work: (tx: AppDatabaseTransaction) => Promise<T>) =>
          transaction.transaction(work),
      } as DatabaseTransactionManager,
      new TenantScopeService(),
      {} as never,
    );
    await assert.rejects(
      failing.create(admin, { ...input, name: "Must roll back" }),
      /audit unavailable/u,
    );
    const rows = await transaction
      .select({ id: campaignsInApp.id })
      .from(campaignsInApp)
      .where(and(eq(campaignsInApp.tenantId, tenantId), eq(campaignsInApp.name, "Must roll back")));
    assert.equal(rows.length, 0);
  });
});
