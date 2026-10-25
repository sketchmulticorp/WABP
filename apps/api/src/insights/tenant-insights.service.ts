import { Injectable } from "@nestjs/common";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { TenantScopeService, forbiddenError } from "../authorization/authorization.service.js";
import { TenantInsightsRepository } from "./tenant-insights.repository.js";
import type { InsightQuery } from "./insights.dto.js";
import { currentMonth, insightPage, usageSummary } from "./insights.presentation.js";

/** Read-only tenant use cases; permission checks do not depend on frontend navigation. */
@Injectable()
export class TenantInsightsService {
  constructor(
    private readonly repository: TenantInsightsRepository,
    private readonly scope: TenantScopeService,
  ) {}
  dashboard(context: AuthorizationContext) {
    return this.repository.dashboard(this.tenant(context, "report.read"), currentMonth());
  }
  async usage(context: AuthorizationContext) {
    const tenant = this.tenant(context, "plan.read"),
      period = currentMonth();
    return usageSummary(period, await this.repository.usage(tenant, period));
  }
  async payments(context: AuthorizationContext, query: InsightQuery) {
    const rows = await this.repository.payments(this.tenant(context, "billing.read"), query);
    return insightPage(rows, query.limit, (p) => ({ at: p.paidAt, id: p.id }));
  }
  async audit(context: AuthorizationContext, query: InsightQuery) {
    const rows = await this.repository.audit(this.tenant(context, "audit.read"), query);
    return insightPage(rows, query.limit, (a) => ({ at: a.at, id: a.id }));
  }
  private tenant(context: AuthorizationContext, permission: string) {
    const tenant = this.scope.requireTenantContext(context);
    if (!context.permissions.has(permission)) throw forbiddenError();
    return tenant;
  }
}
