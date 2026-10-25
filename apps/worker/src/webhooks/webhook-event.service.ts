import { Injectable } from "@nestjs/common";

import { WebhookEventRepository, WebhookProcessingError } from "./webhook-event.repository.js";
import type {
  DeliveryStatus,
  InboundMessage,
  ParsedWebhookEffects,
} from "./webhook-event.types.js";

@Injectable()
export class WebhookEventService {
  constructor(private readonly repository: WebhookEventRepository) {}

  async process(eventId: string): Promise<void> {
    const event = await this.repository.claimForProcessing(eventId);
    if (event === undefined) return;
    const { tenantId, whatsappAccountId } = event;
    if (tenantId === null || whatsappAccountId === null)
      throw new WebhookProcessingError("UNRESOLVED_WHATSAPP_ACCOUNT");
    await this.repository.withTransaction(async (transaction) => {
      const account = await this.repository.account(transaction, tenantId, whatsappAccountId);
      if (account === undefined) throw new WebhookProcessingError("UNRESOLVED_WHATSAPP_ACCOUNT");
      assertAccountRouting(event.payload, account.phone_number_id);
      const effects = parseWebhookEffects(event.payload);
      for (const message of effects.inboundMessages) {
        const existing = await this.repository.lockInboundIdentity(
          transaction,
          tenantId,
          message.phoneE164,
          message.providerMessageId,
        );
        if (existing !== undefined) {
          if (
            existing.tenant_id !== tenantId ||
            existing.whatsapp_account_id !== whatsappAccountId ||
            existing.direction !== "INBOUND"
          )
            throw new WebhookProcessingError("WEBHOOK_MESSAGE_OWNERSHIP_MISMATCH");
          continue;
        }
        const active = await this.repository.activeContact(
          transaction,
          tenantId,
          message.phoneE164,
        );
        if (
          active === undefined &&
          (await this.repository.findDeletedContactForInboundReview(
            transaction,
            tenantId,
            message.phoneE164,
          ))
        )
          throw new WebhookProcessingError("INBOUND_CONTACT_REVIEW_REQUIRED");
        const inserted = await this.repository.insertInboundMessage(
          transaction,
          tenantId,
          whatsappAccountId,
          message,
        );
        if (inserted && message.triggersTenantOptOut)
          await this.repository.applyTenantOptOut(
            transaction,
            tenantId,
            message.phoneE164,
            message.providerCreatedAt,
          );
      }
      for (const status of effects.statuses) {
        if (!(await this.repository.applyStatus(transaction, tenantId, whatsappAccountId, status)))
          throw new WebhookProcessingError("MESSAGE_NOT_FOUND");
      }
      await this.repository.complete(transaction, event);
    });
  }

  async fail(eventId: string, error: unknown, dead: boolean): Promise<void> {
    await this.repository.markFailed(eventId, safeErrorCode(error), dead);
  }

  replay(eventId: string): Promise<boolean> {
    return this.repository.replay(eventId);
  }
}

function parseWebhookEffects(payload: Record<string, unknown>): ParsedWebhookEffects {
  const inboundMessages: InboundMessage[] = [];
  const statuses: DeliveryStatus[] = [];
  const entries = payload.entry;
  if (!Array.isArray(entries)) return { inboundMessages, statuses };
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
      const names = contactNames(change.value.contacts);
      if (Array.isArray(change.value.messages)) {
        for (const message of change.value.messages) {
          const normalized = normalizeInboundMessage(message, names);
          if (normalized !== null) inboundMessages.push(normalized);
        }
      }
      if (Array.isArray(change.value.statuses)) {
        for (const status of change.value.statuses) {
          const normalized = normalizeDeliveryStatus(status);
          if (normalized !== null) statuses.push(normalized);
        }
      }
    }
  }
  return { inboundMessages, statuses };
}

function normalizeInboundMessage(
  value: unknown,
  names: ReadonlyMap<string, string>,
): InboundMessage | null {
  if (!isRecord(value)) return null;
  const providerMessageId = requiredString(value.id);
  const phoneE164 = normalizeMetaPhone(value.from);
  const providerType = requiredString(value.type);
  if (providerMessageId === null || phoneE164 === null || providerType === null) return null;
  const providerCreatedAt = timestampToIso(value.timestamp);
  // Processing time is not evidence of when the customer opened the service window.
  if (providerCreatedAt === null) throw new WebhookProcessingError("INBOUND_TIMESTAMP_INVALID");
  return {
    contactName: names.get(String(value.from)) ?? null,
    content: messageContent(value, providerType),
    messageType: mapMessageType(providerType),
    phoneE164,
    providerCreatedAt,
    providerMessageId,
    triggersTenantOptOut: isOptOutKeyword(value, providerType),
  };
}

/** The MVP intentionally recognizes only whole-message, unambiguous opt-out keywords. */
function isOptOutKeyword(value: Record<string, unknown>, providerType: string): boolean {
  if (providerType.toLowerCase() !== "text" || !isRecord(value.text)) return false;
  const body = value.text.body;
  if (typeof body !== "string") return false;
  return new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]).has(body.trim().toUpperCase());
}

function normalizeDeliveryStatus(value: unknown): DeliveryStatus | null {
  if (!isRecord(value)) return null;
  const providerMessageId = requiredString(value.id);
  const status = requiredString(value.status)?.toUpperCase();
  if (providerMessageId === null || status === undefined) return null;
  if (status !== "SENT" && status !== "DELIVERED" && status !== "READ" && status !== "FAILED") {
    // Meta 'deleted' and unknown statuses stay preserved only in the protected webhook event.
    return null;
  }
  return { occurredAt: timestampToIso(value.timestamp), providerMessageId, status };
}

function contactNames(value: unknown): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (!Array.isArray(value)) return names;
  for (const contact of value) {
    if (!isRecord(contact) || !isRecord(contact.profile)) continue;
    const waId = requiredString(contact.wa_id);
    const name = requiredString(contact.profile.name);
    if (waId !== null && name !== null) names.set(waId, name);
  }
  return names;
}

function messageContent(
  value: Record<string, unknown>,
  providerType: string,
): Record<string, unknown> {
  const content = value[providerType];
  return {
    provider_type: providerType,
    ...(isRecord(value.context) && typeof value.context.id === "string"
      ? { contextMessageId: value.context.id }
      : {}),
    ...(isRecord(content) ? { data: sanitizeJson(content) } : {}),
  };
}

function mapMessageType(value: string): InboundMessage["messageType"] {
  switch (value.toLowerCase()) {
    case "text":
      return "TEXT";
    case "image":
      return "IMAGE";
    case "video":
      return "VIDEO";
    case "document":
      return "DOCUMENT";
    case "audio":
    case "sticker":
      return "AUDIO";
    case "interactive":
    case "button":
      return "INTERACTIVE";
    default:
      return "SYSTEM";
  }
}

function normalizeMetaPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/gu, "");
  return /^[1-9]\d{6,14}$/u.test(digits) ? `+${digits}` : null;
}

function timestampToIso(value: unknown): string | null {
  if (typeof value === "string" && !/^\d+$/u.test(value)) return null;
  const seconds = typeof value === "string" ? Number(value) : value;
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds <= 0) return null;
  const timestamp = new Date(seconds * 1_000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

/** Every message-bearing change must match the ownership resolved at verified ingestion. */
function assertAccountRouting(payload: Record<string, unknown>, phoneNumberId: string): void {
  if (!Array.isArray(payload.entry)) return;
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
      if (
        !isRecord(change.value.metadata) ||
        change.value.metadata.phone_number_id !== phoneNumberId
      )
        throw new WebhookProcessingError("WEBHOOK_ACCOUNT_MISMATCH");
    }
  }
}

function sanitizeJson(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (isRecord(value)) return sanitizeJson(value);
  return null;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof WebhookProcessingError) return error.safeCode;
  return "WEBHOOK_PROCESSING_FAILED";
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const webhookEventTestHelpers = { parseWebhookEffects };
