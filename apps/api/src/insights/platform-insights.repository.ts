import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  AuditSummary,
  InsightPeriod,
  PlatformBusiness,
  PlatformPaymentSummary,
} from "@whatsapp-platform/contracts";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase } from "../database/database.types.js";
import type { InsightQuery } from "./insights.dto.js";
import {
  auditQuery,
  metricQuery,
  statusQuery,
  subscriptionQuery,
  reservedQuery,
  paymentQuery,
} from "./insights.queries.js";
import type { MetricCounts, QueryRow, SubscriptionProjection } from "./insights.types.js";

/** Platform-only aggregate/metadata projections. Never calls tenant-content repositories. */
@Injectable()
export class PlatformInsightsRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async metrics(period: InsightPeriod) {
    const counts = await this.database.execute<MetricCounts>(metricQuery(sql`true`, period));
    const statuses = await this.database.execute<{ status: string; count: number }>(
      statusQuery(sql`true`, period),
    );
    return {
      period,
      ...(counts.rows[0] ?? { contacts: 0, groups: 0, campaigns: 0, openConversations: 0 }),
      outboundStatuses: statuses.rows,
    };
  }
  async businesses(query: InsightQuery) {
    return (
      await this.database.execute<
        QueryRow<PlatformBusiness> & { at: string }
      >(sql`SELECT id,name,status,created_at::text AS at FROM app.tenants
      WHERE is_deleted=false AND (${query.cursor?.at ?? null}::timestamptz IS NULL OR (created_at,id)<(${query.cursor?.at ?? null}::timestamptz,${query.cursor?.id ?? null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${query.limit + 1}`)
    ).rows;
  }
  async businessExists(id: string) {
    return (
      (
        await this.database.execute(
          sql`SELECT id FROM app.tenants WHERE id=${id}::uuid AND is_deleted=false`,
        )
      ).rows.length === 1
    );
  }
  async usage(id: string, period: InsightPeriod) {
    const subscription = await this.database.execute<QueryRow<SubscriptionProjection>>(
      subscriptionQuery(id),
    );
    const reserved = await this.database.execute<{ total: string }>(reservedQuery(id, period));
    return { subscription: subscription.rows[0], reserved: Number(reserved.rows[0]?.total ?? 0) };
  }
  async payments(id: string, query: InsightQuery) {
    return (
      await this.database.execute<QueryRow<PlatformPaymentSummary>>(paymentQuery(id, query, true))
    ).rows;
  }
  async audit(query: InsightQuery) {
    return (
      await this.database.execute<QueryRow<AuditSummary>>(
        auditQuery(
          sql`(a.tenant_id IS NULL OR EXISTS(SELECT 1 FROM app.tenants t WHERE t.id=a.tenant_id AND t.is_deleted=false))
      AND (${query.tenantId}::uuid IS NULL OR a.tenant_id=${query.tenantId}::uuid)`,
          query,
        ),
      )
    ).rows;
  }
}
