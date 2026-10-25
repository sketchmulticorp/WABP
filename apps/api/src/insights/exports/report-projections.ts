import type {
  AuditSummary,
  DashboardSummary,
  InsightPage,
  PaymentSummary,
  PlatformOverview,
  UsageSummary,
} from "@whatsapp-platform/contracts";
import { exportTooLarge, type CsvReport } from "./report-csv.js";

export function dashboardCsv(data: DashboardSummary | PlatformOverview): CsvReport {
  const metrics: (readonly [string, number])[] = [
    ["contacts_current", data.contacts],
    ["groups_current", data.groups],
    ["campaigns_created_in_period", data.campaigns],
    ["open_conversations_current", data.openConversations],
    ...data.outboundStatuses.map(
      (row) => [`outbound_current_status_${row.status}`, row.count] as const,
    ),
  ];
  if ("tenantCount" in data)
    metrics.push(
      ["businesses_current", data.tenantCount],
      ["active_businesses_current", data.activeTenants],
      ["tenant_admins_current", data.tenantAdminCount],
    );
  return {
    headers: ["period_start_utc", "period_end_exclusive_utc", "metric", "count"],
    rows: metrics.map(([metric, count]) => [data.period.start, data.period.end, metric, count]),
  };
}
export function usageCsv(data: UsageSummary): CsvReport {
  const s = data.subscription;
  return {
    headers: [
      "period_start_utc",
      "period_end_exclusive_utc",
      "reserved_messages",
      "message_limit",
      "remaining_messages",
      "ambiguous_subscription",
      "plan_name",
      "plan_code",
      "plan_status",
      "subscription_status",
      "subscription_eligible",
      "subscription_starts_at",
      "subscription_ends_at",
    ],
    rows: [
      [
        data.period.start,
        data.period.end,
        data.reservedMessages,
        data.messageLimit,
        data.remainingMessages,
        data.ambiguousSubscription,
        s?.planName,
        s?.planCode,
        s?.planStatus,
        s?.status,
        s?.eligible,
        s?.startsAt,
        s?.endsAt,
      ],
    ],
  };
}
export function paymentsCsv(page: InsightPage<PaymentSummary>): CsvReport {
  if (page.nextCursor !== null) exportTooLarge();
  // Explicit mapping also strips platform-only operational notes.
  return {
    headers: ["payment_id", "amount_minor", "currency", "paid_at", "reference"],
    rows: page.items.map((p) => [p.id, p.amountMinor, p.currency, p.paidAt, p.reference]),
  };
}
export function auditCsv(page: InsightPage<AuditSummary>): CsvReport {
  if (page.nextCursor !== null) exportTooLarge();
  return {
    headers: [
      "audit_id",
      "at",
      "tenant_id",
      "actor_id",
      "actor_role",
      "action",
      "entity_type",
      "result",
      "request_id",
    ],
    rows: page.items.map((a) => [
      a.id,
      a.at,
      a.tenantId,
      a.actorId,
      a.actorRole,
      a.action,
      a.entityType,
      a.result,
      a.requestId,
    ]),
  };
}
