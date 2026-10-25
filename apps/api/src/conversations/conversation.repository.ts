import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { ConversationSummary, ConversationMessage } from "@whatsapp-platform/contracts";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { InboxFilters, InboxPage } from "./conversation.dto.js";

type InboxRow = Omit<ConversationSummary, "serviceWindowOpen"> & { sortAt: string };
type MessageRow = { [Key in keyof ConversationMessage]: ConversationMessage[Key] };

/** All SQL and row locking stay here; the service selects allowed workflow actions. */
@Injectable()
export class ConversationRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async list(tenantId: string, input: InboxFilters): Promise<InboxRow[]> {
    const pattern = input.search === null ? null : `%${input.search.replace(/[\\%_]/gu, "\\$&")}%`;
    const result = await this.database.execute<InboxRow>(sql`
      SELECT ${projection()} ${source(tenantId)}
      AND (${input.status}::text IS NULL OR c.status = ${input.status})
      AND (${input.accountId}::uuid IS NULL OR c.whatsapp_account_id = ${input.accountId}::uuid)
      AND (${input.unread}::boolean IS NULL OR (c.unread_count > 0) = ${input.unread}::boolean)
      AND (${pattern}::text IS NULL OR ct.name ILIKE ${pattern} OR ct.phone_e164 ILIKE ${pattern})
      ${input.cursor === null ? sql`` : sql`AND (coalesce(c.last_message_at,c.created_at), c.id) < (${input.cursor.at}::timestamptz, ${input.cursor.id}::uuid)`}
      ORDER BY coalesce(c.last_message_at,c.created_at) DESC, c.id DESC LIMIT ${input.limit + 1}
    `);
    return result.rows;
  }
  async find(
    tenantId: string,
    id: string,
    tx?: AppDatabaseTransaction,
  ): Promise<InboxRow | undefined> {
    const result = await (tx ?? this.database).execute<InboxRow>(sql`
      SELECT ${projection()} ${source(tenantId)} AND c.id = ${id}::uuid
      ${tx === undefined ? sql`` : sql`FOR UPDATE OF c`}
    `);
    return result.rows[0];
  }
  async history(tenantId: string, id: string, page: InboxPage): Promise<ConversationMessage[]> {
    const result = await this.database.execute<MessageRow>(sql`
      SELECT m.id, m.direction, m.message_type AS "messageType", m.status, m.content,
        m.error_code AS "errorCode", m.created_at::text AS "createdAt",
        m.provider_created_at::text AS "providerCreatedAt", m.sent_at::text AS "sentAt",
        m.delivered_at::text AS "deliveredAt", m.read_at::text AS "readAt"
      FROM app.messages m
      JOIN app.contacts ct ON ct.id=m.contact_id AND ct.tenant_id=m.tenant_id AND ct.is_deleted=false
      WHERE m.tenant_id=${tenantId}::uuid AND m.conversation_id=${id}::uuid
      ${page.cursor === null ? sql`` : sql`AND (m.created_at,m.id) < (${page.cursor.at}::timestamptz,${page.cursor.id}::uuid)`}
      ORDER BY m.created_at DESC,m.id DESC LIMIT ${page.limit + 1}
    `);
    return result.rows;
  }
  async messageBoundary(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    messageId: string,
  ) {
    const result = await tx.execute<{ at: string; id: string }>(sql`
      SELECT created_at::text AS at,id FROM app.messages
      WHERE tenant_id=${tenantId}::uuid AND conversation_id=${id}::uuid AND id=${messageId}::uuid
    `);
    return result.rows[0];
  }
  async unreadAfter(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    boundary: { at: string; id: string } | null,
  ): Promise<number> {
    const result = await tx.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM app.messages
      WHERE tenant_id=${tenantId}::uuid AND conversation_id=${id}::uuid AND direction='INBOUND'
      ${boundary === null ? sql`` : sql`AND (created_at,id) > (${boundary.at}::timestamptz,${boundary.id}::uuid)`}
    `);
    return result.rows[0]?.count ?? 0;
  }
  async update(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    change: { status?: string; unreadCount?: number },
  ): Promise<void> {
    await tx.execute(sql`UPDATE app.conversations SET
      status=coalesce(${change.status ?? null}::text,status),
      unread_count=coalesce(${change.unreadCount ?? null}::int,unread_count), updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`);
  }
  async audit(
    tx: AppDatabaseTransaction,
    context: AuthorizationContext,
    tenantId: string,
    id: string,
    action: string,
    metadata: {
      readonly noteId?: string;
      readonly previousAssigneeId?: string | null;
      readonly assignedUserId?: string | null;
    } = {},
  ): Promise<void> {
    await tx.execute(sql`INSERT INTO app.audit_logs
      (tenant_id,actor_id,actor_role,action,entity_type,entity_id,result,metadata,request_id)
      VALUES (${tenantId}::uuid,${context.actorId}::uuid,${context.roleSystemKey},${action},'conversation',${id},'SUCCESS',${JSON.stringify(metadata)}::jsonb,${context.requestId})`);
  }
  async assign(
    tx: AppDatabaseTransaction,
    tenantId: string,
    id: string,
    assignedUserId: string | null,
  ): Promise<void> {
    await tx.execute(sql`UPDATE app.conversations SET assigned_user_id=${assignedUserId}::uuid,updated_at=clock_timestamp()
      WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`);
  }
}
function source(tenantId: string) {
  return sql`FROM app.conversations c
    JOIN app.contacts ct ON ct.id=c.contact_id AND ct.tenant_id=c.tenant_id AND ct.is_deleted=false
    JOIN app.whatsapp_accounts a ON a.id=c.whatsapp_account_id AND a.tenant_id=c.tenant_id
    WHERE c.tenant_id=${tenantId}::uuid`;
}
function projection() {
  return sql`c.id,c.contact_id AS "contactId",ct.name AS "contactName",ct.phone_e164 AS "phoneE164",
    ct.consent_status AS "consentStatus",c.whatsapp_account_id AS "whatsappAccountId",a.status AS "accountStatus",
    c.assigned_user_id AS "assignedUserId",c.status,c.automation_state AS "automationState",
    c.unread_count AS "unreadCount",c.last_message_at::text AS "lastMessageAt",
    c.window_expires_at::text AS "windowExpiresAt",coalesce(c.last_message_at,c.created_at)::text AS "sortAt"`;
}
