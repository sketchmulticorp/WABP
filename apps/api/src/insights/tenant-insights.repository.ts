import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  AuditSummary,
  DashboardSummary,
  InsightPeriod,
  PaymentSummary,
} from "@whatsapp-platform/contracts";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase } from "../database/database.types.js";
import type { TenantRepositoryContext } from "../authorization/authorization.types.js";
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

/** Tenant-owned reporting requires the existing non-platform repository context. */
@Injectable()
export class TenantInsightsRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async dashboard(
    context: TenantRepositoryContext,
    period: InsightPeriod,
  ): Promise<DashboardSummary> {
    const scope = sql`c.tenant_id=${context.tenantId}::uuid`;
    const counts = await this.database.execute<MetricCounts>(metricQuery(scope, period));
    const statuses = await this.database.execute<{ status: string; count: number }>(
      statusQuery(scope, period),
    );
    return {
      period,
      ...(counts.rows[0] ?? { contacts: 0, groups: 0, campaigns: 0, openConversations: 0 }),
      outboundStatuses: statuses.rows,
    };
  }
  async usage(context: TenantRepositoryContext, period: InsightPeriod) {
    const subscription = await this.database.execute<QueryRow<SubscriptionProjection>>(
      subscriptionQuery(context.tenantId),
    );
    const reserved = await this.database.execute<{ total: string }>(
      reservedQuery(context.tenantId, period),
    );
    return { subscription: subscription.rows[0], reserved: Number(reserved.rows[0]?.total ?? 0) };
  }
  async payments(context: TenantRepositoryContext, query: InsightQuery) {
    return (
      await this.database.execute<QueryRow<PaymentSummary>>(
        paymentQuery(context.tenantId, query, false),
      )
    ).rows;
  }
  async audit(context: TenantRepositoryContext, query: InsightQuery) {
    return (
      await this.database.execute<QueryRow<AuditSummary>>(
        auditQuery(
          sql`a.tenant_id=${context.tenantId}::uuid AND EXISTS
      (SELECT 1 FROM app.tenants t WHERE t.id=a.tenant_id AND t.is_deleted=false)`,
          query,
        ),
      )
    ).rows;
  }
}
