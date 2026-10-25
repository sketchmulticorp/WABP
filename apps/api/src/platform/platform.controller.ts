import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";

import {
  CurrentAuthorization,
  RequirePermissions,
} from "../authorization/authorization.decorators.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import {
  parseCreateTenantInput,
  parsePaymentInput,
  parsePlanInput,
  parseSubscriptionInput,
  parseTenantStatus,
} from "./platform.dto.js";
import { PlatformService } from "./platform.service.js";

/** HTTP-only platform administration routes. Tenant content is never queried here. */
@Controller("platform")
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @Get("dashboard") @RequirePermissions("platform.dashboard.read") dashboard(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.service.dashboard(context);
  }
  @Get("tenants") @RequirePermissions("tenant.read") listTenants(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.service.listTenants(context);
  }
  @Post("tenants") @RequirePermissions("tenant.manage") createTenant(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() body: unknown,
  ) {
    return this.service.createTenant(context, parseCreateTenantInput(body));
  }
  @Patch("tenants/:tenantId/status") @RequirePermissions("tenant.suspend") changeTenantStatus(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("tenantId", new ParseUUIDPipe({ version: "4" })) tenantId: string,
    @Body() body: unknown,
  ) {
    return this.service.changeTenantStatus(context, tenantId, parseTenantStatus(body));
  }
  @Get("plans") @RequirePermissions("plan.read") listPlans(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.service.listPlans(context);
  }
  @Post("plans") @RequirePermissions("plan.manage") createPlan(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() body: unknown,
  ) {
    return this.service.createPlan(context, parsePlanInput(body));
  }
  @Post("tenants/:tenantId/subscription") @RequirePermissions("plan.manage") changeSubscription(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("tenantId", new ParseUUIDPipe({ version: "4" })) tenantId: string,
    @Body() body: unknown,
  ) {
    return this.service.changeSubscription(context, tenantId, parseSubscriptionInput(body));
  }
  @Get("tenants/:tenantId/payments") @RequirePermissions("billing.read") listPayments(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("tenantId", new ParseUUIDPipe({ version: "4" })) tenantId: string,
  ) {
    return this.service.listPayments(context, tenantId);
  }
  @Post("tenants/:tenantId/payments")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions("plan.manage", "billing.read")
  recordPayment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param("tenantId", new ParseUUIDPipe({ version: "4" })) tenantId: string,
    @Body() body: unknown,
  ) {
    return this.service.recordPayment(context, tenantId, parsePaymentInput(body));
  }
}
