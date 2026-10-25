/** Provider-neutral inputs; Meta Graph payloads must never escape the adapter. */
export interface WhatsAppProvider {
  disconnectAccount(input: DisconnectAccountInput): Promise<void>;
  sendText(input: SendTextInput): Promise<ProviderMessageResult>;
  sendTemplate(input: SendTemplateInput): Promise<ProviderMessageResult>;
  /** Capability is optional for alternate adapters; callers must fail closed when absent. */
  sendInteractive?(input: SendInteractiveInput): Promise<ProviderMessageResult>;
  syncAccount(input: SyncAccountInput): Promise<AccountSyncResult>;
  syncTemplates(input: SyncTemplatesInput): Promise<readonly ProviderTemplate[]>;
}
export interface SendTextInput {
  readonly accountId: string;
  readonly idempotencyKey: string;
  readonly recipient: string;
  readonly text: string;
  readonly phoneNumberId: string;
  readonly credentialReference: string;
}
export interface SendTemplateInput extends Omit<SendTextInput, "text"> {
  readonly name: string;
  readonly language: string;
  readonly components: readonly TemplateTextComponent[];
}
export interface InteractiveMessageContent {
  readonly kind: "BUTTONS" | "LIST";
  readonly text: string;
  readonly choices: readonly { readonly id: string; readonly title: string }[];
}
export interface SendInteractiveInput
  extends Omit<SendTextInput, "text">, InteractiveMessageContent {}
export interface TemplateTextComponent {
  readonly type: "body" | "header";
  readonly parameters: readonly {
    readonly type: "text";
    readonly text: string;
    readonly parameter_name?: string;
  }[];
}
export interface DisconnectAccountInput {
  readonly accountId: string;
  readonly credentialReference: string;
}
export interface SyncAccountInput {
  readonly accountId: string;
  readonly credentialReference: string;
  readonly phoneNumberId: string;
  readonly wabaId: string;
}
export interface SyncTemplatesInput {
  readonly accountId: string;
  readonly credentialReference: string;
  readonly wabaId: string;
}
export interface ProviderMessageResult {
  readonly providerMessageId: string;
  readonly acceptedAt: string;
}
export interface AccountSyncResult {
  readonly displayName: string | null;
  readonly displayPhone: string;
  readonly phoneNumberId: string;
  readonly qualityRating: string | null;
  readonly wabaId: string;
  readonly health: "CONNECTED" | "DEGRADED";
}
export interface ProviderTemplate {
  readonly category: string;
  readonly components: readonly Readonly<Record<string, unknown>>[];
  readonly lastUpdatedAt: string | null;
  readonly name: string;
  readonly language: string;
  readonly providerTemplateId: string;
  readonly rejectionReason: string | null;
  readonly status: "APPROVED" | "DISABLED" | "PAUSED" | "PENDING" | "REJECTED";
}
export type WhatsAppProviderErrorCode =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "CONFIGURATION"
  | "POLICY"
  | "RATE_LIMITED"
  | "TRANSIENT"
  | "VALIDATION"
  | "UNKNOWN";
