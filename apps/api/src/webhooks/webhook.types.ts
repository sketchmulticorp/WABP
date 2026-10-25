export interface MetaWebhookConfig {
  readonly appSecret: string | undefined;
  readonly verifyToken: string | undefined;
}

export interface PersistedWebhookEvent {
  readonly id: string;
  readonly receivedAt: string;
}

export interface WebhookPersistResult {
  readonly event: PersistedWebhookEvent | null;
  readonly isDuplicate: boolean;
}
