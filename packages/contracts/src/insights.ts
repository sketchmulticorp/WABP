/** Allowlisted operational projections; never contains customer communication content. */
export interface InsightPeriod {
  readonly start: string;
  readonly end: string;
}
export interface DashboardSummary {
  readonly period: InsightPeriod;
  readonly contacts: number;
  readonly groups: number;
  readonly campaigns: number;
  readonly openConversations: number;
  readonly outboundStatuses: readonly { readonly status: string; readonly count: number }[];
}
export interface UsageSummary {
  readonly period: InsightPeriod;
  readonly reservedMessages: number;
  readonly messageLimit: number | null;
  readonly remainingMessages: number | null;
  readonly ambiguousSubscription: boolean;
  readonly subscription: null | {
    readonly status: string;
    readonly startsAt: string;
    readonly endsAt: string | null;
    readonly eligible: boolean;
    readonly planName: string;
    readonly planCode: string;
    readonly planStatus: string;
  };
}
export interface PaymentSummary {
  readonly id: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly paidAt: string;
  readonly reference: string;
}
export interface InsightPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
export interface AuditSummary {
  readonly id: string;
  readonly at: string;
  readonly tenantId: string | null;
  readonly actorId: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly result: string;
  readonly requestId: string;
}
export interface PlatformOverview extends DashboardSummary {
  readonly tenantCount: number;
  readonly activeTenants: number;
  readonly tenantAdminCount: number;
}
export interface PlatformBusiness {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}
export interface PlatformPaymentSummary extends PaymentSummary {
  readonly note: string | null;
}
