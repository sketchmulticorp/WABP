import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { createDatabaseClient, createDatabasePool } from "../database/database.client.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  tenantsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
  whatsappAccountsInApp,
  plansInApp,
  subscriptionsInApp,
} from "../database/schema/index.js";
import { AutomationRepository } from "./automation.repository.js";
import { AutomationService } from "./automation.service.js";
import { AutomationRunRepository } from "./automation-run.repository.js";
import { AutomationTriggerService } from "./automation-trigger.service.js";
import { AutomationControlService } from "./automation-control.service.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { contactsInApp, conversationsInApp, messagesInApp } from "../database/schema/index.js";

// Only rollback fixtures on explicitly local development PostgreSQL; never seed customer records.
const url =
  process.env.DATABASE_URL ??
  "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas";
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error("Automation tests require local non-production PostgreSQL.");
const pool = createDatabasePool({ url, poolMin: 0, poolMax: 2 });
const db = createDatabaseClient(pool);
after(async () => {
  await pool.end();
});
const rollback = new Error("rollback automation fixture");

void test("real SQL authoring preserves published versions, tenant isolation, revisions and simulation purity", async () => {
  await assert.rejects(
    db.transaction(async (tx) => {
      const tenantId = randomUUID(),
        actorId = randomUUID(),
        roleId = randomUUID(),
        accountId = randomUUID(),
        planId = randomUUID();
      await tx
        .insert(tenantsInApp)
        .values({ id: tenantId, name: "Automation fixture", slug: randomUUID(), status: "ACTIVE" });
      await tx
        .insert(rolesInApp)
        .values({ id: roleId, tenantId, name: "Admin", systemKey: "TENANT_ADMIN" });
      await tx.insert(usersInApp).values({
        id: actorId,
        roleId,
        homeTenantId: tenantId,
        email: `${actorId}@example.test`,
        displayName: "Fixture",
        passwordHash: "not-a-password",
        status: "ACTIVE",
      });
      await tx.insert(userTenantScopesInApp).values({ userId: actorId, tenantId, roleId });
      await tx.insert(whatsappAccountsInApp).values({
        id: accountId,
        tenantId,
        wabaId: randomUUID(),
        phoneNumberId: randomUUID(),
        displayPhone: "+919876543210",
        status: "CONNECTED",
      });
      await tx.insert(plansInApp).values({
        id: planId,
        code: planId,
        name: "Fixture",
        status: "ACTIVE",
        featureFlags: { automation_enabled: true },
      });
      await tx.insert(subscriptionsInApp).values({
        tenantId,
        planId,
        status: "ACTIVE",
        startsAt: new Date(Date.now() - 1000).toISOString(),
      });
      const context: AuthorizationContext = {
        actorId,
        tenantId,
        roleId,
        roleSystemKey: "TENANT_ADMIN",
        roleName: "Admin",
        email: `${actorId}@example.test`,
        sessionId: randomUUID(),
        requestId: randomUUID(),
        isPlatformActor: false,
        permissions: new Set([
          "automation.read",
          "automation.write",
          "automation.test",
          "automation.publish",
          "conversation.read",
          "conversation.reply",
        ]),
      };
      const repository = new AutomationRepository(tx);
      const service = new AutomationService(
        repository,
        new DatabaseTransactionManager(tx),
        new TenantScopeService(),
      );
      const input = {
        name: "Welcome",
        graph: {
          accountId,
          keywords: ["hello"],
          nodes: [
            { key: "start", type: "START", config: {} },
            { key: "end", type: "END", config: {} },
          ],
          edges: [{ from: "start", to: "end", choice: null }],
        },
      } as const;
      const saved = await service.save(context, null, input, null);
      assert.equal(saved.status, "DRAFT");
      const published = await service.publish(context, saved.id, saved.revision);
      assert.equal(published.status, "ACTIVE");
      assert.ok(published.publishedVersionId);
      const edited = await service.save(
        context,
        saved.id,
        { ...input, name: "Welcome edited" },
        published.revision,
      );
      assert.equal(edited.versions.length, 2);
      assert.equal(edited.publishedVersionId, published.publishedVersionId);
      assert.deepEqual(
        edited.versions.find((v) => v.id === published.publishedVersionId),
        published.versions[0],
      );
      await assert.rejects(
        service.save(context, saved.id, input, published.revision),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "AUTOMATION_REVISION_CHANGED",
      );
      assert.equal(await repository.find(randomUUID(), saved.id), undefined);
      const before =
        await tx.execute(sql`SELECT (SELECT count(*) FROM app.messages WHERE tenant_id=${tenantId}::uuid) AS messages,
      (SELECT count(*) FROM app.outbox_events WHERE tenant_id=${tenantId}::uuid) AS events,
      (SELECT count(*) FROM app.audit_logs WHERE tenant_id=${tenantId}::uuid) AS audits`);
      assert.equal(
        (await service.simulate(context, saved.id, edited.revision, [])).outcome,
        "COMPLETED",
      );
      const afterSimulation =
        await tx.execute(sql`SELECT (SELECT count(*) FROM app.messages WHERE tenant_id=${tenantId}::uuid) AS messages,
      (SELECT count(*) FROM app.outbox_events WHERE tenant_id=${tenantId}::uuid) AS events,
      (SELECT count(*) FROM app.audit_logs WHERE tenant_id=${tenantId}::uuid) AS audits`);
      assert.deepEqual(afterSimulation.rows, before.rows);
      const contactId = randomUUID(),
        conversationId = randomUUID(),
        messageId = randomUUID();
      await tx.insert(contactsInApp).values({
        id: contactId,
        tenantId,
        name: "Automation fixture",
        phoneE164: "+919876543210",
        consentStatus: "UNKNOWN",
      });
      await tx.insert(conversationsInApp).values({
        id: conversationId,
        tenantId,
        contactId,
        whatsappAccountId: accountId,
        status: "OPEN",
        windowExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await tx.insert(messagesInApp).values({
        id: messageId,
        tenantId,
        conversationId,
        contactId,
        whatsappAccountId: accountId,
        direction: "INBOUND",
        messageType: "TEXT",
        status: "RECEIVED",
        providerMessageId: randomUUID(),
        providerCreatedAt: new Date(Date.now() + 1000).toISOString(),
        content: { data: { body: " HELLO " } },
      });
      const runs = new AutomationRunRepository(tx),
        transactions = new DatabaseTransactionManager(tx);
      const trigger = new AutomationTriggerService(
        repository,
        runs,
        transactions,
        new OutboxRepository(),
      );
      await trigger.inbound(messageId);
      const run = await runs.active(tx, tenantId, conversationId);
      assert.ok(run);
      assert.equal(run.flowVersionId, published.publishedVersionId);
      await trigger.inbound(messageId);
      assert.equal((await runs.active(tx, tenantId, conversationId))?.id, run.id);
      const events = await tx.execute(
        sql`SELECT id FROM app.outbox_events WHERE tenant_id=${tenantId}::uuid AND event_type='automation.run.advance'`,
      );
      assert.equal(events.rows.length, 1);
      const controls = new AutomationControlService(
        repository,
        runs,
        service,
        transactions,
        new TenantScopeService(),
      );
      await assert.rejects(controls.conversation(context, conversationId, "allow"));
      assert.equal(
        (await controls.conversation(context, conversationId, "takeover")).automationState,
        "HANDED_OFF",
      );
      assert.equal(
        (await controls.conversation(context, conversationId, "allow")).automationState,
        "NONE",
      );
      await trigger.inbound(messageId);
      assert.equal(await runs.active(tx, tenantId, conversationId), undefined);
      assert.equal((await runs.find(tx, tenantId, run.id))?.status, "CANCELLED");
      throw rollback;
    }),
    (error: unknown) => error === rollback,
  );
});
