import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { AutomationGraph, AutomationNode } from "@whatsapp-platform/contracts";
import { createDatabaseClient, createDatabasePool } from "../database/database.client.js";
import type { AppDatabase } from "../database/database.types.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  tenantsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
  permissionsInApp,
  rolePermissionsInApp,
  whatsappAccountsInApp,
  providerCredentialsInApp,
  plansInApp,
  subscriptionsInApp,
  contactsInApp,
  conversationsInApp,
  messagesInApp,
} from "../database/schema/index.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { AutomationRepository } from "./automation.repository.js";
import { AutomationRunRepository } from "./automation-run.repository.js";
import { AutomationService } from "./automation.service.js";
import { AutomationTriggerService } from "./automation-trigger.service.js";
import { AutomationExecutionService } from "./automation-execution.service.js";
import { AutomationControlService } from "./automation-control.service.js";

/** Owns only a validated, randomly named disposable database; never starts a provider or worker. */
export async function withAutomationDatabase(
  work: (database: AppDatabase, connection: { url: string; pool: Pool }) => Promise<void>,
) {
  const base = new URL(
    process.env.DATABASE_URL ??
      "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
  );
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const name = `automation_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(name, /^automation_test_[a-f0-9]{32}$/u);
  const admin = createDatabasePool({ url: base.toString(), poolMin: 0, poolMax: 1 });
  base.pathname = `/${name}`;
  const pool = createDatabasePool({ url: base.toString(), poolMin: 0, poolMax: 6 });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const database = createDatabaseClient(pool);
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL("../../database/migrations", import.meta.url)),
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
    await work(database, { url: base.toString(), pool });
  } finally {
    await pool.end();
    // Exact identifier generated and validated above; application databases cannot be targeted.
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}

export function linearGraph(accountId: string, middle: readonly AutomationNode[]): AutomationGraph {
  const nodes: AutomationNode[] = [
    { key: "start", type: "START", config: {} },
    ...middle,
    { key: "end", type: "END", config: {} },
  ];
  return {
    accountId,
    keywords: ["hello"],
    nodes,
    edges: nodes.slice(1).map((n, index) => ({
      from: nodes[index]?.key ?? "start",
      to: n.key,
      choice: null,
    })),
  };
}

export async function automationFixture(database: AppDatabase) {
  const tenantId = randomUUID(),
    roleId = randomUUID(),
    actorId = randomUUID(),
    accountId = randomUUID(),
    contactId = randomUUID(),
    conversationId = randomUUID(),
    planId = randomUUID();
  const keys = [
    "automation.read",
    "automation.write",
    "automation.test",
    "automation.publish",
    "conversation.read",
    "conversation.reply",
  ];
  await database.transaction(async (tx) => {
    await tx
      .insert(tenantsInApp)
      .values({ id: tenantId, name: "Automation test", slug: tenantId, status: "ACTIVE" });
    await tx
      .insert(rolesInApp)
      .values({ id: roleId, tenantId, name: "Admin", systemKey: "TENANT_ADMIN" });
    await tx.insert(usersInApp).values({
      id: actorId,
      homeTenantId: tenantId,
      roleId,
      email: `${actorId}@example.test`,
      displayName: "Fixture Admin",
      status: "ACTIVE",
      passwordHash: "not-a-password",
    });
    await tx.insert(userTenantScopesInApp).values({ userId: actorId, tenantId, roleId });
    for (const permissionKey of keys) {
      const permission = await tx
        .insert(permissionsInApp)
        .values({ permissionKey, description: "Automation fixture" })
        .onConflictDoNothing()
        .returning();
      const id =
        permission[0]?.id ??
        (
          await tx.execute<{ id: string }>(
            sql`SELECT id FROM app.permissions WHERE permission_key=${permissionKey}`,
          )
        ).rows[0]?.id;
      assert.ok(id);
      await tx.insert(rolePermissionsInApp).values({ roleId, permissionId: id });
    }
    await tx.insert(whatsappAccountsInApp).values({
      id: accountId,
      tenantId,
      wabaId: randomUUID(),
      phoneNumberId: randomUUID(),
      displayPhone: "+919876543210",
      status: "CONNECTED",
    });
    await tx.insert(providerCredentialsInApp).values({
      tenantId,
      whatsappAccountId: accountId,
      provider: "META",
      status: "ACTIVE",
      secretRef: "env://fixture-never-resolved",
    });
    await tx.insert(plansInApp).values({
      id: planId,
      code: planId,
      name: "Fixture",
      status: "ACTIVE",
      limits: { monthly_message_limit: 100 },
      featureFlags: { automation_enabled: true },
    });
    await tx.insert(subscriptionsInApp).values({
      tenantId,
      planId,
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 86400000).toISOString(),
    });
    await tx.insert(contactsInApp).values({
      id: contactId,
      tenantId,
      name: "Original",
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
  });
  const context: AuthorizationContext = {
    actorId,
    roleId,
    tenantId,
    email: `${actorId}@example.test`,
    roleName: "Admin",
    roleSystemKey: "TENANT_ADMIN",
    isPlatformActor: false,
    permissions: new Set(keys),
    sessionId: randomUUID(),
    requestId: randomUUID(),
  };
  const flows = new AutomationRepository(database),
    runs = new AutomationRunRepository(database),
    transactions = new DatabaseTransactionManager(database),
    outbox = new OutboxRepository(),
    scope = new TenantScopeService(),
    messages = new MessagingRepository();
  const authoring = new AutomationService(flows, transactions, scope);
  const trigger = new AutomationTriggerService(flows, runs, transactions, outbox);
  const execution = new AutomationExecutionService(
    flows,
    runs,
    transactions,
    new MessagingService(messages, transactions, scope, outbox),
    messages,
    trigger,
  );
  const controls = new AutomationControlService(flows, runs, authoring, transactions, scope);
  const inbound = async (body: string, content?: Record<string, unknown>) => {
    const id = randomUUID();
    await database.insert(messagesInApp).values({
      id,
      tenantId,
      contactId,
      conversationId,
      whatsappAccountId: accountId,
      direction: "INBOUND",
      messageType: content === undefined ? "TEXT" : "INTERACTIVE",
      status: "RECEIVED",
      providerMessageId: randomUUID(),
      providerCreatedAt: new Date(Date.now() + 1000).toISOString(),
      content: content ?? { data: { body } },
    });
    return id;
  };
  const publish = async (graph: AutomationGraph) => {
    const draft = await authoring.save(context, null, { name: randomUUID(), graph }, null);
    return authoring.publish(context, draft.id, draft.revision);
  };
  const advance = async (runId: string) => {
    const event = await database.execute<{
      id: string;
    }>(sql`SELECT id FROM app.outbox_events WHERE aggregate_id=${runId}::uuid
      AND event_type='automation.run.advance' AND coalesce(payload->>'processed','false')<>'true' ORDER BY created_at,id LIMIT 1`);
    assert.ok(event.rows[0]);
    await execution.advance(runId, event.rows[0].id);
    return event.rows[0].id;
  };
  const current = () => database.transaction((tx) => runs.active(tx, tenantId, conversationId));
  return {
    database,
    tenantId,
    roleId,
    actorId,
    accountId,
    contactId,
    conversationId,
    planId,
    context,
    flows,
    runs,
    authoring,
    trigger,
    execution,
    controls,
    transactions,
    inbound,
    publish,
    advance,
    current,
  };
}
