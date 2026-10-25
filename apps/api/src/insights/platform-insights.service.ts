import { Injectable } from "@nestjs/common";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { forbiddenError } from "../authorization/authorization.service.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { PlatformRepository } from "../platform/platform.repository.js";
import { PlatformInsightsRepository } from "./platform-insights.repository.js";
import type { InsightQuery } from "./insights.dto.js";
import { currentMonth, insightPage, usageSummary } from "./insights.presentation.js";

/** Platform metadata only. Never converts a platform principal into tenant content scope. */
@Injectable()
export class PlatformInsightsService {
  constructor(
    private readonly repository: PlatformInsightsRepository,
    private readonly platform: PlatformRepository,
  ) {}
  async dashboard(context: AuthorizationContext) {
    this.require(context, "platform.dashboard.read");
    return {
      ...(await this.platform.dashboard()),
      ...(await this.repository.metrics(currentMonth())),
    };
  }
  async businesses(context: AuthorizationContext, query: InsightQuery) {
    this.require(context, "tenant.read");
    const rows = await this.repository.businesses(query),
      page = insightPage(rows, query.limit, (item) => ({ at: item.at, id: item.id }));
    return { ...page, items: page.items.map(({ id, name, status }) => ({ id, name, status })) };
  }
  async usage(context: AuthorizationContext, id: string) {
    this.require(context, "plan.read");
    await this.business(id);
    const period = currentMonth();
    return usageSummary(period, await this.repository.usage(id, period));
  }
  async payments(context: AuthorizationContext, id: string, query: InsightQuery) {
    this.require(context, "billing.read");
    await this.business(id);
    return insightPage(await this.repository.payments(id, query), query.limit, (p) => ({
      at: p.paidAt,
      id: p.id,
    }));
  }
  async audit(context: AuthorizationContext, query: InsightQuery) {
    this.require(context, "audit.read");
    return insightPage(await this.repository.audit(query), query.limit, (a) => ({
      at: a.at,
      id: a.id,
    }));
  }
  private require(context: AuthorizationContext, permission: string) {
    if (
      context.roleSystemKey !== "SUPER_ADMIN" ||
      !context.isPlatformActor ||
      context.tenantId !== null ||
      !context.permissions.has(permission)
    )
      throw forbiddenError();
  }
  private async business(id: string) {
    if (!(await this.repository.businessExists(id)))
      throw new ApplicationError({
        code: "TENANT_NOT_FOUND",
        message: "The business was not found.",
        statusCode: 404,
      });
  }
}
