export interface CurrentUserRecord {
  readonly defaultCountryCode: string | null;
  readonly defaultTimezone: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly roleName: string;
  readonly roleSystemKey: string | null;
  readonly tenantId: string | null;
  readonly tenantName: string | null;
  readonly tenantSlug: string | null;
  readonly userId: string;
}

export interface SubscriptionRecord {
  readonly endsAt: string | null;
  readonly featureFlags: unknown;
  readonly limits: unknown;
  readonly planCode: string;
  readonly planName: string;
  readonly startsAt: string;
  readonly status: string;
}

export interface SessionRecord {
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly ipAddress: string | null;
  readonly tokenFamilyId: string;
  readonly userAgent: string | null;
}
