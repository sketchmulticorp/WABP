import { createHash } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";

import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { MessagingRepository } from "./messaging.repository.js";
import type {
  CreateOutboundMessageInput,
  OutboundMessageRecord,
  OutboundMessageSource,
  OutboundPolicyDecision,
  OutboundPolicySnapshot,
  OutboundTemplateSnapshot,
} from "./messaging.types.js";

const REQUIRED_PERMISSION: Readonly<Record<OutboundMessageSource, string>> = {
  AUTOMATION: "automation.publish",
  CAMPAIGN: "campaign.send",
  INBOX: "conversation.reply",
};

interface TransactionResult {
  readonly blockedCode: string | null;
  readonly idempotent: boolean;
  readonly message: OutboundMessageRecord;
}

@Injectable()
export class MessagingService {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly tenantScope: TenantScopeService,
    private readonly outbox: OutboxRepository,
  ) {}

  async createOutboundMessage(
    context: AuthorizationContext,
    rawInput: CreateOutboundMessageInput,
    executor?: AppDatabaseTransaction,
    at = new Date(),
  ) {
    const tenant = this.tenantScope.requireTenantContext(context);
    requirePermission(context, REQUIRED_PERMISSION[rawInput.source]);
    const input = normalizeInput(rawInput);
    const requestFingerprint = fingerprint(input);
    const now = at;
    const period = utcCalendarMonth(now);

    const work = async (transaction: AppDatabaseTransaction) => {
      if (
        input.source === "AUTOMATION" &&
        (!(await this.repository.automationGate(
          transaction,
          tenant.tenantId,
          input,
          context.actorId,
        )) ||
          context.roleSystemKey !== "TENANT_ADMIN")
      )
        throw new ApplicationError({
          code: "AUTOMATION_OWNERSHIP_CHANGED",
          message: "Automation no longer owns this conversation.",
          statusCode: 409,
        });
      const campaign =
        input.source === "CAMPAIGN"
          ? await this.repository.campaignGate(transaction, tenant.tenantId, input)
          : undefined;
      if (
        input.source === "CAMPAIGN" &&
        (campaign?.status !== "RUNNING" ||
          campaign.templateContentVersion === null ||
          !(
            campaign.approvalStatus === "NOT_REQUIRED" ||
            (campaign.approvalStatus === "APPROVED" &&
              campaign.approvedVersion === campaign.contentVersion)
          ))
      )
        throw new ApplicationError({
          code: "CAMPAIGN_APPROVAL_CHANGED",
          message: "Campaign is not authorized for delivery.",
          statusCode: 409,
        });
      await this.repository.acquireCompositionLocks(
        transaction,
        tenant.tenantId,
        input.clientMessageKey,
        period.start,
      );
      const existing = await this.repository.findByClientMessageKey(
        transaction,
        tenant.tenantId,
        input.clientMessageKey,
      );
      if (existing !== undefined) return resolveExisting(existing, requestFingerprint);

      // A retry returns its original result above, even if the thread later closes.
      // Only a new reply is gated; closing never cancels already accepted messages.
      const inboxState =
        input.source === "INBOX"
          ? await this.repository.lockInboxState(transaction, tenant.tenantId, input.conversationId)
          : undefined;
      if (input.source === "INBOX" && inboxState === undefined) throw messageTargetNotFound();

      const snapshot = await this.repository.findPolicySnapshot(
        transaction,
        tenant.tenantId,
        input,
        now.toISOString(),
      );
      if (snapshot === undefined) throw messageTargetNotFound();

      const template =
        input.content.type === "TEMPLATE"
          ? await this.repository.findTemplate(
              transaction,
              tenant.tenantId,
              input.whatsappAccountId,
              input.content.templateId,
            )
          : undefined;
      if (input.content.type === "TEMPLATE" && template === undefined) {
        throw new ApplicationError({
          code: "MESSAGE_TEMPLATE_NOT_FOUND",
          message: "Template not found.",
          statusCode: HttpStatus.NOT_FOUND,
        });
      }
      if (campaign !== undefined && template?.contentVersion !== campaign.templateContentVersion)
        throw new ApplicationError({
          code: "CAMPAIGN_TEMPLATE_CHANGED",
          message: "The approved campaign template changed.",
          statusCode: 409,
        });

      const limit = monthlyMessageLimit(snapshot.planLimits);
      const usedBefore =
        limit === null
          ? 0
          : await this.repository.countReservedMessages(
              transaction,
              tenant.tenantId,
              period.start,
              period.end,
            );
      const inboxBlock =
        inboxState === undefined
          ? null
          : !["OPEN", "PENDING"].includes(inboxState.status)
            ? "CONVERSATION_REOPEN_REQUIRED"
            : !["NONE", "PAUSED", "HANDED_OFF"].includes(inboxState.automationState)
              ? "CONVERSATION_HANDOFF_REQUIRED"
              : null;
      const blockCode =
        inboxBlock ?? policyBlockCode(snapshot, input, template, limit, usedBefore, now);
      const decision = policyDecision({
        blockCode,
        input,
        limit,
        period,
        requestFingerprint,
        template,
        usedBefore,
      });
      const finalDecision: OutboundPolicyDecision = {
        ...decision,
        ...(input.automation === undefined ? {} : { automation: input.automation }),
        ...(campaign !== undefined && campaign.templateContentVersion !== null
          ? {
              campaign: {
                contentVersion: campaign.contentVersion,
                templateContentVersion: campaign.templateContentVersion,
              },
            }
          : {}),
      };
      const message = await this.repository.createMessage(
        transaction,
        tenant.tenantId,
        input,
        persistedContent(input, template),
        finalDecision,
        blockCode === null ? "CREATED" : "FAILED",
        blockCode,
      );
      if (blockCode === null) {
        if (input.source === "INBOX" || input.source === "AUTOMATION")
          await this.repository.touchInboxActivity(
            transaction,
            tenant.tenantId,
            input.conversationId,
            message.id,
          );
        await this.repository.reserveUsage(
          transaction,
          tenant.tenantId,
          message.id,
          now.toISOString(),
        );
        await this.outbox.create(transaction, {
          aggregateId: message.id,
          aggregateType: "message",
          correlationId: context.requestId,
          eventType: "message.outbound.created",
          payload: { message_id: message.id },
          tenantId: tenant.tenantId,
        });
      }
      await this.repository.audit(transaction, {
        action: blockCode === null ? "OUTBOUND_MESSAGE_CREATED" : "OUTBOUND_MESSAGE_BLOCKED",
        actorId: context.actorId,
        actorRole: tenant.roleSystemKey,
        blockCode,
        messageId: message.id,
        requestId: context.requestId,
        source: input.source,
        tenantId: tenant.tenantId,
      });
      return { blockedCode: blockCode, idempotent: false, message };
    };
    const result =
      executor === undefined ? await this.transactions.execute(work) : await work(executor);

    if (result.blockedCode !== null) throw blockedError(result.blockedCode);
    return {
      id: result.message.id,
      idempotent: result.idempotent,
      messageType: result.message.messageType,
      status: result.message.status,
    };
  }
}

function normalizeInput(input: CreateOutboundMessageInput): CreateOutboundMessageInput {
  if ((input.source === "AUTOMATION") !== (input.automation !== undefined))
    throw validationError("Automation messages require trusted run provenance.");
  if (input.content.type === "INTERACTIVE") {
    if (input.source !== "AUTOMATION")
      throw validationError("Interactive composition is restricted to automation.");
    const c = input.content;
    if (
      c.text.trim().length === 0 ||
      c.text.length > 1024 ||
      c.choices.length < 1 ||
      c.choices.length > (c.kind === "BUTTONS" ? 3 : 10) ||
      new Set(c.choices.map((v) => v.id)).size !== c.choices.length ||
      c.choices.some(
        (v) =>
          v.id.length < 1 ||
          v.id.length > 200 ||
          v.title.trim().length === 0 ||
          v.title.length > (c.kind === "BUTTONS" ? 20 : 24),
      )
    )
      throw validationError("Invalid interactive message.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.clientMessageKey)) {
    throw validationError("The client message key is invalid.");
  }
  if (input.source === "CAMPAIGN" && input.campaignId === undefined) {
    throw validationError("Campaign messages require a campaign ID.");
  }
  if (input.source !== "CAMPAIGN" && input.campaignId !== undefined) {
    throw validationError("Only campaign messages may include a campaign ID.");
  }
  if (input.content.type === "TEXT") {
    const text = input.content.text.trim();
    if (text.length === 0 || text.length > 4096) {
      throw validationError("Text messages must contain between 1 and 4096 characters.");
    }
    return { ...input, content: { text, type: "TEXT" } };
  }
  if (input.content.type === "INTERACTIVE") return input;
  const variables = Object.fromEntries(
    Object.entries(input.content.variables).map(([key, value]) => [key.trim(), value.trim()]),
  );
  if (Object.values(variables).some((value) => value.length === 0)) {
    throw validationError("Template variables cannot be empty.");
  }
  return { ...input, content: { ...input.content, variables } };
}

function policyBlockCode(
  snapshot: OutboundPolicySnapshot,
  input: CreateOutboundMessageInput,
  template: OutboundTemplateSnapshot | undefined,
  limit: number | null,
  usedBefore: number,
  now: Date,
): string | null {
  if (snapshot.tenantStatus !== "ACTIVE") return "TENANT_NOT_ACTIVE";
  if (snapshot.subscriptionStatus !== "ACTIVE" && snapshot.subscriptionStatus !== "TRIAL") {
    return "SUBSCRIPTION_NOT_ACTIVE";
  }
  if (snapshot.planStatus !== "ACTIVE" || limit === null) return "PLAN_MESSAGE_LIMIT_INVALID";
  if (snapshot.accountStatus !== "CONNECTED" || snapshot.accountCredentialStatus !== "ACTIVE") {
    return "WHATSAPP_ACCOUNT_NOT_CONNECTED";
  }
  if (["OPTED_OUT", "SUPPRESSED"].includes(snapshot.contactConsentStatus)) {
    return "CONTACT_MESSAGING_BLOCKED";
  }
  if (input.content.type === "TEXT" || input.content.type === "INTERACTIVE") {
    if (
      snapshot.conversationWindowExpiresAt === null ||
      new Date(snapshot.conversationWindowExpiresAt).getTime() <= now.getTime()
    ) {
      return "CUSTOMER_SERVICE_WINDOW_CLOSED";
    }
  } else {
    if (snapshot.contactConsentStatus !== "OPTED_IN") return "CONTACT_OPT_IN_REQUIRED";
    if (template === undefined) return "MESSAGE_TEMPLATE_NOT_FOUND";
    if (template.providerStatus !== "APPROVED") return "WHATSAPP_TEMPLATE_NOT_APPROVED";
    if (
      template.approvalStatus !== "NOT_REQUIRED" &&
      !(
        template.approvalStatus === "APPROVED" &&
        template.approvedVersion === template.contentVersion
      )
    ) {
      return "TEMPLATE_INTERNAL_APPROVAL_REQUIRED";
    }
    if (!templateVariablesMatch(template.components, input.content.variables)) {
      return "TEMPLATE_VARIABLES_INVALID";
    }
  }
  if (usedBefore >= limit) return "MESSAGE_QUOTA_EXCEEDED";
  return null;
}

function policyDecision(input: {
  readonly blockCode: string | null;
  readonly input: CreateOutboundMessageInput;
  readonly limit: number | null;
  readonly period: { readonly end: string; readonly start: string };
  readonly requestFingerprint: string;
  readonly template: OutboundTemplateSnapshot | undefined;
  readonly usedBefore: number;
}): OutboundPolicyDecision {
  return {
    outcome: input.blockCode === null ? "ALLOWED" : "BLOCKED",
    source: input.input.source,
    version: 1,
    requestFingerprint: input.requestFingerprint,
    ...(input.blockCode === null ? {} : { blockCode: input.blockCode }),
    ...(input.limit === null
      ? {}
      : {
          quota: {
            limit: input.limit,
            periodEnd: input.period.end,
            periodStart: input.period.start,
            usedBefore: input.usedBefore,
          },
        }),
    ...(input.template === undefined
      ? {}
      : {
          template: {
            approvalStatus: input.template.approvalStatus,
            approvedVersion: input.template.approvedVersion,
            contentVersion: input.template.contentVersion,
            providerStatus: input.template.providerStatus,
            templateId: input.template.id,
          },
        }),
  };
}

function persistedContent(
  input: CreateOutboundMessageInput,
  template: OutboundTemplateSnapshot | undefined,
): Readonly<Record<string, unknown>> {
  if (input.content.type === "TEXT") return { text: input.content.text };
  if (input.content.type === "INTERACTIVE")
    return { kind: input.content.kind, text: input.content.text, choices: input.content.choices };
  if (template === undefined) throw new Error("Validated template content is missing.");
  return {
    category: template.category,
    language: template.language,
    name: template.name,
    templateId: template.id,
    variables: input.content.variables,
  };
}

function templateVariablesMatch(
  components: unknown,
  variables: Readonly<Record<string, string>>,
): boolean {
  const expected = new Set<string>();
  const serialized = JSON.stringify(components);
  for (const match of serialized.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\}\}/gu)) {
    const key = match[1];
    if (key !== undefined) expected.add(key);
  }
  const supplied = Object.keys(variables);
  return supplied.length === expected.size && supplied.every((key) => expected.has(key));
}

function monthlyMessageLimit(limits: unknown): number | null {
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) return null;
  const value = (limits as Record<string, unknown>).monthly_message_limit;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function utcCalendarMonth(now: Date): { readonly end: string; readonly start: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { end: end.toISOString(), start: start.toISOString() };
}

function fingerprint(input: CreateOutboundMessageInput): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function resolveExisting(
  existing: OutboundMessageRecord,
  requestFingerprint: string,
): TransactionResult {
  const decision = existing.policyDecision;
  if (
    typeof decision !== "object" ||
    decision === null ||
    !("requestFingerprint" in decision) ||
    decision.requestFingerprint !== requestFingerprint
  ) {
    throw new ApplicationError({
      code: "MESSAGE_IDEMPOTENCY_CONFLICT",
      message: "The client message key was already used for different content.",
      statusCode: HttpStatus.CONFLICT,
    });
  }
  const blockedCode =
    "outcome" in decision &&
    decision.outcome === "BLOCKED" &&
    "blockCode" in decision &&
    typeof decision.blockCode === "string"
      ? decision.blockCode
      : null;
  return { blockedCode, idempotent: true, message: existing };
}

function requirePermission(context: AuthorizationContext, permission: string): void {
  if (context.permissions.has(permission)) return;
  throw new ApplicationError({
    code: "FORBIDDEN",
    message: "The required messaging permission is missing.",
    statusCode: HttpStatus.FORBIDDEN,
  });
}

function blockedError(code: string): ApplicationError {
  const statusCode =
    code === "MESSAGE_QUOTA_EXCEEDED" ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.CONFLICT;
  return new ApplicationError({
    code,
    message: "The outbound message was blocked by policy.",
    statusCode,
  });
}

function messageTargetNotFound(): ApplicationError {
  return new ApplicationError({
    code: "MESSAGE_TARGET_NOT_FOUND",
    message: "The outbound message target was not found.",
    statusCode: HttpStatus.NOT_FOUND,
  });
}

function validationError(message: string): ApplicationError {
  return new ApplicationError({
    code: "VALIDATION_FAILED",
    message,
    statusCode: HttpStatus.BAD_REQUEST,
  });
}
