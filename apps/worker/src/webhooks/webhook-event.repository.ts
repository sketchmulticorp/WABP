import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { WORKER_DATABASE_POOL } from "./webhook.constants.js";
import type { DeliveryStatus, InboundMessage, StoredWebhookEvent } from "./webhook-event.types.js";

@Injectable()
export class WebhookEventRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async claimForProcessing(eventId: string): Promise<StoredWebhookEvent | undefined> {
    const result = await this.pool.query<{
      id: string;
      payload: unknown;
      tenant_id: string | null;
      whatsapp_account_id: string | null;
    }>(
      `
        UPDATE app.webhook_events
        SET status = 'PROCESSING', attempt_count = attempt_count + 1
        -- A local BullMQ worker can receive the just-enqueued job before the relay's
        -- follow-up transaction marks it QUEUED. RECEIVED is therefore claimable too.
        WHERE id = $1 AND status IN ('RECEIVED', 'QUEUED', 'FAILED')
        RETURNING id, payload, tenant_id, whatsapp_account_id
      `,
      [eventId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    if (!isRecord(row.payload)) throw new WebhookProcessingError("WEBHOOK_PAYLOAD_INVALID");
    return {
      id: row.id,
      payload: row.payload,
      tenantId: row.tenant_id,
      whatsappAccountId: row.whatsapp_account_id,
    };
  }

  /** The service owns the workflow; this boundary supplies one atomic persistence session. */
  async withTransaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await work(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async account(client: PoolClient, tenantId: string, accountId: string) {
    const result = await client.query<{ phone_number_id: string }>(
      `SELECT phone_number_id FROM app.whatsapp_accounts
       WHERE tenant_id = $1 AND id = $2 AND provider = 'META' FOR KEY SHARE`,
      [tenantId, accountId],
    );
    return result.rows[0];
  }

  async complete(client: PoolClient, event: StoredWebhookEvent): Promise<void> {
    await client.query(
      `UPDATE app.webhook_events SET status = 'PROCESSED', processed_at = now(), last_error_code = NULL
       WHERE id = $1 AND tenant_id = $2 AND whatsapp_account_id = $3 AND status = 'PROCESSING'`,
      [event.id, event.tenantId, event.whatsappAccountId],
    );
  }

  async lockInboundIdentity(
    client: PoolClient,
    tenantId: string,
    phone: string,
    providerId: string,
  ) {
    // A provider-key lock makes replay a no-op before Contact/activity/STOP writes.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `inbound:${providerId}`,
    ]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `inbound-contact:${tenantId}:${phone}`,
    ]);
    const result = await client.query<{
      tenant_id: string;
      whatsapp_account_id: string;
      direction: string;
    }>(
      "SELECT tenant_id, whatsapp_account_id, direction FROM app.messages WHERE provider_message_id = $1",
      [providerId],
    );
    return result.rows[0];
  }

  async activeContact(client: PoolClient, tenantId: string, phone: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM app.contacts WHERE tenant_id = $1 AND phone_e164 = $2 AND is_deleted = false FOR UPDATE`,
      [tenantId, phone],
    );
    return result.rows[0];
  }

  /** Internal review lookup only: never returns deleted customer data to an application client. */
  async findDeletedContactForInboundReview(
    client: PoolClient,
    tenantId: string,
    phone: string,
  ): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM app.contacts WHERE tenant_id = $1 AND phone_e164 = $2 AND is_deleted = true LIMIT 1 FOR UPDATE`,
      [tenantId, phone],
    );
    return result.rows.length > 0;
  }

  async markFailed(eventId: string, errorCode: string, dead: boolean): Promise<void> {
    await this.pool.query(
      `
        UPDATE app.webhook_events
        SET status = $2, last_error_code = $3
        WHERE id = $1 AND status = 'PROCESSING'
      `,
      [eventId, dead ? "DEAD" : "FAILED", errorCode],
    );
  }

  async replay(eventId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const event = await client.query<{
        id: string;
        external_event_key: string;
        tenant_id: string | null;
      }>(
        `
          UPDATE app.webhook_events
          SET status = 'RECEIVED', last_error_code = NULL, processed_at = NULL
          WHERE id = $1 AND status IN ('FAILED', 'DEAD')
          RETURNING id, external_event_key, tenant_id
        `,
        [eventId],
      );
      const row = event.rows[0];
      if (row === undefined) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `
          INSERT INTO app.outbox_events
            (tenant_id, aggregate_type, aggregate_id, event_type, payload, correlation_id)
          VALUES ($1, 'webhook_event', $2, 'webhook.event.received', $3::jsonb, $4)
        `,
        [
          row.tenant_id,
          row.id,
          JSON.stringify({ webhook_event_id: row.id }),
          row.external_event_key,
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertInboundMessage(
    client: PoolClient,
    tenantId: string,
    accountId: string,
    message: InboundMessage,
  ): Promise<boolean> {
    const contact = await client.query<{ id: string }>(
      `
        INSERT INTO app.contacts
          (tenant_id, phone_e164, name, source, consent_status, last_contacted_at)
        VALUES ($1, $2, $3, 'WHATSAPP_INBOUND', 'UNKNOWN', $4)
        ON CONFLICT (tenant_id, phone_e164) WHERE is_deleted = false
        DO UPDATE SET
          name = COALESCE(app.contacts.name, EXCLUDED.name),
          last_contacted_at = GREATEST(
            COALESCE(app.contacts.last_contacted_at, EXCLUDED.last_contacted_at),
            EXCLUDED.last_contacted_at
          ),
          updated_at = now()
        RETURNING id
      `,
      [tenantId, message.phoneE164, message.contactName, message.providerCreatedAt],
    );
    const contactId = requireRow(contact.rows[0], "CONTACT_UPSERT_FAILED").id;
    const conversation = await client.query<{ id: string }>(
      `
        INSERT INTO app.conversations (tenant_id, whatsapp_account_id, contact_id, status)
        VALUES ($1, $2, $3, 'OPEN')
        ON CONFLICT (tenant_id, whatsapp_account_id, contact_id)
        DO UPDATE SET updated_at = now()
        RETURNING id
      `,
      [tenantId, accountId, contactId],
    );
    const conversationId = requireRow(conversation.rows[0], "CONVERSATION_UPSERT_FAILED").id;
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO app.messages
          (tenant_id, conversation_id, contact_id, whatsapp_account_id, direction, message_type,
           status, provider_message_id, content, provider_created_at, policy_decision)
        VALUES ($1, $2, $3, $4, 'INBOUND', $5, 'RECEIVED', $6, $7::jsonb, $8, '{}'::jsonb)
        ON CONFLICT (provider_message_id) DO NOTHING
        RETURNING id
      `,
      [
        tenantId,
        conversationId,
        contactId,
        accountId,
        message.messageType,
        message.providerMessageId,
        JSON.stringify(message.content),
        message.providerCreatedAt,
      ],
    );
    if (inserted.rows[0] === undefined) return false;
    // Stored inbound identity and durable automation handoff commit together. Redis sees IDs only.
    await client.query(
      `INSERT INTO app.outbox_events
      (tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id)
      VALUES ($1,'message',$2,'automation.inbound.received',$3::jsonb,$4)`,
      [
        tenantId,
        inserted.rows[0].id,
        JSON.stringify({ message_id: inserted.rows[0].id }),
        `inbound:${inserted.rows[0].id}`,
      ],
    );
    await client.query(
      `
        UPDATE app.conversations
        SET status = 'OPEN',
            unread_count = unread_count + 1,
            last_customer_message_at = GREATEST(last_customer_message_at, $2::timestamptz),
            window_expires_at = GREATEST(window_expires_at, $2::timestamptz + interval '24 hours'),
            last_message_at = GREATEST(last_message_at, $2::timestamptz),
            updated_at = now()
        WHERE id = $1 AND tenant_id = $3 AND whatsapp_account_id = $4
      `,
      [conversationId, message.providerCreatedAt, tenantId, accountId],
    );
    return true;
  }

  async applyStatus(
    client: PoolClient,
    tenantId: string,
    accountId: string,
    status: DeliveryStatus,
  ): Promise<boolean> {
    const exists = await client.query<{ id: string }>(
      `SELECT id FROM app.messages WHERE provider_message_id = $1
       AND tenant_id = $2 AND whatsapp_account_id = $3 AND direction = 'OUTBOUND' FOR UPDATE`,
      [status.providerMessageId, tenantId, accountId],
    );
    const message = exists.rows[0];
    if (message === undefined) return false;
    await client.query(
      `
        UPDATE app.messages
        SET status = CASE
              WHEN status = 'READ' THEN status
              WHEN $2 = 'READ' THEN 'READ'
              WHEN status = 'DELIVERED' THEN status
              WHEN $2 = 'DELIVERED' THEN 'DELIVERED'
              WHEN $2 = 'SENT' AND status IN ('CREATED', 'QUEUED', 'SENDING') THEN 'SENT'
              WHEN $2 = 'FAILED' AND status IN ('CREATED', 'QUEUED', 'SENDING', 'SENT') THEN 'FAILED'
              ELSE status
            END,
            sent_at = CASE WHEN $2 = 'SENT' THEN COALESCE(sent_at, $3) ELSE sent_at END,
            delivered_at = CASE WHEN $2 = 'DELIVERED' THEN COALESCE(delivered_at, $3) ELSE delivered_at END,
            read_at = CASE WHEN $2 = 'READ' THEN COALESCE(read_at, $3) ELSE read_at END,
            error_code = CASE WHEN $2 IN ('READ','DELIVERED') THEN NULL
              WHEN $2 = 'FAILED' AND status IN ('CREATED','QUEUED','SENDING','SENT') THEN 'PROVIDER_DELIVERY_FAILED' ELSE error_code END,
            updated_at = now()
        WHERE id = $1 AND tenant_id = $4 AND whatsapp_account_id = $5
      `,
      [
        message.id,
        status.status,
        status.occurredAt ?? new Date().toISOString(),
        tenantId,
        accountId,
      ],
    );
    await client.query(
      `
        UPDATE app.campaign_recipients
        SET status = CASE
              WHEN status = 'READ' THEN status
              WHEN $2 = 'READ' THEN 'READ'
              WHEN status = 'DELIVERED' THEN status
              WHEN $2 = 'DELIVERED' THEN 'DELIVERED'
              WHEN $2 = 'SENT' AND status IN ('PENDING', 'QUEUED', 'SENT') THEN 'SENT'
              WHEN $2 = 'FAILED' AND status IN ('PENDING', 'QUEUED', 'SENT') THEN 'FAILED'
              ELSE status
            END,
            skip_or_error_code = CASE WHEN $2 IN ('READ','DELIVERED') THEN NULL
              WHEN $2 = 'FAILED' AND status IN ('PENDING','QUEUED','SENT') THEN 'PROVIDER_DELIVERY_FAILED' ELSE skip_or_error_code END,
            updated_at = now()
        WHERE message_id = $1 AND tenant_id = $3
      `,
      [message.id, status.status, tenantId],
    );
    if (status.status === "FAILED")
      await client.query(
        `INSERT INTO app.outbox_events
      (tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id)
      SELECT m.tenant_id,'automation_run',r.id,'automation.run.advance',jsonb_build_object('run_id',r.id),$4
      FROM app.messages m JOIN app.automation_runs r ON r.tenant_id=m.tenant_id
        AND r.conversation_id=m.conversation_id AND r.id::text=m.policy_decision->'automation'->>'runId'
      WHERE m.tenant_id=$1 AND m.whatsapp_account_id=$2 AND m.id=$3 AND m.status='FAILED'
        AND m.policy_decision->>'source'='AUTOMATION' AND r.status IN ('RUNNING','WAITING')`,
        [tenantId, accountId, message.id, `automation-failure:${message.id}`],
      );
    return true;
  }

  /** Persistence-only side effect for an already-decided inbound opt-out policy. */
  async applyTenantOptOut(
    client: PoolClient,
    tenantId: string,
    phoneE164: string,
    occurredAt: string | null,
  ): Promise<void> {
    const optOutAt = occurredAt ?? new Date().toISOString();
    const contact = await client.query<{ id: string }>(
      `
        UPDATE app.contacts
        SET consent_status = 'OPTED_OUT',
            opt_out_at = $3,
            opt_out_source = 'WHATSAPP_KEYWORD',
            suppression_reason = NULL,
            updated_at = now()
        WHERE tenant_id = $1 AND phone_e164 = $2 AND is_deleted = false
        RETURNING id
      `,
      [tenantId, phoneE164, optOutAt],
    );
    const contactId = contact.rows[0]?.id;
    if (contactId === undefined) return;
    await client.query(
      `
        INSERT INTO app.audit_logs
          (tenant_id, actor_role, action, entity_type, entity_id, result, metadata, request_id)
        VALUES ($1, 'SYSTEM', 'CONTACT_OPTED_OUT_BY_KEYWORD', 'contact', $2, 'SUCCESS', $3::jsonb, $4)
      `,
      [
        tenantId,
        contactId,
        JSON.stringify({ source: "WHATSAPP_KEYWORD" }),
        `webhook:${tenantId}:${contactId}:${optOutAt}`,
      ],
    );
  }
}

export class WebhookProcessingError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
  }
}

function requireRow<T>(value: T | undefined, code: string): T {
  if (value === undefined) throw new WebhookProcessingError(code);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
