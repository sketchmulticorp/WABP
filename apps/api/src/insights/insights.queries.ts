import { sql, type SQL } from "drizzle-orm";
import type { InsightPeriod } from "@whatsapp-platform/contracts";
import type { InsightQuery } from "./insights.dto.js";

/** Persistence-only read fragments. Platform callers supply their own aggregate scope. */
export function metricQuery(scope: SQL, period: InsightPeriod) {
  return sql`SELECT
    (SELECT count(*)::int FROM app.contacts c JOIN app.tenants t ON t.id=c.tenant_id AND t.is_deleted=false WHERE c.is_deleted=false AND ${scope}) AS contacts,
    (SELECT count(*)::int FROM app.contact_groups c JOIN app.tenants t ON t.id=c.tenant_id AND t.is_deleted=false WHERE c.is_deleted=false AND ${scope}) AS groups,
    (SELECT count(*)::int FROM app.campaigns c JOIN app.tenants t ON t.id=c.tenant_id AND t.is_deleted=false WHERE c.is_deleted=false AND ${scope}
      AND c.created_at>=${period.start}::timestamptz AND c.created_at<${period.end}::timestamptz) AS campaigns,
    (SELECT count(*)::int FROM app.conversations c JOIN app.tenants t ON t.id=c.tenant_id AND t.is_deleted=false
      JOIN app.contacts ct ON ct.id=c.contact_id AND ct.tenant_id=c.tenant_id AND ct.is_deleted=false WHERE c.status IN ('OPEN','PENDING') AND ${scope}) AS "openConversations"`;
}
export function statusQuery(scope: SQL, period: InsightPeriod) {
  return sql`SELECT c.status,count(*)::int AS count FROM app.messages c JOIN app.tenants t ON t.id=c.tenant_id AND t.is_deleted=false
    WHERE c.direction='OUTBOUND' AND ${scope} AND c.created_at>=${period.start}::timestamptz AND c.created_at<${period.end}::timestamptz
    GROUP BY c.status ORDER BY c.status`;
}
export function subscriptionQuery(tenantId: string) {
  return sql`SELECT s.status,s.starts_at::text AS "startsAt",s.ends_at::text AS "endsAt",p.name AS "planName",p.code AS "planCode",p.status AS "planStatus",p.limits,
    (t.status='ACTIVE' AND s.status IN ('ACTIVE','TRIAL') AND p.status='ACTIVE' AND s.starts_at<=now() AND (s.ends_at IS NULL OR s.ends_at>now())) AS eligible,
    count(*) FILTER(WHERE s.status IN ('ACTIVE','TRIAL') AND p.status='ACTIVE' AND s.starts_at<=now() AND (s.ends_at IS NULL OR s.ends_at>now())) OVER()::int AS "eligibleCount"
    FROM app.subscriptions s JOIN app.plans p ON p.id=s.plan_id JOIN app.tenants t ON t.id=s.tenant_id AND t.is_deleted=false
    WHERE s.tenant_id=${tenantId}::uuid ORDER BY eligible DESC,s.starts_at DESC,s.id DESC LIMIT 1`;
}
export function reservedQuery(tenantId: string, period: InsightPeriod) {
  return sql`SELECT coalesce(sum(u.quantity),0)::text AS total FROM app.usage_events u
    JOIN app.tenants t ON t.id=u.tenant_id AND t.is_deleted=false WHERE u.tenant_id=${tenantId}::uuid AND u.event_type='OUTBOUND_MESSAGE_RESERVED'
    AND u.occurred_at>=${period.start}::timestamptz AND u.occurred_at<${period.end}::timestamptz`;
}
export function paymentQuery(tenantId: string, query: InsightQuery, platform: boolean) {
  return sql`SELECT p.id,p.amount_minor::text AS "amountMinor",p.currency,p.paid_at::text AS "paidAt",p.reference
    ${platform ? sql`,p.note` : sql``} FROM app.payment_records p JOIN app.tenants t ON t.id=p.tenant_id AND t.is_deleted=false
    WHERE p.tenant_id=${tenantId}::uuid AND (${query.cursor?.at ?? null}::timestamptz IS NULL OR (p.paid_at,p.id)<(${query.cursor?.at ?? null}::timestamptz,${query.cursor?.id ?? null}::uuid))
    ORDER BY p.paid_at DESC,p.id DESC LIMIT ${query.limit + 1}`;
}
export function auditQuery(scope: SQL, query: InsightQuery) {
  // Deliberately no metadata/before/after, email, IP, user-agent, resource names or content joins.
  return sql`SELECT a.id,a.created_at::text AS at,a.tenant_id AS "tenantId",a.actor_id AS "actorId",a.actor_role AS "actorRole",a.action,
    a.entity_type AS "entityType",a.result,a.request_id AS "requestId" FROM app.audit_logs a
    WHERE ${scope} AND a.created_at>=${query.from}::timestamptz AND a.created_at<${query.to}::timestamptz
    AND (${query.action}::text IS NULL OR a.action=${query.action}) AND (${query.actorId}::uuid IS NULL OR a.actor_id=${query.actorId}::uuid)
    AND (${query.result}::text IS NULL OR a.result=${query.result})
    AND (${query.cursor?.at ?? null}::timestamptz IS NULL OR (a.created_at,a.id)<(${query.cursor?.at ?? null}::timestamptz,${query.cursor?.id ?? null}::uuid))
    ORDER BY a.created_at DESC,a.id DESC LIMIT ${query.limit + 1}`;
}
