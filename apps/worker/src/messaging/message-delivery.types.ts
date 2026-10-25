export interface DeliverySnapshot {
  readonly id: string;
  readonly tenant_id: string;
  readonly status: string;
  readonly message_type: string;
  readonly campaign_id: string | null;
  readonly provider_message_id: string | null;
  readonly content: Record<string, unknown>;
  readonly policy_decision: Record<string, unknown>;
  readonly tenant_status: string | null;
  readonly phone_e164: string | null;
  readonly consent_status: string | null;
  readonly window_expires_at: string | null;
  readonly account_status: string;
  readonly credential_status: string | null;
  readonly secret_ref: string | null;
  readonly whatsapp_account_id: string;
  readonly phone_number_id: string;
  readonly subscription_status: string | null;
  readonly plan_status: string | null;
  readonly template: Record<string, unknown> | null;
  readonly campaign?: Record<string, unknown> | null;
  readonly automation?: Record<string, unknown> | null;
}
export interface DeliveryFailure {
  readonly code: string;
  readonly retryable: boolean;
  readonly exhausted: boolean;
}
