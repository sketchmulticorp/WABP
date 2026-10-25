import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SeedConfig } from "@whatsapp-platform/config/runtime";

import { AccessTokenService } from "../auth/access-token.service.js";
import type { AuthModuleConfig } from "../auth/auth.types.js";
import { AuthorizationRepository } from "../authorization/authorization.repository.js";
import {
  AuthorizationService,
  TenantScopeService,
} from "../authorization/authorization.service.js";
import { ContactRepository } from "../contacts/contact.repository.js";
import { ContactService } from "../contacts/contact.service.js";
import { GroupRepository } from "../groups/group.repository.js";
import { GroupService } from "../groups/group.service.js";
import { MeRepository } from "../me/me.repository.js";
import { MeService } from "../me/me.service.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { createDatabaseClient, createDatabasePool } from "./database.client.js";
import { DatabaseTransactionManager } from "./database-transaction.manager.js";
import { OutboxRepository } from "./outbox/outbox.repository.js";
import {
  auditLogsInApp,
  authSessionsInApp,
  contactsInApp,
  conversationsInApp,
  messagesInApp,
  outboxEventsInApp,
  plansInApp,
  providerCredentialsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
  usageEventsInApp,
  webhookEventsInApp,
  whatsappAccountsInApp,
} from "./schema/index.js";
import { SeedRepository } from "./seed/seed.repository.js";
import { SeedService } from "./seed/seed.service.js";
import { WebhookRepository } from "../webhooks/webhook.repository.js";

const localDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas";
const pool = createDatabasePool({ poolMax: 2, poolMin: 0, url: localDatabaseUrl });
const database = createDatabaseClient(pool);
const transactions = new DatabaseTransactionManager(database);
const outboxRepository = new OutboxRepository();
const webhookRepository = new WebhookRepository(database);
const persistedIds: string[] = [];
const webhookEventIds: string[] = [];

after(async () => {
  if (persistedIds.length > 0) {
    // Test-only cleanup; production outbox retention must use its approved maintenance workflow.
    await database.delete(outboxEventsInApp).where(inArray(outboxEventsInApp.id, persistedIds));
  }
  if (webhookEventIds.length > 0) {
    await database
      .delete(webhookEventsInApp)
      .where(inArray(webhookEventsInApp.id, webhookEventIds));
  }
  await pool.end();
});

void test("records all reviewed migrations idempotently and creates all approved tables", async () => {
  const result = await database.execute<{
    migrationCount: number;
    tableCount: number;
  }>(sql`
    select
      (select count(*)::integer from drizzle.__drizzle_migrations) as "migrationCount",
      (select count(*)::integer from pg_tables where schemaname = 'app') as "tableCount"
  `);

  assert.deepEqual(result.rows, [{ migrationCount: 9, tableCount: 35 }]);
});

void test("commits a transactional outbox event", async () => {
  const aggregateId = randomUUID();
  const correlationId = `task-021-commit-${randomUUID()}`;

  const persisted = await transactions.execute((transaction) =>
    outboxRepository.create(transaction, {
      aggregateId,
      aggregateType: "integration_test",
      correlationId,
      eventType: "integration_test.committed",
      payload: { aggregateId },
      tenantId: null,
    }),
  );
  persistedIds.push(persisted.id);

  const rows = await database
    .select({ id: outboxEventsInApp.id, status: outboxEventsInApp.status })
    .from(outboxEventsInApp)
    .where(eq(outboxEventsInApp.id, persisted.id));

  assert.deepEqual(rows, [{ id: persisted.id, status: "PENDING" }]);
});

void test("rolls back the outbox event when its transaction fails", async () => {
  const correlationId = `task-021-rollback-${randomUUID()}`;

  await assert.rejects(
    transactions.execute(async (transaction) => {
      await outboxRepository.create(transaction, {
        aggregateId: randomUUID(),
        aggregateType: "integration_test",
        correlationId,
        eventType: "integration_test.rolled_back",
        payload: {},
        tenantId: null,
      });
      throw new Error("force transaction rollback");
    }),
    /force transaction rollback/u,
  );

  const rows = await database
    .select({ id: outboxEventsInApp.id })
    .from(outboxEventsInApp)
    .where(eq(outboxEventsInApp.correlationId, correlationId));

  assert.deepEqual(rows, []);
});

void test("persists a verified webhook delivery once using the provider dedupe constraint", async () => {
  const externalEventKey = `task-035-${randomUUID()}`;
  const input = {
    externalEventKey,
    payload: { entry: [], object: "whatsapp_business_account" },
    tenantId: null,
    whatsappAccountId: null,
  };

  const first = await transactions.execute((executor) =>
    webhookRepository.persistVerifiedMetaEvent({ ...input, executor }),
  );
  const second = await transactions.execute((executor) =>
    webhookRepository.persistVerifiedMetaEvent({ ...input, executor }),
  );

  assert.equal(first.isDuplicate, false);
  assert.ok(first.event);
  webhookEventIds.push(first.event.id);
  assert.deepEqual(second, { event: null, isDuplicate: true });

  const rows = await database
    .select({
      externalEventKey: webhookEventsInApp.externalEventKey,
      status: webhookEventsInApp.status,
    })
    .from(webhookEventsInApp)
    .where(eq(webhookEventsInApp.externalEventKey, externalEventKey));
  assert.deepEqual(rows, [{ externalEventKey, status: "RECEIVED" }]);
});

void test("seeds identities and authorization idempotently without resetting passwords", async () => {
  const testId = randomUUID();
  const config = createSeedTestConfig(testId);
  let hashSequence = 0;
  const hasher = {
    hash: () => Promise.resolve(`test-password-hash-${String(++hashSequence)}`),
    verify: () => Promise.resolve(false),
  };

  await assert.rejects(
    database.transaction(async (transaction) => {
      const testTransactions = {
        execute: async <T>(work: (current: typeof transaction) => Promise<T>): Promise<T> =>
          work(transaction),
      };
      const service = new SeedService(new SeedRepository(), testTransactions, hasher);
      const first = await service.run(config);
      const second = await service.run(config);

      assert.equal(first.created.tenant, true);
      assert.equal(first.created.superAdmin, true);
      assert.equal(first.created.tenantAdmin, true);
      assert.equal(first.created.tenantUser, true);
      assert.equal(first.created.subscription, true);
      assert.deepEqual(second.created, {
        plan: false,
        tenant: false,
        superAdmin: false,
        tenantAdmin: false,
        tenantUser: false,
        subscription: false,
      });

      const seededUsers = await transaction
        .select({
          email: usersInApp.email,
          passwordHash: usersInApp.passwordHash,
          homeTenantId: usersInApp.homeTenantId,
        })
        .from(usersInApp)
        .where(
          inArray(usersInApp.email, [
            config.superAdmin.email,
            config.tenantAdmin.email,
            config.tenantUser.email,
          ]),
        );
      assert.equal(seededUsers.length, 3);
      assert.deepEqual(seededUsers.map((user) => user.passwordHash).toSorted(), [
        "test-password-hash-1",
        "test-password-hash-2",
        "test-password-hash-3",
      ]);

      const tenantAdmin = seededUsers.find((user) => user.email === config.tenantAdmin.email);
      const tenantUser = seededUsers.find((user) => user.email === config.tenantUser.email);
      assert.ok(tenantAdmin?.homeTenantId);
      assert.equal(tenantUser?.homeTenantId, tenantAdmin.homeTenantId);

      const memberships = await transaction
        .select({ userId: userTenantScopesInApp.userId })
        .from(userTenantScopesInApp)
        .where(
          and(
            eq(userTenantScopesInApp.tenantId, tenantAdmin.homeTenantId),
            eq(userTenantScopesInApp.isDeleted, false),
          ),
        );
      assert.equal(memberships.length, 2);

      const systemRoles = await transaction
        .select({ systemKey: rolesInApp.systemKey })
        .from(rolesInApp)
        .where(inArray(rolesInApp.systemKey, ["SUPER_ADMIN", "TENANT_ADMIN", "TENANT_USER"]));
      assert.equal(systemRoles.length >= 3, true);

      const audits = await transaction
        .select({ id: auditLogsInApp.id })
        .from(auditLogsInApp)
        .where(eq(auditLogsInApp.requestId, "bootstrap:task-022:v1"));
      assert.equal(audits.length, 1);

      throw new Error("rollback TASK-022 integration seed");
    }),
    /rollback TASK-022 integration seed/u,
  );
});

void test("resolves live tenant context and revokes only an owned session family", async () => {
  const testId = randomUUID();
  const config = createSeedTestConfig(testId);
  const hasher = {
    hash: () => Promise.resolve(`test-password-hash-${randomUUID()}`),
    verify: () => Promise.resolve(false),
  };

  await assert.rejects(
    database.transaction(async (transaction) => {
      const testTransactions = {
        execute: async <T>(work: (current: typeof transaction) => Promise<T>): Promise<T> =>
          work(transaction),
      };
      await new SeedService(new SeedRepository(), testTransactions, hasher).run(config);
      const tenantAdminRows = await transaction
        .select({ id: usersInApp.id, tenantId: usersInApp.homeTenantId })
        .from(usersInApp)
        .where(eq(usersInApp.email, config.tenantAdmin.email))
        .limit(1);
      const tenantAdmin = tenantAdminRows[0];
      assert.ok(tenantAdmin?.tenantId);

      const sessionId = randomUUID();
      const tokenFamilyId = randomUUID();
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      await transaction.insert(authSessionsInApp).values({
        expiresAt,
        id: sessionId,
        refreshTokenHash: `integration-${randomUUID()}`,
        tokenFamilyId,
        userId: tenantAdmin.id,
      });

      const authConfig = createAuthTestConfig();
      const accessTokens = new AccessTokenService(authConfig);
      const token = accessTokens.sign({
        sessionId,
        tenantId: tenantAdmin.tenantId,
        userId: tenantAdmin.id,
      }).token;
      const authorizationService = new AuthorizationService(
        new AuthorizationRepository(transaction),
        accessTokens,
      );
      const context = await authorizationService.authenticate(
        `Bearer ${token}`,
        "task-024-integration",
      );

      assert.equal(context.tenantId, tenantAdmin.tenantId);
      assert.equal(context.roleSystemKey, "TENANT_ADMIN");
      assert.equal(context.permissions.has("contact.read"), true);

      const meService = new MeService(
        new MeRepository(transaction),
        testTransactions as unknown as DatabaseTransactionManager,
      );
      const currentUser = await meService.getCurrentUser(context);
      assert.equal(currentUser.tenant?.id, tenantAdmin.tenantId);
      assert.equal(currentUser.subscription?.plan.code, "MVP_INTERNAL");
      assert.equal((await meService.listSessions(context)).sessions.length, 1);
      await meService.revokeSession(context, sessionId);

      const revokedRows = await transaction
        .select({ revokedAt: authSessionsInApp.revokedAt })
        .from(authSessionsInApp)
        .where(eq(authSessionsInApp.tokenFamilyId, tokenFamilyId));
      assert.equal(
        revokedRows.every((row) => row.revokedAt !== null),
        true,
      );
      const revocationAudits = await transaction
        .select({ id: auditLogsInApp.id })
        .from(auditLogsInApp)
        .where(eq(auditLogsInApp.requestId, "task-024-integration"));
      assert.equal(revocationAudits.length, 1);
      await assert.rejects(
        () => authorizationService.authenticate(`Bearer ${token}`, "after-revocation"),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "UNAUTHENTICATED",
      );

      throw new Error("rollback TASK-024 authorization integration");
    }),
    /rollback TASK-024 authorization integration/u,
  );
});

void test("blocks tenant switching, privilege escalation, cross-user session revocation, and Super Admin content access", async () => {
  const firstConfig = createSeedTestConfig(randomUUID());
  const secondConfig = createSeedTestConfig(randomUUID());
  const hasher = {
    hash: () => Promise.resolve(`test-password-hash-${randomUUID()}`),
    verify: () => Promise.resolve(false),
  };

  await assert.rejects(
    database.transaction(async (transaction) => {
      const testTransactions = {
        execute: async <T>(work: (current: typeof transaction) => Promise<T>): Promise<T> =>
          work(transaction),
      };
      const seedService = new SeedService(new SeedRepository(), testTransactions, hasher);
      await seedService.run(firstConfig);
      await seedService.run(secondConfig);

      const identities = await transaction
        .select({
          email: usersInApp.email,
          id: usersInApp.id,
          tenantId: usersInApp.homeTenantId,
        })
        .from(usersInApp)
        .where(
          inArray(usersInApp.email, [
            firstConfig.superAdmin.email,
            firstConfig.tenantAdmin.email,
            firstConfig.tenantUser.email,
            secondConfig.tenantAdmin.email,
          ]),
        );
      const firstAdmin = requireIdentity(identities, firstConfig.tenantAdmin.email);
      const firstUser = requireIdentity(identities, firstConfig.tenantUser.email);
      const firstSuperAdmin = requireIdentity(identities, firstConfig.superAdmin.email);
      const secondAdmin = requireIdentity(identities, secondConfig.tenantAdmin.email);
      assert.ok(firstAdmin.tenantId);
      assert.ok(firstUser.tenantId);
      assert.ok(secondAdmin.tenantId);
      assert.notEqual(firstAdmin.tenantId, secondAdmin.tenantId);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60_000).toISOString();
      const firstAdminSession = randomUUID();
      const firstUserSession = randomUUID();
      const firstSuperAdminSession = randomUUID();
      const secondAdminSession = randomUUID();
      await transaction
        .insert(authSessionsInApp)
        .values([
          createSessionRow(firstAdminSession, firstAdmin.id, expiresAt),
          createSessionRow(firstUserSession, firstUser.id, expiresAt),
          createSessionRow(firstSuperAdminSession, firstSuperAdmin.id, expiresAt),
          createSessionRow(secondAdminSession, secondAdmin.id, expiresAt),
        ]);

      const accessTokens = new AccessTokenService(createAuthTestConfig());
      const authorizationService = new AuthorizationService(
        new AuthorizationRepository(transaction),
        accessTokens,
      );
      const firstAdminToken = accessTokens.sign({
        sessionId: firstAdminSession,
        tenantId: firstAdmin.tenantId,
        userId: firstAdmin.id,
      }).token;
      const firstUserToken = accessTokens.sign({
        sessionId: firstUserSession,
        tenantId: firstUser.tenantId,
        userId: firstUser.id,
      }).token;
      const firstSuperAdminToken = accessTokens.sign({
        sessionId: firstSuperAdminSession,
        tenantId: null,
        userId: firstSuperAdmin.id,
      }).token;

      const firstAdminContext = await authorizationService.authenticate(
        `Bearer ${firstAdminToken}`,
        "task-025:first-admin",
      );
      const firstUserContext = await authorizationService.authenticate(
        `Bearer ${firstUserToken}`,
        "task-025:first-user",
      );
      const firstSuperAdminContext = await authorizationService.authenticate(
        `Bearer ${firstSuperAdminToken}`,
        "task-025:super-admin",
      );

      assert.equal(firstAdminContext.tenantId, firstAdmin.tenantId);
      assert.equal(firstUserContext.tenantId, firstUser.tenantId);
      assert.equal(firstUserContext.permissions.has("campaign.send"), false);
      assert.equal(firstUserContext.permissions.has("campaign.write"), true);

      const switchedTenantToken = accessTokens.sign({
        sessionId: firstAdminSession,
        tenantId: secondAdmin.tenantId,
        userId: firstAdmin.id,
      }).token;
      await assert.rejects(
        () => authorizationService.authenticate(`Bearer ${switchedTenantToken}`, "task-025:switch"),
        hasErrorCode("UNAUTHENTICATED"),
      );

      const tenantScope = new TenantScopeService();
      assert.equal(
        tenantScope.requireTenantContext(firstAdminContext).tenantId,
        firstAdmin.tenantId,
      );
      assert.throws(
        () => tenantScope.requireTenantContext(firstSuperAdminContext),
        hasErrorCode("FORBIDDEN"),
      );

      const meService = new MeService(
        new MeRepository(transaction),
        testTransactions as unknown as DatabaseTransactionManager,
      );
      await assert.rejects(
        () => meService.revokeSession(firstAdminContext, secondAdminSession),
        hasErrorCode("SESSION_NOT_FOUND"),
      );
      const secondSessionRows = await transaction
        .select({ revokedAt: authSessionsInApp.revokedAt })
        .from(authSessionsInApp)
        .where(eq(authSessionsInApp.id, secondAdminSession));
      assert.equal(secondSessionRows[0]?.revokedAt, null);

      const superAdminProjection = await meService.getCurrentUser(firstSuperAdminContext);
      const serializedProjection = JSON.stringify(superAdminProjection);
      assert.equal(superAdminProjection.tenant, null);
      assert.equal(superAdminProjection.subscription, null);
      assert.doesNotMatch(serializedProjection, new RegExp(firstConfig.tenant.name, "u"));
      assert.doesNotMatch(serializedProjection, new RegExp(secondConfig.tenant.name, "u"));
      assert.doesNotMatch(serializedProjection, new RegExp(firstConfig.tenantAdmin.email, "u"));
      assert.doesNotMatch(serializedProjection, new RegExp(secondConfig.tenantAdmin.email, "u"));

      throw new Error("rollback TASK-025 adversarial authorization integration");
    }),
    /rollback TASK-025 adversarial authorization integration/u,
  );
});

void test("keeps contact CRUD tenant-scoped, validates assignees, and soft-deletes records", async () => {
  const firstConfig = createSeedTestConfig(randomUUID());
  const secondConfig = createSeedTestConfig(randomUUID());
  const hasher = {
    hash: () => Promise.resolve(`test-password-hash-${randomUUID()}`),
    verify: () => Promise.resolve(false),
  };

  await assert.rejects(
    database.transaction(async (transaction) => {
      const testTransactions = {
        execute: async <T>(work: (current: typeof transaction) => Promise<T>): Promise<T> =>
          work(transaction),
      };
      const seedService = new SeedService(new SeedRepository(), testTransactions, hasher);
      await seedService.run(firstConfig);
      await seedService.run(secondConfig);

      const identities = await transaction
        .select({ email: usersInApp.email, id: usersInApp.id, tenantId: usersInApp.homeTenantId })
        .from(usersInApp)
        .where(
          inArray(usersInApp.email, [
            firstConfig.tenantAdmin.email,
            firstConfig.tenantUser.email,
            secondConfig.tenantAdmin.email,
          ]),
        );
      const firstAdmin = requireIdentity(identities, firstConfig.tenantAdmin.email);
      const firstUser = requireIdentity(identities, firstConfig.tenantUser.email);
      const secondAdmin = requireIdentity(identities, secondConfig.tenantAdmin.email);
      assert.ok(firstAdmin.tenantId);
      assert.ok(secondAdmin.tenantId);

      const contactService = new ContactService(
        new ContactRepository(transaction),
        testTransactions as unknown as DatabaseTransactionManager,
        new TenantScopeService(),
      );
      const firstContext = {
        actorId: firstAdmin.id,
        email: firstConfig.tenantAdmin.email,
        isPlatformActor: false,
        permissions: new Set(["contact.delete", "contact.read", "contact.write"]),
        requestId: "task-040:first-tenant",
        roleId: randomUUID(),
        roleName: "Tenant Admin",
        roleSystemKey: "TENANT_ADMIN" as const,
        sessionId: randomUUID(),
        tenantId: firstAdmin.tenantId,
      };
      const secondContext = {
        ...firstContext,
        actorId: secondAdmin.id,
        email: secondConfig.tenantAdmin.email,
        requestId: "task-040:second-tenant",
        tenantId: secondAdmin.tenantId,
      };

      const created = await contactService.create(firstContext, {
        address: null,
        assignedUserId: firstUser.id,
        company: "Clinic",
        customFields: { preferred_language: "en" },
        email: "patient@example.test",
        name: "Patient One",
        phone: "9876543210",
      });
      assert.equal(created.phoneE164, "+919876543210");
      assert.equal(created.consentStatus, "UNKNOWN");
      assert.equal(
        (await contactService.list(firstContext, { cursor: null, limit: 25 })).contacts.length,
        1,
      );
      assert.equal(
        (await contactService.list(secondContext, { cursor: null, limit: 25 })).contacts.length,
        0,
      );

      await assert.rejects(
        () => contactService.get(secondContext, created.id),
        hasErrorCode("CONTACT_NOT_FOUND"),
      );
      await assert.rejects(
        () =>
          contactService.update(firstContext, created.id, {
            assignedUserId: secondAdmin.id,
          }),
        hasErrorCode("CONTACT_ASSIGNEE_INVALID"),
      );

      await contactService.remove(firstContext, created.id);
      await assert.rejects(
        () => contactService.get(firstContext, created.id),
        hasErrorCode("CONTACT_NOT_FOUND"),
      );
      const audits = await transaction
        .select({ action: auditLogsInApp.action })
        .from(auditLogsInApp)
        .where(eq(auditLogsInApp.requestId, "task-040:first-tenant"));
      assert.deepEqual(audits.map((audit) => audit.action).toSorted(), [
        "CONTACT_CREATED",
        "CONTACT_DELETED",
      ]);

      throw new Error("rollback TASK-040 contacts integration");
    }),
    /rollback TASK-040 contacts integration/u,
  );
});

void test("keeps Groups, memberships, and consent transitions tenant-scoped", async () => {
  const firstConfig = createSeedTestConfig(randomUUID());
  const secondConfig = createSeedTestConfig(randomUUID());
  const hasher = {
    hash: () => Promise.resolve(`test-password-hash-${randomUUID()}`),
    verify: () => Promise.resolve(false),
  };

  await assert.rejects(
    database.transaction(async (transaction) => {
      const testTransactions = {
        execute: async <T>(work: (current: typeof transaction) => Promise<T>): Promise<T> =>
          work(transaction),
      };
      const seedService = new SeedService(new SeedRepository(), testTransactions, hasher);
      await seedService.run(firstConfig);
      await seedService.run(secondConfig);
      const identities = await transaction
        .select({ email: usersInApp.email, id: usersInApp.id, tenantId: usersInApp.homeTenantId })
        .from(usersInApp)
        .where(
          inArray(usersInApp.email, [
            firstConfig.tenantAdmin.email,
            secondConfig.tenantAdmin.email,
          ]),
        );
      const firstAdmin = requireIdentity(identities, firstConfig.tenantAdmin.email);
      const secondAdmin = requireIdentity(identities, secondConfig.tenantAdmin.email);
      assert.ok(firstAdmin.tenantId);
      assert.ok(secondAdmin.tenantId);

      const contactService = new ContactService(
        new ContactRepository(transaction),
        testTransactions as unknown as DatabaseTransactionManager,
        new TenantScopeService(),
      );
      const groupService = new GroupService(
        new GroupRepository(transaction),
        testTransactions as unknown as DatabaseTransactionManager,
        new TenantScopeService(),
      );
      const firstContext = tenantContext(
        firstAdmin,
        firstConfig.tenantAdmin.email,
        "task-046:first",
      );
      const secondContext = tenantContext(
        secondAdmin,
        secondConfig.tenantAdmin.email,
        "task-046:second",
      );
      const contact = await contactService.create(firstContext, {
        address: null,
        assignedUserId: null,
        company: null,
        customFields: {},
        email: null,
        name: "Import Test Contact",
        phone: "9876543210",
      });
      const group = await groupService.create(firstContext, { name: "Appointment reminders" });
      assert.deepEqual(
        await groupService.addMembers(firstContext, group.id, { contactIds: [contact.id] }),
        {
          added: 1,
          group_id: group.id,
        },
      );
      assert.equal((await groupService.listMembers(firstContext, group.id)).members.length, 1);
      assert.deepEqual((await groupService.listMembers(secondContext, group.id)).members, []);

      await assert.rejects(
        () => groupService.addMembers(secondContext, group.id, { contactIds: [contact.id] }),
        hasErrorCode("CONTACT_GROUP_NOT_FOUND"),
      );
      await assert.rejects(
        () => contactService.updateConsent(secondContext, contact.id, optInConsent()),
        hasErrorCode("CONTACT_NOT_FOUND"),
      );
      const consented = await contactService.updateConsent(
        firstContext,
        contact.id,
        optInConsent(),
      );
      assert.equal(consented.consentStatus, "OPTED_IN");

      await groupService.removeMember(firstContext, group.id, contact.id);
      assert.equal((await groupService.listMembers(firstContext, group.id)).members.length, 0);
      await groupService.remove(firstContext, group.id);
      assert.deepEqual((await groupService.list(firstContext)).groups, []);

      throw new Error("rollback TASK-046 Contacts/Groups integration");
    }),
    /rollback TASK-046 Contacts\/Groups integration/u,
  );
});

void test("creates outbound messages with tenant-safe idempotency and atomic monthly quota", async () => {
  const firstConfig = createSeedTestConfig(randomUUID());
  const secondConfig = createSeedTestConfig(randomUUID());
  const hasher = {
    hash: () => Promise.resolve(`test-password-hash-${randomUUID()}`),
    verify: () => Promise.resolve(false),
  };

  await assert.rejects(
    database.transaction(async (transaction) => {
      const testTransactions = {
        execute: async <T>(work: (current: typeof transaction) => Promise<T>): Promise<T> =>
          work(transaction),
      };
      const seedService = new SeedService(new SeedRepository(), testTransactions, hasher);
      await seedService.run(firstConfig);
      await seedService.run(secondConfig);
      await transaction
        .update(plansInApp)
        .set({ limits: { ...firstConfig.plan, monthly_message_limit: 1 } })
        .where(eq(plansInApp.code, "MVP_INTERNAL"));

      const identities = await transaction
        .select({ email: usersInApp.email, id: usersInApp.id, tenantId: usersInApp.homeTenantId })
        .from(usersInApp)
        .where(
          inArray(usersInApp.email, [
            firstConfig.tenantAdmin.email,
            secondConfig.tenantAdmin.email,
          ]),
        );
      const firstAdmin = requireIdentity(identities, firstConfig.tenantAdmin.email);
      const secondAdmin = requireIdentity(identities, secondConfig.tenantAdmin.email);
      assert.ok(firstAdmin.tenantId);
      assert.ok(secondAdmin.tenantId);

      const accountRows = await transaction
        .insert(whatsappAccountsInApp)
        .values({
          displayPhone: "+919000000001",
          isDefault: true,
          phoneNumberId: `task-050-phone-${randomUUID()}`,
          status: "CONNECTED",
          tenantId: firstAdmin.tenantId,
          wabaId: `task-050-waba-${randomUUID()}`,
        })
        .returning({ id: whatsappAccountsInApp.id });
      const accountId = accountRows[0]?.id;
      assert.ok(accountId);
      await transaction.insert(providerCredentialsInApp).values({
        provider: "META",
        secretRef: "env://TASK_050_TEST_TOKEN",
        status: "ACTIVE",
        tenantId: firstAdmin.tenantId,
        whatsappAccountId: accountId,
      });
      const contactRows = await transaction
        .insert(contactsInApp)
        .values({
          consentStatus: "UNKNOWN",
          phoneE164: "+919000000002",
          source: "TEST",
          tenantId: firstAdmin.tenantId,
        })
        .returning({ id: contactsInApp.id });
      const contactId = contactRows[0]?.id;
      assert.ok(contactId);
      const conversationRows = await transaction
        .insert(conversationsInApp)
        .values({
          contactId,
          status: "OPEN",
          tenantId: firstAdmin.tenantId,
          whatsappAccountId: accountId,
          windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .returning({ id: conversationsInApp.id });
      const conversationId = conversationRows[0]?.id;
      assert.ok(conversationId);

      const service = new MessagingService(
        new MessagingRepository(),
        testTransactions as unknown as DatabaseTransactionManager,
        new TenantScopeService(),
        outboxRepository,
      );
      const firstContext = {
        ...tenantContext(firstAdmin, firstConfig.tenantAdmin.email, "task-050:first"),
        permissions: new Set(["conversation.reply"]),
      };
      const input = {
        clientMessageKey: `inbox:${randomUUID()}`,
        contactId,
        content: { text: "Your appointment is confirmed.", type: "TEXT" as const },
        conversationId,
        source: "INBOX" as const,
        whatsappAccountId: accountId,
      };
      const first = await service.createOutboundMessage(firstContext, input);
      const duplicate = await service.createOutboundMessage(firstContext, input);
      assert.equal(first.status, "CREATED");
      assert.equal(duplicate.id, first.id);
      assert.equal(duplicate.idempotent, true);

      await assert.rejects(
        () =>
          service.createOutboundMessage(firstContext, {
            ...input,
            clientMessageKey: `inbox:${randomUUID()}`,
          }),
        hasErrorCode("MESSAGE_QUOTA_EXCEEDED"),
      );
      await assert.rejects(
        () =>
          service.createOutboundMessage(
            {
              ...tenantContext(secondAdmin, secondConfig.tenantAdmin.email, "task-050:second"),
              permissions: new Set(["conversation.reply"]),
            },
            { ...input, clientMessageKey: `inbox:${randomUUID()}` },
          ),
        hasErrorCode("MESSAGE_TARGET_NOT_FOUND"),
      );

      const messageRows = await transaction
        .select({ errorCode: messagesInApp.errorCode, status: messagesInApp.status })
        .from(messagesInApp)
        .where(eq(messagesInApp.tenantId, firstAdmin.tenantId));
      assert.deepEqual(
        messageRows.toSorted((left, right) => left.status.localeCompare(right.status)),
        [
          { errorCode: null, status: "CREATED" },
          { errorCode: "MESSAGE_QUOTA_EXCEEDED", status: "FAILED" },
        ],
      );
      const usageRows = await transaction
        .select({ eventType: usageEventsInApp.eventType, quantity: usageEventsInApp.quantity })
        .from(usageEventsInApp)
        .where(eq(usageEventsInApp.tenantId, firstAdmin.tenantId));
      assert.deepEqual(usageRows, [
        { eventType: "OUTBOUND_MESSAGE_RESERVED", quantity: "1.000000" },
      ]);
      const messageOutboxRows = await transaction
        .select({ eventType: outboxEventsInApp.eventType, payload: outboxEventsInApp.payload })
        .from(outboxEventsInApp)
        .where(eq(outboxEventsInApp.aggregateId, first.id));
      assert.deepEqual(messageOutboxRows, [
        { eventType: "message.outbound.created", payload: { message_id: first.id } },
      ]);

      throw new Error("rollback TASK-050 messaging integration");
    }),
    /rollback TASK-050 messaging integration/u,
  );
});

function createSeedTestConfig(testId: string): SeedConfig {
  return {
    database: { poolMax: 2, poolMin: 0, url: localDatabaseUrl },
    superAdmin: {
      email: `super-${testId}@example.test`,
      displayName: "Test Super Admin",
      password: "Strong!Super123",
    },
    tenant: {
      name: `Test Tenant ${testId}`,
      slug: `test-${testId}`,
      timezone: "Asia/Kolkata",
      countryCode: "IN",
    },
    tenantAdmin: {
      email: `admin-${testId}@example.test`,
      displayName: "Test Tenant Admin",
      password: "Strong!Admin123",
    },
    tenantUser: {
      email: `user-${testId}@example.test`,
      displayName: "Test Tenant User",
      password: "Strong!User123",
    },
    plan: {
      maxUsers: 100,
      maxWhatsappNumbers: 10,
      maxContacts: 100_000,
      monthlyMessageLimit: 1_000_000,
      monthlyCampaignLimit: 10_000,
      maxTemplates: 1_000,
      storageGb: 100,
      automationEnabled: true,
    },
  };
}

function createAuthTestConfig(): AuthModuleConfig {
  return {
    accessSecret: "test-access-secret-that-is-at-least-thirty-two-characters",
    accessTtlSeconds: 900,
    allowedOrigins: ["http://localhost:3000"],
    cookieSecure: false,
    loginEmailLimit: 10,
    loginIpLimit: 100,
    loginWindowSeconds: 900,
    refreshPepper: "test-refresh-pepper-that-is-at-least-thirty-two-characters",
    refreshTtlSeconds: 2_592_000,
    redisKeyPrefix: "test",
  };
}

function createSessionRow(sessionId: string, userId: string, expiresAt: string) {
  return {
    expiresAt,
    id: sessionId,
    refreshTokenHash: `integration-${randomUUID()}`,
    tokenFamilyId: randomUUID(),
    userId,
  };
}

function requireIdentity(
  identities: readonly {
    readonly email: string;
    readonly id: string;
    readonly tenantId: string | null;
  }[],
  email: string,
): { readonly email: string; readonly id: string; readonly tenantId: string | null } {
  const identity = identities.find((candidate) => candidate.email === email);
  assert.ok(identity, `Expected seeded identity '${email}'.`);
  return identity;
}

function hasErrorCode(expected: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && "code" in error && error.code === expected;
}

function tenantContext(
  identity: { readonly email: string; readonly id: string; readonly tenantId: string | null },
  email: string,
  requestId: string,
) {
  assert.ok(identity.tenantId);
  return {
    actorId: identity.id,
    email,
    isPlatformActor: false,
    permissions: new Set(["contact.delete", "contact.read", "contact.write"]),
    requestId,
    roleId: randomUUID(),
    roleName: "Tenant Admin",
    roleSystemKey: "TENANT_ADMIN" as const,
    sessionId: randomUUID(),
    tenantId: identity.tenantId,
  };
}

function optInConsent() {
  return {
    category: null,
    occurredAt: "2026-10-11T00:00:00.000Z",
    proofReference: "task-046-proof",
    source: "TEST",
    status: "OPTED_IN" as const,
    suppressionReason: null,
  };
}
