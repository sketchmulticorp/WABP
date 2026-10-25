export interface StoredWebhookEvent {
  readonly id: string;
  readonly payload: Record<string, unknown>;
  readonly tenantId: string | null;
  readonly whatsappAccountId: string | null;
}

export interface InboundMessage {
  readonly content: Record<string, unknown>;
  readonly contactName: string | null;
  readonly messageType:
    "AUDIO" | "DOCUMENT" | "IMAGE" | "INTERACTIVE" | "SYSTEM" | "TEXT" | "VIDEO";
  readonly phoneE164: string;
  readonly providerCreatedAt: string | null;
  readonly providerMessageId: string;
  readonly triggersTenantOptOut: boolean;
}

export interface DeliveryStatus {
  readonly occurredAt: string | null;
  readonly providerMessageId: string;
  readonly status: "DELIVERED" | "FAILED" | "READ" | "SENT";
}

export interface ParsedWebhookEffects {
  readonly inboundMessages: readonly InboundMessage[];
  readonly statuses: readonly DeliveryStatus[];
}
