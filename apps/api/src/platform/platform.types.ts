export type PlatformTenantStatus = "ACTIVE" | "SUSPENDED";
export type PlatformSubscriptionStatus =
  "ACTIVE" | "CANCELLED" | "EXPIRED" | "PAST_DUE" | "SUSPENDED" | "TRIAL";

export interface CreatePlatformTenantInput {
  readonly adminDisplayName: string;
  readonly adminEmail: string;
  readonly adminTemporaryPassword: string;
  readonly defaultCountryCode: string | null;
  readonly defaultTimezone: string;
  readonly name: string;
  readonly slug: string;
}

export interface CreatePlanInput {
  readonly code: string;
  readonly currency: string | null;
  readonly featureFlags: Readonly<Record<string, unknown>>;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly priceMinor: number;
  readonly validityDays: number | null;
}

export interface ChangeSubscriptionInput {
  readonly endsAt: string | null;
  readonly planId: string;
  readonly startsAt: string;
  readonly status: PlatformSubscriptionStatus;
}

export interface RecordPaymentInput {
  readonly amountMinor: number;
  readonly currency: string;
  readonly note: string | null;
  readonly paidAt: string;
  readonly reference: string;
}
