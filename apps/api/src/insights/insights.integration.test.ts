import assert from "node:assert/strict";
import { TenantRoleProvisioningService } from "../authorization/tenant-role-provisioning.service.js";
import { SeedRepository } from "../database/seed/seed.repository.js";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { HttpException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import {
  withAutomationDatabase,
  automationFixture,
} from "../automation/automation.test-fixture.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import { TenantInsightsRepository } from "./tenant-insights.repository.js";
import { TenantInsightsService } from "./tenant-insights.service.js";
import { PlatformInsightsRepository } from "./platform-insights.repository.js";
import { PlatformInsightsService } from "./platform-insights.service.js";
import { PlatformRepository } from "../platform/platform.repository.js";
import { PlatformService } from "../platform/platform.service.js";
import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { parseInsightQuery } from "./insights.dto.js";
import { paymentsCsv } from "./exports/report-projections.js";
import { CampaignExportRepository } from "./exports/campaign-export.repository.js";
import { ReportExportRepository } from "./exports/report-export.repository.js";
import { ReportExportService } from "./exports/report-export.service.js";

const permissions = new Set(["report.read", "plan.read", "billing.read", "audit.read"]);
const tooLarge = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "REPORT_EXPORT_TOO_LARGE";

void test("SQL metrics/usage isolate businesses and retain historical reservations after Contact deletion", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database);
    await automationFixture(database);
    const context = { ...f.context, permissions },
      service = new TenantInsightsService(
        new TenantInsightsRepository(database),
        new TenantScopeService(),
      );
    assert.equal((await service.dashboard(context)).contacts, 1);
    await database.execute(
      sql`INSERT INTO app.usage_events(tenant_id,event_type,quantity,unit,dedupe_key,occurred_at) VALUES(${f.tenantId},'OUTBOUND_MESSAGE_RESERVED',7,'message',${randomUUID()},now())`,
    );
    assert.equal((await service.usage(context)).reservedMessages, 7);
    assert.equal((await service.usage(context)).remainingMessages, 93);
    await database.execute(
      sql`INSERT INTO app.messages(tenant_id,conversation_id,contact_id,whatsapp_account_id,direction,message_type,status,content) VALUES(${f.tenantId},${f.conversationId},${f.contactId},${f.accountId},'OUTBOUND','TEXT','READ','{"body":"PRIVATE_BODY"}'::jsonb)`,
    );
    await database.execute(
      sql`UPDATE app.contacts SET is_deleted=true,deleted_at=now(),deleted_by=${f.actorId} WHERE tenant_id=${f.tenantId} AND id=${f.contactId}`,
    );
    const dashboard = await service.dashboard(context);
    assert.equal(dashboard.contacts, 0);
    assert.equal(dashboard.openConversations, 0);
    assert.deepEqual(dashboard.outboundStatuses, [{ status: "READ", count: 1 }]);
    assert.equal((await service.usage(context)).reservedMessages, 7);
    const platform = await new PlatformInsightsRepository(database).metrics(dashboard.period);
    assert.equal(platform.contacts, 1);
    assert.ok(!JSON.stringify(platform).includes("PRIVATE_BODY"));
    await database.execute(
      sql`INSERT INTO app.subscriptions(tenant_id,plan_id,status,starts_at) VALUES(${f.tenantId},${f.planId},'ACTIVE',now()-interval '1 hour')`,
    );
    const ambiguous = await service.usage(context);
    assert.equal(ambiguous.ambiguousSubscription, true);
    assert.equal(ambiguous.messageLimit, null);
  }));

void test("SQL payment precision/pagination/tenant scope and 10,000-row export boundary", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database),
      foreign = await automationFixture(database);
    const context = { ...f.context, permissions },
      service = new TenantInsightsService(
        new TenantInsightsRepository(database),
        new TenantScopeService(),
      );
    const at = new Date().toISOString().replace(/\.\d{3}Z$/u, ".123456Z");
    for (const id of [f.tenantId, f.tenantId, foreign.tenantId])
      await database.execute(
        sql`INSERT INTO app.payment_records(tenant_id,recorded_by,amount_minor,currency,paid_at,reference,note) VALUES(${id},${f.actorId},9007199254740993,'INR',${at}::timestamptz,${randomUUID()},'PRIVATE_NOTE')`,
      );
    const first = await service.payments(context, parseInsightQuery({ limit: "1" }, "page"));
    assert.equal(first.items[0]?.amountMinor, "9007199254740993");
    assert.ok(!JSON.stringify(first).includes("PRIVATE_NOTE"));
    assert.ok(first.nextCursor);
    const second = await service.payments(
      context,
      parseInsightQuery({ limit: "1", cursor: first.nextCursor }, "page"),
    );
    assert.notEqual(second.items[0]?.id, first.items[0].id);
    assert.equal(second.nextCursor, null);
    await database.execute(
      sql`INSERT INTO app.payment_records(tenant_id,recorded_by,amount_minor,currency,paid_at,reference) SELECT ${f.tenantId}::uuid,${f.actorId}::uuid,1,'INR',now(),concat('bulk-',n) FROM generate_series(1,9998) n`,
    );
    const query = { ...parseInsightQuery({}, "page"), limit: 10000 };
    assert.equal((await service.payments(context, query)).items.length, 10000);
    assert.doesNotThrow(() => paymentsCsv({ items: [], nextCursor: null }));
    assert.equal(paymentsCsv(await service.payments(context, query)).rows.length, 10000);
    await database.execute(
      sql`INSERT INTO app.payment_records(tenant_id,recorded_by,amount_minor,currency,paid_at,reference) VALUES(${f.tenantId},${f.actorId},1,'INR',now(),'over-limit')`,
    );
    const awaitedPage = await service.payments(context, query);
    assert.throws(() => paymentsCsv(awaitedPage), tooLarge);
  }));

void test("SQL audit projections omit raw metadata and page microsecond timestamp ties safely", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database),
      foreign = await automationFixture(database);
    const context = { ...f.context, permissions },
      service = new TenantInsightsService(
        new TenantInsightsRepository(database),
        new TenantScopeService(),
      );
    const at = new Date(Date.now() - 1000).toISOString().replace(/\.\d{3}Z$/u, ".123456Z");
    for (const tenantId of [f.tenantId, f.tenantId, foreign.tenantId])
      await database.execute(
        sql`INSERT INTO app.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,result,metadata,before_data,request_id,created_at) VALUES(${tenantId},${f.actorId},'FIXTURE_EVENT','fixture','PRIVATE_ENTITY','SUCCESS','{"phone":"PRIVATE_PHONE"}','{"body":"PRIVATE_BODY"}','phase8',${at}::timestamptz)`,
      );
    const filters = { action: "FIXTURE_EVENT", limit: "1" };
    const first = await service.audit(context, parseInsightQuery(filters, "audit"));
    assert.ok(first.nextCursor);
    const second = await service.audit(
      context,
      parseInsightQuery({ ...filters, cursor: first.nextCursor }, "audit"),
    );
    assert.equal(second.nextCursor, null);
    assert.notEqual(first.items[0]?.id, second.items[0]?.id);
    assert.ok(!JSON.stringify([first, second]).includes("PRIVATE_"));
  }));

void test("SQL recipient export joins same-tenant delivery state and hides deleted Contacts/campaigns", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database),
      foreign = await automationFixture(database),
      templateId = randomUUID(),
      campaignId = randomUUID(),
      messageId = randomUUID();
    await database.execute(
      sql`INSERT INTO app.templates(id,tenant_id,whatsapp_account_id,name,language,category,provider_status) VALUES(${templateId},${f.tenantId},${f.accountId},'fixture','en','MARKETING','APPROVED')`,
    );
    await database.execute(
      sql`INSERT INTO app.campaigns(id,tenant_id,created_by,whatsapp_account_id,template_id,name,status) VALUES(${campaignId},${f.tenantId},${f.actorId},${f.accountId},${templateId},'fixture','COMPLETED')`,
    );
    await database.execute(
      sql`INSERT INTO app.messages(id,tenant_id,conversation_id,campaign_id,contact_id,whatsapp_account_id,direction,message_type,status,content,read_at) VALUES(${messageId},${f.tenantId},${f.conversationId},${campaignId},${f.contactId},${f.accountId},'OUTBOUND','TEMPLATE','READ','{"body":"PRIVATE_BODY"}',now())`,
    );
    await database.execute(
      sql`INSERT INTO app.campaign_recipients(tenant_id,campaign_id,contact_id,message_id,status,rendered_variables) VALUES(${f.tenantId},${campaignId},${f.contactId},${messageId},'SENT','{"private":"VARIABLE_SECRET"}')`,
    );
    const repository = new CampaignExportRepository(database),
      scope = new TenantScopeService();
    const rows = await repository.recipients(scope.requireTenantContext(f.context), campaignId);
    assert.equal(rows[0]?.phone, "+919876543210");
    assert.equal(rows[0].status, "READ");
    assert.ok(rows[0].readAt);
    assert.ok(!JSON.stringify(rows).includes("PRIVATE_BODY"));
    assert.ok(!JSON.stringify(rows).includes("VARIABLE_SECRET"));
    assert.equal(
      (await repository.recipients(scope.requireTenantContext(foreign.context), campaignId)).length,
      0,
    );
    await database.execute(
      sql`UPDATE app.contacts SET is_deleted=true,deleted_at=now(),deleted_by=${f.actorId} WHERE tenant_id=${f.tenantId} AND id=${f.contactId}`,
    );
    assert.equal(
      (await repository.recipients(scope.requireTenantContext(f.context), campaignId)).length,
      0,
    );
  }));

void test("SQL platform export audit permits nonexistent filter metadata without tenant FK ownership", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database),
      missing = randomUUID();
    const context = {
      ...f.context,
      isPlatformActor: true,
      roleSystemKey: "SUPER_ADMIN" as const,
      tenantId: null,
    };
    await new ReportExportService(new ReportExportRepository(database)).prepare(
      context,
      missing,
      "audit",
      { headers: ["safe"], rows: [] },
    );
    const row = (
      await database.execute<{ tenant_id: string | null; metadata: { targetTenantId: string } }>(
        sql`SELECT tenant_id,metadata FROM app.audit_logs WHERE request_id=${context.requestId}`,
      )
    ).rows[0];
    assert.equal(row?.tenant_id, null);
    assert.equal(row.metadata.targetTenantId, missing);
  }));

void test("SQL manual payments preserve reference conflict mapping and subscription state", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database),
      repository = new PlatformRepository(database);
    const insights = new PlatformInsightsService(
      new PlatformInsightsRepository(database),
      repository,
    );
    const service = new PlatformService(
      repository,
      f.transactions,
      new Argon2idPasswordHasher(),
      insights,
      new TenantRoleProvisioningService(new SeedRepository()),
    );
    const context = {
      ...f.context,
      isPlatformActor: true,
      roleSystemKey: "SUPER_ADMIN" as const,
      tenantId: null,
    };
    const input = {
      amountMinor: 100,
      currency: "INR",
      paidAt: new Date().toISOString(),
      reference: randomUUID(),
      note: null,
    };
    await service.recordPayment(context, f.tenantId, input);
    await assert.rejects(
      service.recordPayment(context, f.tenantId, input),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 409,
    );
    const subscription = (
      await database.execute<{ status: string }>(
        sql`SELECT status FROM app.subscriptions WHERE tenant_id=${f.tenantId}`,
      )
    ).rows[0];
    assert.equal(subscription?.status, "ACTIVE");
  }));

void test("SQL concurrent manual payments persist one reference and map the loser to conflict", async () =>
  withAutomationDatabase(async (database) => {
    const f = await automationFixture(database),
      repository = new PlatformRepository(database),
      service = new PlatformService(
        repository,
        f.transactions,
        new Argon2idPasswordHasher(),
        new PlatformInsightsService(new PlatformInsightsRepository(database), repository),
        new TenantRoleProvisioningService(new SeedRepository()),
      ),
      context = {
        ...f.context,
        isPlatformActor: true,
        roleSystemKey: "SUPER_ADMIN" as const,
        tenantId: null,
      },
      reference = randomUUID(),
      input = {
        amountMinor: 100,
        currency: "INR",
        paidAt: new Date().toISOString(),
        reference,
        note: null,
      };

    const results = await Promise.allSettled([
      service.recordPayment(context, f.tenantId, input),
      service.recordPayment(context, f.tenantId, input),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assert.ok(rejected.reason instanceof HttpException);
    assert.equal(rejected.reason.getStatus(), 409);
    const counts = (
      await database.execute<{ audits: number; payments: number }>(
        sql`SELECT
          (SELECT count(*)::integer FROM app.payment_records WHERE tenant_id=${f.tenantId} AND reference=${reference}) AS payments,
          (SELECT count(*)::integer FROM app.audit_logs WHERE tenant_id=${f.tenantId} AND action='MANUAL_PAYMENT_RECORDED' AND metadata->>'reference'=${reference}) AS audits`,
      )
    ).rows[0];
    assert.deepEqual(counts, { audits: 1, payments: 1 });
  }));

void test("SQL manual payment rolls back when its audit write fails", async () =>
  withAutomationDatabase(async (database) => {
    const rollback = new Error("forced payment audit rollback"),
      f = await automationFixture(database),
      repository = new (class extends PlatformRepository {
        override audit(): Promise<void> {
          return Promise.reject(rollback);
        }
      })(database),
      service = new PlatformService(
        repository,
        f.transactions,
        new Argon2idPasswordHasher(),
        new PlatformInsightsService(new PlatformInsightsRepository(database), repository),
        new TenantRoleProvisioningService(new SeedRepository()),
      ),
      context = {
        ...f.context,
        isPlatformActor: true,
        roleSystemKey: "SUPER_ADMIN" as const,
        tenantId: null,
      },
      reference = randomUUID();

    await assert.rejects(
      service.recordPayment(context, f.tenantId, {
        amountMinor: 100,
        currency: "INR",
        paidAt: new Date().toISOString(),
        reference,
        note: null,
      }),
      (error: unknown) => error === rollback,
    );
    const payment = (
      await database.execute<{ count: number }>(
        sql`SELECT count(*)::integer AS count FROM app.payment_records WHERE tenant_id=${f.tenantId} AND reference=${reference}`,
      )
    ).rows[0];
    assert.equal(payment?.count, 0);
  }));
