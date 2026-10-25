import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import {
  CurrentAuthorization,
  TenantContent,
  RequirePermissions,
} from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { TenantInsightsService } from "./tenant-insights.service.js";
import { PlatformInsightsService } from "./platform-insights.service.js";
import { parseInsightQuery } from "./insights.dto.js";

@Controller()
export class TenantInsightsController {
  constructor(private readonly service: TenantInsightsService) {}
  @Get("dashboard")
  @TenantContent("report.read")
  dashboard(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.dashboard(context);
  }
  @Get("usage")
  @TenantContent("plan.read")
  usage(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.usage(context);
  }
  @Get("billing/payments")
  @TenantContent("billing.read")
  payments(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.payments(context, parseInsightQuery(query, "page"));
  }
  @Get("audit-logs")
  @TenantContent("audit.read")
  audit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.audit(context, parseInsightQuery(query, "audit"));
  }
}
@Controller("platform/insights")
export class PlatformInsightsController {
  constructor(private readonly service: PlatformInsightsService) {}
  @Get("businesses")
  @RequirePermissions("tenant.read")
  businesses(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.businesses(context, parseInsightQuery(query, "page"));
  }
  @Get("businesses/:id/usage")
  @RequirePermissions("plan.read")
  usage(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.usage(context, id);
  }
  @Get("businesses/:id/payments")
  @RequirePermissions("billing.read")
  payments(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.payments(context, id, parseInsightQuery(query, "page"));
  }
  @Get("audit-logs")
  @RequirePermissions("audit.read")
  audit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.audit(context, parseInsightQuery(query, "audit", true));
  }
}
