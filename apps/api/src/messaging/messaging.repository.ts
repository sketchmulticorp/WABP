import { Injectable } from "@nestjs/common";
import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  campaignsInApp,
  campaignRecipientsInApp,
  contactsInApp,
  conversationsInApp,
  messagesInApp,
  plansInApp,
  providerCredentialsInApp,
  subscriptionsInApp,
  templatesInApp,
  tenantsInApp,
  usageEventsInApp,
  whatsappAccountsInApp,
} from "../database/schema/index.js";
import type {
  CreateOutboundMessageInput,
  OutboundMessageRecord,
  OutboundPolicyDecision,
  OutboundPolicySnapshot,
  OutboundTemplateSnapshot,
} from "./messaging.types.js";

@Injectable()
export class MessagingRepository {
  /** Batch lock preflight for automation: keys before quota before Conversation/run locks. */
  async acquireAutomationLocks(
    tx: AppDatabaseTransaction,
    tenantId: string,
    keys: readonly string[],
    periodStart: string,
  ) {
    for (const key of [...keys].sort())
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`message-key:${tenantId}:${key}`},0))`,
      );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`message-quota:${tenantId}:${periodStart}`},0))`,
    );
  }
  async automationGate(
    tx: AppDatabaseTransaction,
    tenantId: string,
    input: CreateOutboundMessageInput,
    actorId: string,
  ) {
    const evidence = input.automation;
    if (evidence === undefined) return false;
    const rows = await tx.execute(sql`SELECT r.id FROM app.automation_runs r
      JOIN app.automation_versions v ON v.tenant_id=r.tenant_id AND v.id=r.flow_version_id AND v.status='PUBLISHED'
      JOIN app.automation_flows f ON f.tenant_id=v.tenant_id AND f.id=v.flow_id AND f.is_deleted=false AND f.status='ACTIVE'
      JOIN app.automation_nodes n ON n.tenant_id=r.tenant_id AND n.version_id=v.id AND n.id=r.current_node_id
      JOIN app.conversations c ON c.tenant_id=r.tenant_id AND c.id=r.conversation_id AND c.automation_state='ACTIVE'
      WHERE r.tenant_id=${tenantId}::uuid AND r.id=${evidence.runId}::uuid AND r.flow_version_id=${evidence.versionId}::uuid
        AND r.conversation_id=${input.conversationId}::uuid AND r.status='RUNNING' AND n.node_key=${evidence.nodeKey}
        AND c.contact_id=${input.contactId}::uuid AND c.whatsapp_account_id=${input.whatsappAccountId}::uuid
        AND v.trigger_config->>'accountId'=${input.whatsappAccountId} AND v.trigger_config->>'publishedBy'=${actorId}
        AND ${actorId}=${evidence.publisherId}
        AND EXISTS(SELECT 1 FROM app.subscriptions s JOIN app.plans p ON p.id=s.plan_id
          WHERE s.tenant_id=r.tenant_id AND s.status IN ('ACTIVE','TRIAL') AND s.starts_at<=now() AND (s.ends_at IS NULL OR s.ends_at>now())
          AND p.status='ACTIVE' AND p.feature_flags->'automation_enabled'='true'::jsonb)`);
    return rows.rows.length === 1;
  }
  /** Lock after common message/quota locks to retain the shared composition lock order. */
  async lockInboxState(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
  ) {
    const result = await transaction.execute<{ status: string; automationState: string }>(sql`
      SELECT status,automation_state AS "automationState" FROM app.conversations
      WHERE tenant_id=${tenantId}::uuid AND id=${conversationId}::uuid FOR UPDATE
    `);
    return result.rows[0];
  }

  async touchInboxActivity(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await transaction.execute(sql`
      UPDATE app.conversations c SET
        last_message_at=greatest(c.last_message_at,m.created_at),updated_at=clock_timestamp()
      FROM app.messages m
      WHERE c.tenant_id=${tenantId}::uuid AND c.id=${conversationId}::uuid
        AND m.tenant_id=c.tenant_id AND m.conversation_id=c.id AND m.id=${messageId}::uuid
    `);
  }
  async campaignGate(
    tx: AppDatabaseTransaction,
    tenantId: string,
    input: CreateOutboundMessageInput,
  ) {
    const [row] = await tx
      .select({
        contentVersion: campaignsInApp.contentVersion,
        templateContentVersion: campaignsInApp.templateContentVersion,
        approvalStatus: campaignsInApp.approvalStatus,
        approvedVersion: campaignsInApp.approvedVersion,
        status: campaignsInApp.status,
      })
      .from(campaignsInApp)
      .innerJoin(
        campaignRecipientsInApp,
        and(
          eq(campaignRecipientsInApp.tenantId, campaignsInApp.tenantId),
          eq(campaignRecipientsInApp.campaignId, campaignsInApp.id),
          eq(campaignRecipientsInApp.contactId, input.contactId),
          eq(campaignRecipientsInApp.contentVersion, campaignsInApp.contentVersion),
          eq(campaignRecipientsInApp.preflightRunId, campaignsInApp.finalPreflightId),
        ),
      )
      .where(
        and(
          eq(campaignsInApp.tenantId, tenantId),
          eq(campaignsInApp.id, input.campaignId ?? "00000000-0000-4000-8000-000000000000"),
          eq(campaignsInApp.whatsappAccountId, input.whatsappAccountId),
          eq(
            campaignsInApp.templateId,
            input.content.type === "TEMPLATE"
              ? input.content.templateId
              : "00000000-0000-4000-8000-000000000000",
          ),
          eq(campaignsInApp.isDeleted, false),
          eq(campaignRecipientsInApp.status, "PENDING"),
          sql`${campaignRecipientsInApp.messageId} is null`,
          sql`${input.clientMessageKey} = 'campaign:' || ${campaignsInApp.id}::text || ':' || ${campaignRecipientsInApp.id}::text`,
          sql`${campaignRecipientsInApp.renderedVariables} = ${JSON.stringify(input.content.type === "TEMPLATE" ? input.content.variables : {})}::jsonb`,
        ),
      )
      .for("update");
    return row;
  }
  async findByClientMessageKey(
    executor: AppDatabase | AppDatabaseTransaction,
    tenantId: string,
    clientMessageKey: string,
  ): Promise<OutboundMessageRecord | undefined> {
    const rows = await executor
      .select(messageProjection())
      .from(messagesInApp)
      .where(
        and(
          eq(messagesInApp.tenantId, tenantId),
          eq(messagesInApp.clientMessageKey, clientMessageKey),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Claims idempotency first, then serializes the tenant's monthly quota decision. */
  async acquireCompositionLocks(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    clientMessageKey: string,
    periodStart: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`message-key:${tenantId}:${clientMessageKey}`}, 0))`,
    );
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`message-quota:${tenantId}:${periodStart}`}, 0))`,
    );
  }

  async findPolicySnapshot(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    input: CreateOutboundMessageInput,
    now: string,
  ): Promise<OutboundPolicySnapshot | undefined> {
    const baseRows = await transaction
      .select({
        accountCredentialStatus: providerCredentialsInApp.status,
        accountStatus: whatsappAccountsInApp.status,
        contactConsentStatus: contactsInApp.consentStatus,
        conversationWindowExpiresAt: conversationsInApp.windowExpiresAt,
        tenantStatus: tenantsInApp.status,
      })
      .from(conversationsInApp)
      .innerJoin(
        tenantsInApp,
        and(eq(tenantsInApp.id, conversationsInApp.tenantId), eq(tenantsInApp.isDeleted, false)),
      )
      .innerJoin(
        contactsInApp,
        and(
          eq(contactsInApp.tenantId, conversationsInApp.tenantId),
          eq(contactsInApp.id, conversationsInApp.contactId),
          eq(contactsInApp.isDeleted, false),
        ),
      )
      .innerJoin(
        whatsappAccountsInApp,
        and(
          eq(whatsappAccountsInApp.tenantId, conversationsInApp.tenantId),
          eq(whatsappAccountsInApp.id, conversationsInApp.whatsappAccountId),
        ),
      )
      .leftJoin(
        providerCredentialsInApp,
        and(
          eq(providerCredentialsInApp.tenantId, conversationsInApp.tenantId),
          eq(providerCredentialsInApp.whatsappAccountId, conversationsInApp.whatsappAccountId),
        ),
      )
      .where(
        and(
          eq(conversationsInApp.tenantId, tenantId),
          eq(conversationsInApp.id, input.conversationId),
          eq(conversationsInApp.contactId, input.contactId),
          eq(conversationsInApp.whatsappAccountId, input.whatsappAccountId),
        ),
      )
      .limit(1);
    const base = baseRows[0];
    if (base === undefined) return undefined;

    const subscriptionRows = await transaction
      .select({
        planLimits: plansInApp.limits,
        planStatus: plansInApp.status,
        subscriptionStatus: subscriptionsInApp.status,
      })
      .from(subscriptionsInApp)
      .innerJoin(plansInApp, eq(plansInApp.id, subscriptionsInApp.planId))
      .where(
        and(
          eq(subscriptionsInApp.tenantId, tenantId),
          lte(subscriptionsInApp.startsAt, now),
          or(isNull(subscriptionsInApp.endsAt), gt(subscriptionsInApp.endsAt, now)),
          inArray(subscriptionsInApp.status, [
            "ACTIVE",
            "CANCELLED",
            "EXPIRED",
            "PAST_DUE",
            "SUSPENDED",
            "TRIAL",
          ]),
        ),
      )
      .orderBy(sql`${subscriptionsInApp.startsAt} desc`)
      .limit(2);
    const subscription = subscriptionRows.length === 1 ? subscriptionRows[0] : undefined;
    return {
      ...base,
      planLimits: subscription?.planLimits ?? null,
      planStatus: subscription?.planStatus ?? null,
      subscriptionStatus: subscription?.subscriptionStatus ?? null,
    };
  }

  async findTemplate(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    accountId: string,
    templateId: string,
  ): Promise<OutboundTemplateSnapshot | undefined> {
    const rows = await transaction
      .select({
        approvalStatus: templatesInApp.approvalStatus,
        approvedVersion: templatesInApp.approvedVersion,
        category: templatesInApp.category,
        components: templatesInApp.components,
        contentVersion: templatesInApp.contentVersion,
        id: templatesInApp.id,
        language: templatesInApp.language,
        name: templatesInApp.name,
        providerStatus: templatesInApp.providerStatus,
      })
      .from(templatesInApp)
      .where(
        and(
          eq(templatesInApp.tenantId, tenantId),
          eq(templatesInApp.id, templateId),
          eq(templatesInApp.whatsappAccountId, accountId),
          eq(templatesInApp.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async countReservedMessages(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<number> {
    const rows = await transaction
      .select({ total: sql<string>`coalesce(sum(${usageEventsInApp.quantity}), 0)` })
      .from(usageEventsInApp)
      .where(
        and(
          eq(usageEventsInApp.tenantId, tenantId),
          eq(usageEventsInApp.eventType, "OUTBOUND_MESSAGE_RESERVED"),
          gte(usageEventsInApp.occurredAt, periodStart),
          lt(usageEventsInApp.occurredAt, periodEnd),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async createMessage(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    input: CreateOutboundMessageInput,
    content: Readonly<Record<string, unknown>>,
    decision: OutboundPolicyDecision,
    status: "CREATED" | "FAILED",
    errorCode: string | null,
  ): Promise<OutboundMessageRecord> {
    const rows = await transaction
      .insert(messagesInApp)
      .values({
        campaignId: input.campaignId,
        clientMessageKey: input.clientMessageKey,
        contactId: input.contactId,
        content,
        conversationId: input.conversationId,
        direction: "OUTBOUND",
        errorCode,
        errorMessage: errorCode === null ? null : "Message creation was blocked by policy.",
        messageType: input.content.type,
        policyDecision: decision,
        status,
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
      })
      .returning(messageProjection());
    const message = rows[0];
    if (message === undefined) throw new Error("Message creation did not return a row.");
    return message;
  }

  async reserveUsage(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    messageId: string,
    occurredAt: string,
  ): Promise<void> {
    await transaction.insert(usageEventsInApp).values({
      dedupeKey: `outbound-message:${messageId}`,
      eventType: "OUTBOUND_MESSAGE_RESERVED",
      occurredAt,
      quantity: "1",
      relatedEntityId: messageId,
      relatedEntityType: "message",
      tenantId,
      unit: "MESSAGE",
    });
  }

  async audit(
    transaction: AppDatabaseTransaction,
    input: {
      readonly action: "OUTBOUND_MESSAGE_BLOCKED" | "OUTBOUND_MESSAGE_CREATED";
      readonly actorId: string;
      readonly actorRole: "TENANT_ADMIN" | "TENANT_USER";
      readonly blockCode: string | null;
      readonly messageId: string;
      readonly requestId: string;
      readonly source: string;
      readonly tenantId: string;
    },
  ): Promise<void> {
    await transaction.insert(auditLogsInApp).values({
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: input.messageId,
      entityType: "message",
      metadata: { block_code: input.blockCode, source: input.source },
      requestId: input.requestId,
      result: input.blockCode === null ? "SUCCESS" : "DENIED",
      tenantId: input.tenantId,
    });
  }
}

function messageProjection() {
  return {
    clientMessageKey: messagesInApp.clientMessageKey,
    errorCode: messagesInApp.errorCode,
    id: messagesInApp.id,
    messageType: messagesInApp.messageType,
    policyDecision: messagesInApp.policyDecision,
    status: messagesInApp.status,
  };
}
