import type { SeedConfig } from "@whatsapp-platform/config/runtime";

import type { AppDatabaseTransaction } from "../database.types.js";

export interface SeedPlanRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly priceMinor: number;
  readonly currency: string | null;
  readonly validityDays: number | null;
  readonly limits: unknown;
  readonly featureFlags: unknown;
}

export interface SeedTenantRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly defaultTimezone: string;
  readonly defaultCountryCode: string | null;
}

export interface SeedRoleRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly name: string;
  readonly systemKey: string | null;
  readonly isSystem: boolean;
}

export interface SeedUserRecord {
  readonly id: string;
  readonly homeTenantId: string | null;
  readonly roleId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly status: string;
}

export interface SeedMembershipRecord {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly roleId: string | null;
}

export interface SeedSubscriptionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly planId: string;
  readonly status: string;
  readonly endsAt: string | null;
}

export interface SeedResult {
  readonly created: Readonly<{
    plan: boolean;
    tenant: boolean;
    superAdmin: boolean;
    tenantAdmin: boolean;
    tenantUser: boolean;
    subscription: boolean;
  }>;
  readonly permissionCount: number;
  readonly roleCount: number;
}

export interface SeedTransactionRunner {
  execute<TResult>(
    work: (transaction: AppDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export type ApprovedSeedConfig = SeedConfig;
