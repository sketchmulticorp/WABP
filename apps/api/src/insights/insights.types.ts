import type { DashboardSummary } from "@whatsapp-platform/contracts";
export type MetricCounts = Pick<
  DashboardSummary,
  "contacts" | "groups" | "campaigns" | "openConversations"
>;
export interface SubscriptionProjection {
  status: string;
  startsAt: string;
  endsAt: string | null;
  planName: string;
  planCode: string;
  planStatus: string;
  eligible: boolean;
  eligibleCount: number;
  limits: Record<string, unknown>;
}
export type QueryRow<T> = { [K in keyof T]: T[K] };
