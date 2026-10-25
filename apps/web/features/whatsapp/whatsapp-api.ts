import { request } from "../workspace/api-client";
import type { WhatsAppOnboardingState, WhatsAppSignupAttempt } from "@whatsapp-platform/contracts";

/** Existing browser-safe account projection; credentials never belong in this contract. */
export interface WhatsAppAccount {
  readonly id: string;
  readonly businessId: string | null;
  readonly displayName: string | null;
  readonly displayPhone: string;
  readonly status: string;
  readonly isDefault: boolean;
  readonly phoneNumberId: string;
  readonly wabaId: string;
  readonly lastSyncedAt: string | null;
  readonly health: unknown;
}
export interface DevelopmentAssetInput {
  readonly business_id: string | null;
  readonly display_name: string | null;
  readonly display_phone: string;
  readonly phone_number_id: string;
  readonly waba_id: string;
}
export const whatsappApi = {
  startSignup: () =>
    request<WhatsAppSignupAttempt>("/whatsapp/onboarding/start", { method: "POST" }),
  completeSignup: (input: {
    attemptId: string;
    nonce: string;
    code: string;
    wabaId: string;
    phoneNumberId: string;
  }) =>
    request<{ accountId: string; connected: boolean; messagingActivationPerformed: false }>(
      "/whatsapp/onboarding/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  onboarding: (signal: AbortSignal) =>
    request<WhatsAppOnboardingState>("/whatsapp/onboarding", { signal }),
  list: (signal: AbortSignal) =>
    request<readonly WhatsAppAccount[]>("/whatsapp/accounts", { signal }),
  connect: (input: DevelopmentAssetInput) =>
    request<unknown>("/whatsapp/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, secret_ref: "env://META_DEVELOPMENT_ACCESS_TOKEN" }),
    }),
  sync: (id: string) => request<unknown>(`/whatsapp/accounts/${id}/sync`, { method: "POST" }),
  disconnect: (id: string) =>
    request<{ disconnected: boolean; id: string }>(`/whatsapp/accounts/${id}`, {
      method: "DELETE",
    }),
};

/** Only documented safe health fields are displayed; never stringify an arbitrary provider object. */
export function accountHealth(account: WhatsAppAccount) {
  const health =
    typeof account.health === "object" && account.health !== null
      ? (account.health as Record<string, unknown>)
      : {};
  return {
    quality: typeof health.quality_rating === "string" ? health.quality_rating : "Not reported",
    manual: health.source === "development_manual_connection",
  };
}
