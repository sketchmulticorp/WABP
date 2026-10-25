import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool, type PoolClient } from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { WebhookEventRepository } from "./webhook-event.repository.js";
import { WebhookEventService } from "./webhook-event.service.js";

if (process.env.NODE_ENV === "production") throw new Error("Development fixtures only.");
async function fixture(work: (f: Awaited<ReturnType<typeof prepare>>) => Promise<void>) {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
    max: 1,
  });
  const session = await pool.connect();
  try {
    await session.query("BEGIN");
    await work(await prepare(session));
  } finally {
    await session.query("ROLLBACK");
    session.release();
    await pool.end();
  }
}
async function prepare(session: PoolClient) {
  const tenant = randomUUID(),
    account = randomUUID(),
    phone = randomUUID();
  await session.query(
    "INSERT INTO app.tenants(id,name,slug,status) VALUES ($1,'Webhook fixture',$2,'ACTIVE')",
    [tenant, randomUUID()],
  );
  await session.query(
    "INSERT INTO app.whatsapp_accounts(id,tenant_id,waba_id,phone_number_id,display_phone,status) VALUES ($1,$2,$3,$4,'+919876543210','CONNECTED')",
    [account, tenant, randomUUID(), phone],
  );
  const repository = new WebhookEventRepository({
    query: session.query.bind(session),
  } as unknown as Pool);
  // Real SQL effects use a SAVEPOINT inside the always-rolled-back fixture, never COMMIT its data.
  repository.withTransaction = async (work: (tx: PoolClient) => Promise<void>) => {
    await session.query("SAVEPOINT inbox_effects");
    try {
      await work(session);
      await session.query("RELEASE SAVEPOINT inbox_effects");
    } catch (error) {
      await session.query("ROLLBACK TO SAVEPOINT inbox_effects");
      await session.query("RELEASE SAVEPOINT inbox_effects");
      throw error;
    }
  };
  const service = new WebhookEventService(repository);
  const incoming = (id: string, text = "Hello", timestamp: unknown = "1792100000") => ({
    from: "919876543210",
    id,
    type: "text",
    text: { body: text },
    timestamp,
  });
  const payload = (messages: unknown[], statuses: unknown[] = [], routePhone: string = phone) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: routePhone },
              contacts: [{ wa_id: "919876543210", profile: { name: "Ada" } }],
              messages,
              statuses,
            },
          },
        ],
      },
    ],
  });
  async function event(body: unknown, accountId = account) {
    const id = randomUUID();
    await session.query(
      "INSERT INTO app.webhook_events(id,provider,event_type,external_event_key,payload,status,tenant_id,whatsapp_account_id) VALUES ($1,'META','META_WHATSAPP_WEBHOOK',$2,$3::jsonb,'RECEIVED',$4,$5)",
      [id, randomUUID(), JSON.stringify(body), tenant, accountId],
    );
    return id;
  }
  return { session, tenant, account, phone, service, incoming, payload, event, repository };
}
const code = (name: string) => (value: unknown) =>
  value instanceof Error && "safeCode" in value && value.safeCode === name;

void test(
  "independent webhook transactions deduplicate inbound STOP and replay a failed event after recovery",
  { timeout: 60000 },
  async () => {
    const url = new URL(
      process.env.DATABASE_URL ??
        "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
    );
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    const name = `inbox_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(name, /^inbox_test_[a-f0-9]{32}$/u);
    const admin = new Pool({ connectionString: url.toString(), max: 1 });
    url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.toString(), max: 4 });
    let created = false;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      await promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL("../../../api/dist/database/migrate.js", import.meta.url))],
        { env: { ...process.env, DATABASE_URL: url.toString() } },
      );
      const session = await pool.connect();
      try {
        const f = await prepare(session);
        const repository = new WebhookEventRepository(pool);
        const service = new WebhookEventService(repository);
        const id = randomUUID();
        const events: string[] = [];
        for (let index = 0; index < 4; index++)
          events.push(await f.event(f.payload([f.incoming(id, "STOP")])));
        await Promise.all(events.map((eventId) => service.process(eventId)));
        const result = await session.query<{ unread: number; messages: number; audit: number }>(
          "SELECT (SELECT unread_count FROM app.conversations WHERE tenant_id=$1) AS unread,(SELECT count(*)::int FROM app.messages WHERE tenant_id=$1) AS messages,(SELECT count(*)::int FROM app.audit_logs WHERE tenant_id=$1 AND action='CONTACT_OPTED_OUT_BY_KEYWORD') AS audit",
          [f.tenant],
        );
        assert.deepEqual(result.rows, [{ unread: 1, messages: 1, audit: 1 }]);
        await session.query(
          "UPDATE app.contacts SET is_deleted=true,deleted_at=now() WHERE tenant_id=$1",
          [f.tenant],
        );
        const recovery = await f.event(f.payload([f.incoming(randomUUID())]));
        await assert.rejects(service.process(recovery), code("INBOUND_CONTACT_REVIEW_REQUIRED"));
        await service.fail(recovery, new Error("Review required"), false);
        await session.query(
          "INSERT INTO app.contacts(tenant_id,name,phone_e164,consent_status) VALUES ($1,'Reviewed replacement','+919876543210','UNKNOWN')",
          [f.tenant],
        );
        assert.equal(await repository.replay(recovery), true);
        assert.equal(await repository.replay(recovery), false);
        await service.process(recovery);
        const recovered = await session.query<{ status: string; events: number }>(
          "SELECT status,(SELECT count(*)::int FROM app.outbox_events WHERE aggregate_id=$1) AS events FROM app.webhook_events WHERE id=$1",
          [recovery],
        );
        assert.deepEqual(recovered.rows, [{ status: "PROCESSED", events: 1 }]);
      } finally {
        session.release();
      }
    } finally {
      await pool.end();
      // Drop only the exact generated, validated test-owned database, never the configured DB.
      if (created) await admin.query(`DROP DATABASE "${name}"`);
      await admin.end();
    }
  },
);
void test("SQL webhook resolution, duplicate raw deliveries, STOP idempotency and unread/window state", async () =>
  fixture(async (f) => {
    const providerId = randomUUID();
    await f.service.process(await f.event(f.payload([f.incoming(providerId)])));
    await f.service.process(await f.event(f.payload([f.incoming(providerId)])));
    const rows = await f.session.query<{
      unread_count: number;
      count: number;
      consent_status: string;
    }>(
      "SELECT c.unread_count,(SELECT count(*)::int FROM app.messages WHERE tenant_id=$1) AS count,ct.consent_status FROM app.conversations c JOIN app.contacts ct ON ct.id=c.contact_id AND ct.tenant_id=c.tenant_id WHERE c.tenant_id=$1",
      [f.tenant],
    );
    assert.equal(rows.rows[0]?.unread_count, 1);
    assert.equal(rows.rows[0].count, 1);
    assert.equal(rows.rows[0].consent_status, "UNKNOWN");
    const stop = randomUUID();
    await f.service.process(await f.event(f.payload([f.incoming(stop, "STOP")])));
    await f.service.process(await f.event(f.payload([f.incoming(stop, "STOP")])));
    const audit = await f.session.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.audit_logs WHERE tenant_id=$1 AND action='CONTACT_OPTED_OUT_BY_KEYWORD'",
      [f.tenant],
    );
    assert.equal(audit.rows[0]?.count, 1);
  }));

void test("SQL invalid timestamp variants never create processing-time windows", async () =>
  fixture(async (f) => {
    for (const timestamp of [
      undefined,
      null,
      "",
      "0",
      "-1",
      "1.5",
      "not-a-time",
      "999999999999999999999",
    ]) {
      await assert.rejects(
        f.service.process(await f.event(f.payload([{ ...f.incoming(randomUUID()), timestamp }]))),
        code("INBOUND_TIMESTAMP_INVALID"),
      );
    }
    const rows = await f.session.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.conversations WHERE tenant_id=$1",
      [f.tenant],
    );
    assert.equal(rows.rows[0]?.count, 0);
  }));

void test("SQL old inbound cannot regress activity/window; closed history reopens without overwriting team or consent", async () =>
  fixture(async (f) => {
    await f.service.process(
      await f.event(f.payload([f.incoming(randomUUID(), "Newest", "1792100005")])),
    );
    const before = await f.session.query<{ last_message_at: Date; window_expires_at: Date }>(
      "SELECT last_message_at,window_expires_at FROM app.conversations WHERE tenant_id=$1",
      [f.tenant],
    );
    await f.session.query(
      "UPDATE app.conversations SET status='CLOSED',automation_state='HANDED_OFF' WHERE tenant_id=$1",
      [f.tenant],
    );
    await f.session.query(
      "UPDATE app.contacts SET name='Keep profile',consent_status='OPTED_IN',consent_at=now(),consent_source='TEST',consent_proof_reference='fixture' WHERE tenant_id=$1",
      [f.tenant],
    );
    await f.service.process(
      await f.event(f.payload([f.incoming(randomUUID(), "Older", "1792100000")])),
    );
    const after = await f.session.query<{
      last_message_at: Date;
      window_expires_at: Date;
      status: string;
      automation_state: string;
      name: string;
      consent_status: string;
    }>(
      "SELECT c.last_message_at,c.window_expires_at,c.status,c.automation_state,ct.name,ct.consent_status FROM app.conversations c JOIN app.contacts ct ON ct.id=c.contact_id WHERE c.tenant_id=$1",
      [f.tenant],
    );
    const current = after.rows[0],
      previous = before.rows[0];
    assert.ok(current);
    assert.ok(previous);
    assert.equal(current.last_message_at.getTime(), previous.last_message_at.getTime());
    assert.equal(current.window_expires_at.getTime(), previous.window_expires_at.getTime());
    assert.equal(current.status, "OPEN");
    assert.equal(current.automation_state, "HANDED_OFF");
    assert.equal(current.name, "Keep profile");
    assert.equal(current.consent_status, "OPTED_IN");
  }));

void test("SQL audit/completion failure rolls back inbound rows, unread and STOP consent together", async () =>
  fixture(async (f) => {
    const injected = new Error("Injected completion failure");
    f.repository.complete = () => Promise.reject(injected);
    await assert.rejects(
      f.service.process(await f.event(f.payload([f.incoming(randomUUID(), "STOP")]))),
      (error) => error === injected,
    );
    const rows = await f.session.query<{
      contacts: number;
      conversations: number;
      messages: number;
      audit: number;
    }>(
      "SELECT (SELECT count(*)::int FROM app.contacts WHERE tenant_id=$1) AS contacts,(SELECT count(*)::int FROM app.conversations WHERE tenant_id=$1) AS conversations,(SELECT count(*)::int FROM app.messages WHERE tenant_id=$1) AS messages,(SELECT count(*)::int FROM app.audit_logs WHERE tenant_id=$1) AS audit",
      [f.tenant],
    );
    assert.deepEqual(rows.rows, [{ contacts: 0, conversations: 0, messages: 0, audit: 0 }]);
  }));

void test("SQL active replacement is reused without restoring deleted contact identity", async () =>
  fixture(async (f) => {
    await f.service.process(await f.event(f.payload([f.incoming(randomUUID())])));
    await f.session.query(
      "UPDATE app.contacts SET is_deleted=true,deleted_at=now() WHERE tenant_id=$1",
      [f.tenant],
    );
    const replacement = randomUUID();
    await f.session.query(
      "INSERT INTO app.contacts(id,tenant_id,name,phone_e164,consent_status) VALUES ($1,$2,'Replacement','+919876543210','UNKNOWN')",
      [replacement, f.tenant],
    );
    const providerId = randomUUID();
    await f.service.process(await f.event(f.payload([f.incoming(providerId)])));
    const rows = await f.session.query<{ contact_id: string }>(
      "SELECT contact_id FROM app.messages WHERE tenant_id=$1 AND provider_message_id=$2",
      [f.tenant, providerId],
    );
    assert.equal(rows.rows[0]?.contact_id, replacement);
    const deleted = await f.session.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.contacts WHERE tenant_id=$1 AND is_deleted=true",
      [f.tenant],
    );
    assert.equal(deleted.rows[0]?.count, 1);
  }));
void test("SQL invalid timestamp, routing mismatch and deleted-only sender roll back event effects", async () =>
  fixture(async (f) => {
    const invalid = await f.event(
      f.payload([f.incoming(randomUUID()), f.incoming(randomUUID(), "bad", null)]),
    );
    await assert.rejects(f.service.process(invalid), code("INBOUND_TIMESTAMP_INVALID"));
    await f.service.fail(invalid, new Error("do not expose payload"), false);
    const messages = await f.session.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.messages WHERE tenant_id=$1",
      [f.tenant],
    );
    assert.equal(messages.rows[0]?.count, 0);
    await assert.rejects(
      f.service.process(await f.event(f.payload([f.incoming(randomUUID())], [], "other-phone"))),
      code("WEBHOOK_ACCOUNT_MISMATCH"),
    );
    await f.service.process(await f.event(f.payload([f.incoming(randomUUID())])));
    await f.session.query(
      "UPDATE app.contacts SET is_deleted=true,deleted_at=now() WHERE tenant_id=$1",
      [f.tenant],
    );
    await assert.rejects(
      f.service.process(await f.event(f.payload([f.incoming(randomUUID())]))),
      code("INBOUND_CONTACT_REVIEW_REQUIRED"),
    );
    const contacts = await f.session.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.contacts WHERE tenant_id=$1",
      [f.tenant],
    );
    assert.equal(contacts.rows[0]?.count, 1);
  }));
void test("SQL delivery status advances DELIVERED to READ without regression and cannot cross accounts", async () =>
  fixture(async (f) => {
    await f.service.process(await f.event(f.payload([f.incoming(randomUUID())])));
    const providerId = randomUUID();
    await f.session.query(
      "INSERT INTO app.messages(tenant_id,conversation_id,contact_id,whatsapp_account_id,direction,message_type,status,provider_message_id,content) SELECT tenant_id,id,contact_id,whatsapp_account_id,'OUTBOUND','TEXT','DELIVERED',$2,'{}'::jsonb FROM app.conversations WHERE tenant_id=$1",
      [f.tenant, providerId],
    );
    const role = randomUUID(),
      actor = randomUUID(),
      template = randomUUID(),
      campaign = randomUUID();
    await f.session.query(
      "INSERT INTO app.roles(id,tenant_id,name,system_key) VALUES ($1,$2,'Fixture Admin','TENANT_ADMIN')",
      [role, f.tenant],
    );
    await f.session.query(
      "INSERT INTO app.users(id,home_tenant_id,role_id,email,password_hash,display_name,status) VALUES ($1::uuid,$2,$3,$1::text||'@example.test','not-a-login-hash','Fixture','ACTIVE')",
      [actor, f.tenant, role],
    );
    await f.session.query(
      "INSERT INTO app.templates(id,tenant_id,whatsapp_account_id,name,language,category,provider_status) VALUES ($1,$2,$3,'fixture','en_US','UTILITY','DRAFT')",
      [template, f.tenant, f.account],
    );
    await f.session.query(
      "INSERT INTO app.campaigns(id,tenant_id,created_by,whatsapp_account_id,template_id,name,status) VALUES ($1,$2,$3,$4,$5,'Fixture','DRAFT')",
      [campaign, f.tenant, actor, f.account, template],
    );
    await f.session.query(
      "INSERT INTO app.campaign_recipients(tenant_id,campaign_id,contact_id,message_id,status) SELECT tenant_id,$2,contact_id,id,'DELIVERED' FROM app.messages WHERE tenant_id=$1 AND provider_message_id=$3",
      [f.tenant, campaign, providerId],
    );
    await f.service.process(
      await f.event(f.payload([], [{ id: providerId, status: "read", timestamp: "1792100001" }])),
    );
    await f.service.process(
      await f.event(f.payload([], [{ id: providerId, status: "sent", timestamp: "1792100000" }])),
    );
    await f.service.process(
      await f.event(f.payload([], [{ id: providerId, status: "failed", timestamp: "1792100002" }])),
    );
    const row = await f.session.query<{ status: string; error_code: string | null }>(
      "SELECT status,error_code FROM app.messages WHERE tenant_id=$1 AND provider_message_id=$2",
      [f.tenant, providerId],
    );
    assert.equal(row.rows[0]?.status, "READ");
    assert.equal(row.rows[0].error_code, null);
    const recipient = await f.session.query<{ status: string; skip_or_error_code: string | null }>(
      "SELECT status,skip_or_error_code FROM app.campaign_recipients WHERE tenant_id=$1 AND campaign_id=$2",
      [f.tenant, campaign],
    );
    assert.deepEqual(recipient.rows, [{ status: "READ", skip_or_error_code: null }]);
    await assert.rejects(
      f.service.process(await f.event(f.payload([f.incoming(providerId)]))),
      code("WEBHOOK_MESSAGE_OWNERSHIP_MISMATCH"),
    );
    const inbound = await f.session.query<{ provider_message_id: string }>(
      "SELECT provider_message_id FROM app.messages WHERE tenant_id=$1 AND direction='INBOUND' LIMIT 1",
      [f.tenant],
    );
    await assert.rejects(
      f.service.process(
        await f.event(
          f.payload(
            [],
            [{ id: inbound.rows[0]?.provider_message_id, status: "read", timestamp: "1792100003" }],
          ),
        ),
      ),
      code("MESSAGE_NOT_FOUND"),
    );
    const other = randomUUID(),
      otherPhone = randomUUID();
    await f.session.query(
      "INSERT INTO app.whatsapp_accounts(id,tenant_id,waba_id,phone_number_id,display_phone,status) VALUES ($1,$2,$3,$4,'+919812345678','CONNECTED')",
      [other, f.tenant, randomUUID(), otherPhone],
    );
    await assert.rejects(
      f.service.process(
        await f.event(
          f.payload(
            [],
            [{ id: providerId, status: "failed", timestamp: "1792100002" }],
            otherPhone,
          ),
          other,
        ),
      ),
      code("MESSAGE_NOT_FOUND"),
    );
  }));
