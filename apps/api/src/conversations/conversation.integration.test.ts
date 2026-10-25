import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createDatabaseClient, createDatabasePool } from "../database/database.client.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabase } from "../database/database.types.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { AccessTokenService } from "../auth/access-token.service.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  tenantsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
  contactsInApp,
  whatsappAccountsInApp,
  conversationsInApp,
  messagesInApp,
  plansInApp,
  subscriptionsInApp,
  providerCredentialsInApp,
} from "../database/schema/index.js";
import { ContactRepository } from "../contacts/contact.repository.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { ConversationRepository } from "./conversation.repository.js";
import { ConversationService } from "./conversation.service.js";
import { ConversationNoteRepository } from "./conversation-note.repository.js";
import { ConversationCollaborationService } from "./conversation-collaboration.service.js";
import { ConversationReplyService } from "./conversation-reply.service.js";
import { parseInboxQuery, parseInboxCommand } from "./conversation.dto.js";
import { parseConversationReply } from "./conversation-reply.dto.js";
import { parseConversationNote } from "./conversation-collaboration.dto.js";

if (process.env.NODE_ENV === "production") throw new Error("Development fixtures only.");
const pool = createDatabasePool({
  url:
    process.env.DATABASE_URL ??
    "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
  poolMax: 2,
  poolMin: 0,
});
const db = createDatabaseClient(pool);
after(async () => {
  await pool.end();
});
const rollback = new Error("rollback inbox fixture");
const code = (name: string) => (value: unknown) =>
  value instanceof Error && "code" in value && value.code === name;
async function isolated(work: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  await assert.rejects(
    db.transaction(async (tx) => {
      await work(await fixture(tx));
      throw rollback;
    }),
    (error) => error === rollback,
  );
}
async function fixture(
  tx: AppDatabaseTransaction,
  runtime: AppDatabase = tx,
  runtimeTransactions?: DatabaseTransactionManager,
) {
  const tenantId = randomUUID(),
    otherTenantId = randomUUID(),
    roleId = randomUUID(),
    actorId = randomUUID(),
    memberId = randomUUID(),
    accountId = randomUUID(),
    contactId = randomUUID(),
    conversationId = randomUUID(),
    planId = randomUUID();
  await tx.insert(tenantsInApp).values([
    { id: tenantId, name: "Inbox fixture", slug: randomUUID(), status: "ACTIVE" },
    { id: otherTenantId, name: "Other fixture", slug: randomUUID(), status: "ACTIVE" },
  ]);
  await tx
    .insert(rolesInApp)
    .values({ id: roleId, tenantId, name: "Fixture Admin", systemKey: "TENANT_ADMIN" });
  await tx.insert(usersInApp).values(
    [actorId, memberId].map((id) => ({
      id,
      homeTenantId: tenantId,
      roleId,
      email: `${id}@example.test`,
      displayName: id === actorId ? "Owner" : "Assistant",
      passwordHash: "not-a-real-password",
      status: "ACTIVE",
    })),
  );
  await tx
    .insert(userTenantScopesInApp)
    .values([actorId, memberId].map((userId) => ({ userId, tenantId, roleId })));
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
    secretRef: "env://fixture-never-called",
    status: "ACTIVE",
  });
  await tx.insert(contactsInApp).values({
    id: contactId,
    tenantId,
    name: "Ada 100%",
    phoneE164: "+919876543210",
    consentStatus: "OPTED_IN",
    consentAt: new Date().toISOString(),
    consentSource: "TEST",
    consentProofReference: "fixture",
  });
  await tx.insert(conversationsInApp).values({
    id: conversationId,
    tenantId,
    contactId,
    whatsappAccountId: accountId,
    status: "OPEN",
    unreadCount: 2,
    windowExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await tx.insert(plansInApp).values({
    id: planId,
    code: planId,
    name: "Fixture",
    status: "ACTIVE",
    limits: { monthly_message_limit: 100 },
  });
  await tx.insert(subscriptionsInApp).values({
    tenantId,
    planId,
    status: "ACTIVE",
    startsAt: new Date(Date.now() - 86400000).toISOString(),
  });
  const context: AuthorizationContext = {
    actorId,
    tenantId,
    roleId,
    roleSystemKey: "TENANT_ADMIN",
    roleName: "Admin",
    email: "fixture@example.test",
    isPlatformActor: false,
    sessionId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set([
      "conversation.read",
      "conversation.reply",
      "conversation.assign",
      "conversation.close",
    ]),
  };
  const transactions =
    runtimeTransactions ??
    ({
      execute: <T>(work: (t: AppDatabaseTransaction) => Promise<T>) => work(tx),
    } as DatabaseTransactionManager);
  const scope = new TenantScopeService(),
    repository = new ConversationRepository(runtime);
  const service = new ConversationService(repository, transactions, scope);
  const collaboration = new ConversationCollaborationService(
    repository,
    new ConversationNoteRepository(runtime),
    new ContactRepository(runtime),
    transactions,
    scope,
  );
  const reply = new ConversationReplyService(
    repository,
    new MessagingService(new MessagingRepository(), transactions, scope, new OutboxRepository()),
    scope,
  );
  return {
    tx,
    tenantId,
    otherTenantId,
    memberId,
    contactId,
    accountId,
    conversationId,
    context,
    service,
    collaboration,
    reply,
    repository,
    transactions,
  };
}

/** Independent commits are isolated in a database owned solely by this test, not tenant data. */
void test(
  "independent SQL transactions deduplicate replies/notes and serialize close, read and audit rollback",
  { timeout: 60000 },
  async () => {
    const base = new URL(
      process.env.DATABASE_URL ??
        "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
    );
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
      "Concurrency fixtures require local PostgreSQL",
    );
    const name = `inbox_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(name, /^inbox_test_[a-f0-9]{32}$/u);
    const admin = createDatabasePool({ url: base.toString(), poolMax: 1, poolMin: 0 });
    let created = false;
    base.pathname = `/${name}`;
    const concurrentPool = createDatabasePool({ url: base.toString(), poolMax: 4, poolMin: 0 });
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      const database = createDatabaseClient(concurrentPool);
      await migrate(database, {
        migrationsFolder: fileURLToPath(new URL("../../database/migrations", import.meta.url)),
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });
      const f = await database.transaction((tx) =>
        fixture(tx, database, new DatabaseTransactionManager(database)),
      );
      const input = {
        clientMessageKey: "concurrent",
        content: { type: "TEXT" as const, text: "Once" },
      };
      const replies = await Promise.all(
        Array.from({ length: 4 }, () => f.reply.reply(f.context, f.conversationId, input)),
      );
      assert.equal(new Set(replies.map((row) => row.id)).size, 1);
      const note = { id: randomUUID(), note: "Exactly one internal note" };
      const notes = await Promise.all(
        Array.from({ length: 4 }, () =>
          f.collaboration.createNote(f.context, f.conversationId, note),
        ),
      );
      assert.equal(notes.filter((row) => !row.idempotent).length, 1);
      const counts = await database.execute<{
        messages: number;
        usage: number;
        outbox: number;
        notes: number;
        audit: number;
      }>(sql`SELECT
      (SELECT count(*)::int FROM app.messages) AS messages,
      (SELECT count(*)::int FROM app.usage_events) AS usage,
      (SELECT count(*)::int FROM app.outbox_events) AS outbox,
      (SELECT count(*)::int FROM app.conversation_notes) AS notes,
      (SELECT count(*)::int FROM app.audit_logs WHERE action='CONVERSATION_NOTE_ADDED') AS audit`);
      assert.deepEqual(counts.rows, [{ messages: 1, usage: 1, outbox: 1, notes: 1, audit: 1 }]);
      const race = await Promise.allSettled([
        f.service.command(f.context, f.conversationId, "close", null),
        f.reply.reply(f.context, f.conversationId, { ...input, clientMessageKey: "close-race" }),
      ]);
      assert.equal(race[0].status, "fulfilled");
      if (race[1].status === "rejected")
        assert.ok(code("CONVERSATION_REOPEN_REQUIRED")(race[1].reason));
      assert.equal(
        (await f.service.history(f.context, f.conversationId, parseInboxQuery({}, true)))
          .conversation.status,
        "CLOSED",
      );
      const boundary = randomUUID(),
        later = randomUUID();
      await database.insert(messagesInApp).values({
        id: boundary,
        tenantId: f.tenantId,
        conversationId: f.conversationId,
        contactId: f.contactId,
        whatsappAccountId: f.accountId,
        direction: "INBOUND",
        messageType: "TEXT",
        status: "RECEIVED",
        content: {},
        createdAt: "2026-01-01T00:00:00Z",
      });
      await Promise.all([
        f.service.command(f.context, f.conversationId, "read", boundary),
        database.transaction(async (tx) => {
          await f.repository.find(f.tenantId, f.conversationId, tx);
          await tx.insert(messagesInApp).values({
            id: later,
            tenantId: f.tenantId,
            conversationId: f.conversationId,
            contactId: f.contactId,
            whatsappAccountId: f.accountId,
            direction: "INBOUND",
            messageType: "TEXT",
            status: "RECEIVED",
            content: {},
            createdAt: "2026-01-01T00:00:01Z",
          });
          await tx.execute(
            sql`UPDATE app.conversations SET unread_count=unread_count+1 WHERE id=${f.conversationId}`,
          );
        }),
      ]);
      assert.equal(
        (await f.service.history(f.context, f.conversationId, parseInboxQuery({}, true)))
          .conversation.unreadCount,
        1,
      );
      const auditFailure = new Error("Injected audit failure");
      f.repository.audit = () => Promise.reject(auditFailure);
      const rejectedNote = randomUUID();
      await assert.rejects(
        f.collaboration.createNote(f.context, f.conversationId, {
          id: rejectedNote,
          note: "Must roll back",
        }),
        (error) => error === auditFailure,
      );
      await assert.rejects(
        f.collaboration.assign(f.context, f.conversationId, f.memberId),
        (error) => error === auditFailure,
      );
      await assert.rejects(
        f.service.command(f.context, f.conversationId, "reopen", null),
        (error) => error === auditFailure,
      );
      const persisted = await database.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM app.conversation_notes WHERE id=${rejectedNote}`,
      );
      assert.equal(persisted.rows[0]?.count, 0);
      const current = (
        await f.service.history(f.context, f.conversationId, parseInboxQuery({}, true))
      ).conversation;
      assert.equal(current.assignedUserId, null);
      assert.equal(current.status, "CLOSED");
      await database.execute(
        sql`UPDATE app.conversations SET status='OPEN' WHERE id=${f.conversationId}`,
      );
      const totals = () =>
        database.execute<{
          messages: number;
          usage: number;
          outbox: number;
          audit: number;
        }>(sql`SELECT
        (SELECT count(*)::int FROM app.messages) AS messages,
        (SELECT count(*)::int FROM app.usage_events) AS usage,
        (SELECT count(*)::int FROM app.outbox_events) AS outbox,
        (SELECT count(*)::int FROM app.audit_logs) AS audit`);
      const beforeFailure = await totals();
      const outbox = new OutboxRepository();
      outbox.create = () => Promise.reject(auditFailure);
      const failingReply = new ConversationReplyService(
        new ConversationRepository(database),
        new MessagingService(
          new MessagingRepository(),
          f.transactions,
          new TenantScopeService(),
          outbox,
        ),
        new TenantScopeService(),
      );
      await assert.rejects(
        failingReply.reply(f.context, f.conversationId, {
          ...input,
          clientMessageKey: "outbox-failure",
        }),
        (error) => error === auditFailure,
      );
      assert.deepEqual((await totals()).rows, beforeFailure.rows);
      await verifyAuthenticatedHttp(base.toString(), database, f);
    } finally {
      await concurrentPool.end();
      // Exact generated identifier was validated above; no existing application database is a target.
      if (created) await admin.query(`DROP DATABASE "${name}"`);
      await admin.end();
    }
  },
);
void test("SQL inbox search, literal wildcard escaping, history/read boundaries and precision pagination", async () =>
  isolated(async (f) => {
    const first = randomUUID(),
      second = randomUUID();
    await f.tx.insert(messagesInApp).values(
      [first, second].map((id, index) => ({
        id,
        tenantId: f.tenantId,
        conversationId: f.conversationId,
        contactId: f.contactId,
        whatsappAccountId: f.accountId,
        direction: "INBOUND",
        messageType: "TEXT",
        status: "RECEIVED",
        content: { data: { body: "Hello" } },
        createdAt: `2026-01-01T00:00:0${String(index)}.123456Z`,
      })),
    );
    const page = await f.service.list(
      f.context,
      parseInboxQuery({ search: "100%", unread: "true" }),
    );
    assert.equal(page.conversations.length, 1);
    assert.equal(
      (await f.service.list(f.context, parseInboxQuery({ search: "100_" }))).conversations.length,
      0,
    );
    const history = await f.service.history(
      f.context,
      f.conversationId,
      parseInboxQuery({ limit: "1" }, true),
    );
    assert.equal(history.messages[0]?.id, second);
    assert.ok(history.nextCursor);
    const older = await f.service.history(
      f.context,
      f.conversationId,
      parseInboxQuery({ limit: "1", cursor: history.nextCursor }, true),
    );
    assert.equal(older.messages[0]?.id, first);
    assert.equal(
      (await f.service.command(f.context, f.conversationId, "read", first)).unreadCount,
      1,
    );
    assert.equal(
      (await f.service.command(f.context, f.conversationId, "read", second)).unreadCount,
      0,
    );
    assert.equal(
      (await f.service.command(f.context, f.conversationId, "read", first)).unreadCount,
      0,
    );
    assert.equal(
      (await f.service.command(f.context, f.conversationId, "unread", null)).unreadCount,
      1,
    );
    await assert.rejects(
      f.service.command(f.context, f.conversationId, "read", randomUUID()),
      code("CONVERSATION_READ_BOUNDARY_INVALID"),
    );
  }));
void test("SQL tenant/permission/deleted-Contact protection and minimal assignee options", async () =>
  isolated(async (f) => {
    await assert.rejects(
      f.service.history(
        { ...f.context, tenantId: f.otherTenantId },
        f.conversationId,
        parseInboxQuery({}, true),
      ),
      code("CONVERSATION_NOT_FOUND"),
    );
    await assert.rejects(
      f.service.list(
        { ...f.context, isPlatformActor: true, roleSystemKey: "SUPER_ADMIN" },
        parseInboxQuery({}),
      ),
      code("FORBIDDEN"),
    );
    await assert.rejects(
      f.collaboration.assignees(
        { ...f.context, permissions: new Set(["conversation.read"]) },
        parseInboxQuery({}, true),
      ),
      code("FORBIDDEN"),
    );
    const options = await f.collaboration.assignees(f.context, parseInboxQuery({}, true));
    assert.equal(options.assignees.length, 2);
    assert.deepEqual(Object.keys(options.assignees[0] ?? {}).sort(), ["displayName", "id"]);
    await f.tx
      .update(contactsInApp)
      .set({ isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: f.context.actorId })
      .where(eq(contactsInApp.id, f.contactId));
    assert.equal((await f.service.list(f.context, parseInboxQuery({}))).conversations.length, 0);
    await assert.rejects(
      f.service.history(f.context, f.conversationId, parseInboxQuery({}, true)),
      code("CONVERSATION_NOT_FOUND"),
    );
  }));
void test("SQL assignment, append-only note idempotency, conflicting reuse, audit and status preservation", async () =>
  isolated(async (f) => {
    await f.service.command(f.context, f.conversationId, "close", null);
    await f.collaboration.assign(f.context, f.conversationId, f.memberId);
    await f.collaboration.assign(f.context, f.conversationId, f.memberId);
    await assert.rejects(
      f.collaboration.assign(f.context, f.conversationId, randomUUID()),
      code("CONVERSATION_ASSIGNEE_INVALID"),
    );
    const input = { id: randomUUID(), note: "<script>never execute</script> Internal only" };
    const created = await f.collaboration.createNote(f.context, f.conversationId, input);
    assert.equal(created.idempotent, false);
    assert.equal(
      (await f.collaboration.createNote(f.context, f.conversationId, input)).idempotent,
      true,
    );
    await assert.rejects(
      f.collaboration.createNote(f.context, f.conversationId, { ...input, note: "Changed" }),
      code("CONVERSATION_NOTE_ID_CONFLICT"),
    );
    const notes = await f.collaboration.listNotes(
      f.context,
      f.conversationId,
      parseInboxQuery({}, true),
    );
    assert.equal(notes.notes.length, 1);
    const current = (
      await f.service.history(f.context, f.conversationId, parseInboxQuery({}, true))
    ).conversation;
    assert.equal(current.status, "CLOSED");
    assert.equal(current.unreadCount, 2);
    assert.equal(current.assignedUserId, f.memberId);
    const audit = await f.tx.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM app.audit_logs WHERE tenant_id=${f.tenantId} AND action='CONVERSATION_NOTE_ADDED'`,
    );
    assert.equal(audit.rows[0]?.count, 1);
    const messages = await f.tx
      .select()
      .from(messagesInApp)
      .where(eq(messagesInApp.tenantId, f.tenantId));
    assert.equal(messages.length, 0);
  }));
void test("SQL agent reply uses one common reservation/outbox and retains accepted replay after close", async () =>
  isolated(async (f) => {
    const input = {
      clientMessageKey: "reply-action",
      content: { type: "TEXT" as const, text: "Hello" },
    };
    const first = await f.reply.reply(f.context, f.conversationId, input);
    await f.service.command(f.context, f.conversationId, "close", null);
    assert.equal((await f.reply.reply(f.context, f.conversationId, input)).id, first.id);
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, { ...input, clientMessageKey: "new" }),
      code("CONVERSATION_REOPEN_REQUIRED"),
    );
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, {
        ...input,
        content: { type: "TEXT", text: "Changed" },
      }),
      code("MESSAGE_IDEMPOTENCY_CONFLICT"),
    );
    const count = await f.tx.execute<{ usage: number; outbox: number }>(
      sql`SELECT (SELECT count(*)::int FROM app.usage_events WHERE tenant_id=${f.tenantId}) AS usage,(SELECT count(*)::int FROM app.outbox_events WHERE tenant_id=${f.tenantId}) AS outbox`,
    );
    assert.deepEqual(count.rows, [{ usage: 1, outbox: 1 }]);
  }));
void test("SQL active automation and closed window fail without queued work", async () =>
  isolated(async (f) => {
    await f.tx
      .update(conversationsInApp)
      .set({ automationState: "ACTIVE" })
      .where(eq(conversationsInApp.id, f.conversationId));
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, {
        clientMessageKey: "bot",
        content: { type: "TEXT", text: "Hello" },
      }),
      code("CONVERSATION_HANDOFF_REQUIRED"),
    );
    await f.tx
      .update(conversationsInApp)
      .set({ automationState: "NONE", windowExpiresAt: "2020-01-01T00:00:00Z" })
      .where(eq(conversationsInApp.id, f.conversationId));
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, {
        clientMessageKey: "window",
        content: { type: "TEXT", text: "Hello" },
      }),
      code("CUSTOMER_SERVICE_WINDOW_CLOSED"),
    );
  }));
void test("Inbox parsers reject routing injection, invalid pagination/content/prototype keys", () => {
  assert.throws(() => parseInboxQuery({ limit: "101" }));
  assert.throws(() => parseInboxQuery({ cursor: "bad" }));
  assert.throws(() => parseInboxQuery({ tenantId: randomUUID() }));
  assert.throws(() =>
    parseInboxCommand({ lastSeenMessageId: randomUUID(), tenantId: randomUUID() }, true),
  );
  assert.throws(() =>
    parseConversationNote({ id: randomUUID(), note: " ", authorId: randomUUID() }),
  );
  assert.throws(() =>
    parseConversationReply({
      clientMessageKey: "x",
      source: "CAMPAIGN",
      content: { type: "TEXT", text: "Hello" },
    }),
  );
});

/** Exercise real Nest transport and live DB authorization without provider calls or login secrets. */
async function verifyAuthenticatedHttp(
  url: string,
  database: AppDatabase,
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const secret = "test-inbox-access-secret-more-than-thirty-two-characters";
  const signer = new AccessTokenService({
    accessSecret: secret,
    accessTtlSeconds: 900,
    allowedOrigins: [],
    cookieSecure: false,
    loginEmailLimit: 10,
    loginIpLimit: 10,
    loginWindowSeconds: 60,
    refreshPepper: "fixture",
    refreshTtlSeconds: 3600,
    redisKeyPrefix: "inbox-fixture",
  });
  for (const permission of f.context.permissions)
    await database.execute(
      sql`WITH p AS (INSERT INTO app.permissions(permission_key,description) VALUES (${permission},'Fixture') RETURNING id) INSERT INTO app.role_permissions(role_id,permission_id) SELECT ${f.context.roleId},id FROM p`,
    );
  async function token(userId: string, tenantId: string | null) {
    const sessionId = randomUUID();
    await database.execute(
      sql`INSERT INTO app.auth_sessions(id,user_id,refresh_token_hash,token_family_id,expires_at) VALUES (${sessionId},${userId},${randomUUID()},${randomUUID()},now()+interval '1 hour')`,
    );
    return signer.sign({ userId, tenantId, sessionId }).token;
  }
  const ownerToken = await token(f.context.actorId, f.tenantId);
  const platformRole = randomUUID(),
    platformUser = randomUUID();
  await database.execute(
    sql`INSERT INTO app.roles(id,name,system_key) VALUES (${platformRole},'Fixture Platform','SUPER_ADMIN')`,
  );
  await database.execute(
    sql`INSERT INTO app.users(id,role_id,email,password_hash,display_name,status) VALUES (${platformUser},${platformRole},${`${platformUser}@example.test`},'not-a-login-hash','Platform Fixture','ACTIVE')`,
  );
  const platformToken = await token(platformUser, null);
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const port = address.port;
  server.close();
  await once(server, "close");
  const child = spawn(process.execPath, ["--env-file-if-exists=../../.env", "dist/main.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: url,
      PORT: String(port),
      LOG_LEVEL: "error",
      JWT_ACCESS_SECRET: secret,
      META_APP_SECRET: "test-meta-secret",
      META_WEBHOOK_VERIFY_TOKEN: "test-webhook-token",
      REFRESH_TOKEN_PEPPER: "test-refresh-pepper-more-than-thirty-two-characters",
      REDIS_URL: "redis://localhost:6379",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${String(port)}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.equal(child.exitCode, null, "HTTP fixture API exited during startup");
      try {
        ready = (await fetch(`${base}/health/live`)).ok;
      } catch {
        /* Bounded startup polling. */
      }
      if (ready) break;
      await delay(100);
    }
    assert.equal(ready, true, "HTTP fixture API failed to start");
    const endpoint = `/conversations/${f.conversationId}`;
    async function call(path: string, bearer = ownerToken, body?: object) {
      return fetch(`${base}/api/v1${path}`, {
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
      });
    }
    for (const path of [
      "/conversations",
      "/conversations/assignees",
      endpoint,
      `${endpoint}/notes`,
    ]) {
      assert.equal((await call(path)).status, 200, path);
      assert.equal((await call(path, platformToken)).status, 403, `Platform denied ${path}`);
    }
    for (const action of ["read", "unread", "close", "reopen", "assign", "notes", "messages"])
      assert.equal((await call(`${endpoint}/${action}`, platformToken, {})).status, 403);
    assert.equal(
      (await call(`${endpoint}/notes`, ownerToken, { id: randomUUID(), note: "HTTP fixture" }))
        .status,
      200,
    );
    assert.equal(
      (
        await call(`${endpoint}/messages`, ownerToken, {
          clientMessageKey: "http-reply",
          content: { type: "TEXT", text: "Stored only, no provider worker" },
        })
      ).status,
      202,
    );
    assert.equal(
      (
        await call(`${endpoint}/notes`, ownerToken, {
          id: randomUUID(),
          note: "Injected",
          tenantId: f.otherTenantId,
        })
      ).status,
      400,
    );
    await database.execute(
      sql`UPDATE app.contacts SET is_deleted=true,deleted_at=now() WHERE id=${f.contactId}`,
    );
    assert.equal((await call(endpoint)).status, 404);
    await database.execute(
      sql`UPDATE app.contacts SET is_deleted=false,deleted_at=NULL WHERE id=${f.contactId}`,
    );
    // Change the fixture role rather than deleting grants; authorization must re-resolve live state.
    const readRole = randomUUID();
    await database.execute(
      sql`INSERT INTO app.roles(id,tenant_id,name,system_key) VALUES (${readRole},${f.tenantId},'Read fixture','TENANT_USER')`,
    );
    await database.execute(
      sql`INSERT INTO app.role_permissions(role_id,permission_id) SELECT ${readRole},id FROM app.permissions WHERE permission_key='conversation.read'`,
    );
    await database.execute(
      sql`UPDATE app.users SET role_id=${readRole} WHERE id=${f.context.actorId}`,
    );
    await database.execute(
      sql`UPDATE app.user_tenant_scopes SET role_id=${readRole} WHERE user_id=${f.context.actorId}`,
    );
    assert.equal((await call(endpoint)).status, 200);
    for (const action of ["close", "reopen", "assign", "notes", "messages"])
      assert.equal((await call(`${endpoint}/${action}`, ownerToken, {})).status, 403);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
  }
}

void test("SQL Inbox template approval, blocked replay, actor keys and exact quota enforcement", async () =>
  isolated(async (f) => {
    const templateId = randomUUID();
    await f.tx
      .execute(sql`INSERT INTO app.templates(id,tenant_id,whatsapp_account_id,name,language,category,provider_status,approval_status,components)
    VALUES (${templateId},${f.tenantId},${f.accountId},'inbox_fixture','en_US','UTILITY','APPROVED','DRAFT','[{"type":"BODY","text":"Hello {{1}}"}]'::jsonb)`);
    const content = { type: "TEMPLATE" as const, templateId, variables: { "1": "Ada" } };
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, { clientMessageKey: "approval", content }),
      code("TEMPLATE_INTERNAL_APPROVAL_REQUIRED"),
    );
    await f.tx.execute(
      sql`UPDATE app.templates SET approval_status='NOT_REQUIRED' WHERE id=${templateId}`,
    );
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, { clientMessageKey: "approval", content }),
      code("TEMPLATE_INTERNAL_APPROVAL_REQUIRED"),
    );
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, {
        clientMessageKey: "invalid-vars",
        content: { ...content, variables: {} },
      }),
      code("TEMPLATE_VARIABLES_INVALID"),
    );
    const accepted = await f.reply.reply(f.context, f.conversationId, {
      clientMessageKey: "actor-key",
      content,
    });
    const otherActor = await f.reply.reply(
      { ...f.context, actorId: f.memberId },
      f.conversationId,
      { clientMessageKey: "actor-key", content },
    );
    assert.notEqual(accepted.id, otherActor.id);
    await f.tx.execute(
      sql`UPDATE app.plans SET limits='{"monthly_message_limit":2}'::jsonb WHERE id IN (SELECT plan_id FROM app.subscriptions WHERE tenant_id=${f.tenantId})`,
    );
    await assert.rejects(
      f.reply.reply(f.context, f.conversationId, { clientMessageKey: "quota", content }),
      code("MESSAGE_QUOTA_EXCEEDED"),
    );
    const rows = await f.tx.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM app.outbox_events WHERE tenant_id=${f.tenantId}`,
    );
    assert.equal(rows.rows[0]?.count, 2);
  }));

void test("SQL note/assignee pagination ties, inactive author history, no-op audits and permission matrix", async () =>
  isolated(async (f) => {
    const notes = [randomUUID(), randomUUID()].sort().reverse();
    for (const id of notes)
      await f.collaboration.createNote(f.context, f.conversationId, { id, note: "Fixture note" });
    await f.tx.execute(
      sql`UPDATE app.conversation_notes SET created_at='2026-01-01T00:00:00.123456Z' WHERE tenant_id=${f.tenantId}`,
    );
    const first = await f.collaboration.listNotes(
      f.context,
      f.conversationId,
      parseInboxQuery({ limit: "1" }, true),
    );
    assert.equal(first.notes[0]?.id, notes[0]);
    assert.ok(first.nextCursor);
    const second = await f.collaboration.listNotes(
      f.context,
      f.conversationId,
      parseInboxQuery({ limit: "1", cursor: first.nextCursor }, true),
    );
    assert.equal(second.notes[0]?.id, notes[1]);
    const assignees = await f.collaboration.assignees(
      f.context,
      parseInboxQuery({ limit: "1" }, true),
    );
    assert.ok(assignees.nextCursor);
    const more = await f.collaboration.assignees(
      f.context,
      parseInboxQuery({ limit: "1", cursor: assignees.nextCursor }, true),
    );
    assert.notEqual(assignees.assignees[0]?.id, more.assignees[0]?.id);
    await f.tx.execute(sql`UPDATE app.users SET status='DISABLED' WHERE id=${f.context.actorId}`);
    assert.equal(
      (await f.collaboration.listNotes(f.context, f.conversationId, parseInboxQuery({}, true)))
        .notes.length,
      2,
    );
    await assert.rejects(
      f.collaboration.assign(f.context, f.conversationId, f.context.actorId),
      code("CONVERSATION_ASSIGNEE_INVALID"),
    );
    await f.collaboration.assign(f.context, f.conversationId, f.memberId);
    await f.collaboration.assign(f.context, f.conversationId, f.memberId);
    await f.collaboration.assign(f.context, f.conversationId, null);
    await f.service.command(f.context, f.conversationId, "close", null);
    await f.service.command(f.context, f.conversationId, "close", null);
    const audit = await f.tx.execute<{ action: string; count: number }>(
      sql`SELECT action,count(*)::int AS count FROM app.audit_logs WHERE tenant_id=${f.tenantId} AND action IN ('CONVERSATION_ASSIGNED','CONVERSATION_CLOSE') GROUP BY action ORDER BY action`,
    );
    assert.deepEqual(audit.rows, [
      { action: "CONVERSATION_ASSIGNED", count: 2 },
      { action: "CONVERSATION_CLOSE", count: 1 },
    ]);
    const readOnly = { ...f.context, permissions: new Set(["conversation.read"]) };
    await assert.rejects(
      f.service.command(readOnly, f.conversationId, "close", null),
      code("FORBIDDEN"),
    );
    await assert.rejects(
      f.collaboration.createNote(readOnly, f.conversationId, { id: randomUUID(), note: "Denied" }),
      code("FORBIDDEN"),
    );
    await assert.rejects(
      f.reply.reply(readOnly, f.conversationId, {
        clientMessageKey: "denied",
        content: { type: "TEXT", text: "Denied" },
      }),
      code("FORBIDDEN"),
    );
  }));
