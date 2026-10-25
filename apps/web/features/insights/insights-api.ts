import type {
  AuditSummary,
  DashboardSummary,
  InsightPage,
  UsageSummary,
  PaymentSummary,
  PlatformBusiness,
  PlatformOverview,
  PlatformPaymentSummary,
} from "@whatsapp-platform/contracts";
import { request } from "../workspace/api-client";

export const insightsApi = {
  dashboard: (signal: AbortSignal) => request<DashboardSummary>("/dashboard", { signal }),
  // All generic reads still go through the shared auth/session-generation client.
  read: <T>(path: string, signal: AbortSignal) => request<T>(path, { signal }),
  recordPayment: (
    tenantId: string,
    input: {
      amount_minor: number;
      currency: string;
      paid_at: string;
      reference: string;
      note: string | null;
    },
  ) =>
    request<PlatformPaymentSummary>(`/platform/tenants/${encodeURIComponent(tenantId)}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
export type UsageRead = UsageSummary;
export type PaymentRead = InsightPage<PaymentSummary | PlatformPaymentSummary>;
export type AuditRead = InsightPage<AuditSummary>;
export type BusinessRead = InsightPage<PlatformBusiness>;
export type PlatformRead = PlatformOverview;
