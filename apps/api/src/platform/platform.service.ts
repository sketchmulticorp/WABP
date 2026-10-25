import { ConflictException, HttpStatus, Injectable } from "@nestjs/common";
import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { PlatformRepository } from "./platform.repository.js";
import { PlatformInsightsService } from "../insights/platform-insights.service.js";
import { TenantRoleProvisioningService } from "../authorization/tenant-role-provisioning.service.js";
import type {
  ChangeSubscriptionInput,
  CreatePlanInput,
  CreatePlatformTenantInput,
  PlatformTenantStatus,
  RecordPaymentInput,
} from "./platform.types.js";

@Injectable()
export class PlatformService {
  constructor(
    private readonly repository: PlatformRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly passwordHasher: Argon2idPasswordHasher,
    private readonly insights: PlatformInsightsService,
    private readonly tenantRoles: TenantRoleProvisioningService,
  ) {}
  dashboard(context: AuthorizationContext) {
    requirePlatform(context);
    return this.insights.dashboard(context);
  }
  listTenants(context: AuthorizationContext) {
    requirePlatform(context);
    return this.repository.listTenants();
  }
  listPlans(context: AuthorizationContext) {
    requirePlatform(context);
    return this.repository.listPlans();
  }
  listPayments(context: AuthorizationContext, tenantId: string) {
    requirePlatform(context);
    return this.repository.listPayments(tenantId);
  }
  async createTenant(context: AuthorizationContext, input: CreatePlatformTenantInput) {
    requirePlatform(context);
    const passwordHash = await this.passwordHasher.hash(input.adminTemporaryPassword);
    try {
      return await this.transactions.execute(async (tx) => {
        const tenant = await this.repository.createTenant(tx, {
          country: input.defaultCountryCode,
          timezone: input.defaultTimezone,
          name: input.name,
          slug: input.slug,
        });
        const roles = await this.tenantRoles.provisionForNewTenant(tx, tenant.id);
        const admin = await this.repository.createTenantAdmin(tx, {
          tenantId: tenant.id,
          roleId: roles.admin.id,
          adminEmail: input.adminEmail,
          adminName: input.adminDisplayName,
          passwordHash,
        });
        await this.repository.audit(tx, {
          action: "PLATFORM_TENANT_CREATED",
          actorId: context.actorId,
          entityId: tenant.id,
          entityType: "tenant",
          metadata: { admin_user_id: admin.id },
          requestId: context.requestId,
          tenantId: tenant.id,
        });
        return { admin, tenant };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("A tenant or user with that identifier already exists.");
      throw error;
    }
  }
  async changeTenantStatus(
    context: AuthorizationContext,
    tenantId: string,
    status: PlatformTenantStatus,
  ) {
    requirePlatform(context);
    return this.transactions.execute(async (tx) => {
      const tenant = await this.repository.setTenantStatus(tx, tenantId, status);
      if (tenant === undefined) throw notFound("TENANT_NOT_FOUND", "The tenant was not found.");
      await this.repository.audit(tx, {
        action: `PLATFORM_TENANT_${status}`,
        actorId: context.actorId,
        entityId: tenantId,
        entityType: "tenant",
        metadata: {},
        requestId: context.requestId,
        tenantId,
      });
      return tenant;
    });
  }
  async createPlan(context: AuthorizationContext, input: CreatePlanInput) {
    requirePlatform(context);
    try {
      return await this.transactions.execute(async (tx) => {
        const plan = await this.repository.createPlan(tx, input);
        if (plan === undefined) throw new Error("Plan creation did not return a row.");
        await this.repository.audit(tx, {
          action: "PLAN_CREATED",
          actorId: context.actorId,
          entityId: plan.id,
          entityType: "plan",
          metadata: { code: plan.code },
          requestId: context.requestId,
          tenantId: null,
        });
        return plan;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("A plan with that code already exists.");
      throw error;
    }
  }
  async changeSubscription(
    context: AuthorizationContext,
    tenantId: string,
    input: ChangeSubscriptionInput,
  ) {
    requirePlatform(context);
    return this.transactions.execute(async (tx) => {
      const subscription = await this.repository.replaceSubscription(tx, tenantId, input);
      if (subscription === undefined)
        throw new Error("Subscription creation did not return a row.");
      await this.repository.audit(tx, {
        action: "SUBSCRIPTION_CHANGED",
        actorId: context.actorId,
        entityId: subscription.id,
        entityType: "subscription",
        metadata: { plan_id: input.planId, status: input.status },
        requestId: context.requestId,
        tenantId,
      });
      return subscription;
    });
  }
  async recordPayment(context: AuthorizationContext, tenantId: string, input: RecordPaymentInput) {
    requirePlatform(context);
    try {
      return await this.transactions.execute(async (tx) => {
        if ((await this.repository.lockPaymentTenant(tx, tenantId)) === undefined)
          throw notFound("TENANT_NOT_FOUND", "The tenant was not found.");
        const payment = await this.repository.recordPayment(tx, tenantId, context.actorId, input);
        if (payment === undefined) throw new Error("Payment creation did not return a row.");
        await this.repository.audit(tx, {
          action: "MANUAL_PAYMENT_RECORDED",
          actorId: context.actorId,
          entityId: payment.id,
          entityType: "payment_record",
          metadata: {
            amount_minor: input.amountMinor,
            currency: input.currency,
            reference: input.reference,
          },
          requestId: context.requestId,
          tenantId,
        });
        return payment;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("That payment reference already exists for this tenant.");
      throw error;
    }
  }
}
function isUniqueViolation(error: unknown) {
  // Drizzle wraps the PostgreSQL error. Inspect only bounded Error causes, never SQL/params.
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      current.code === "23505"
    )
      return true;
    if (!(current instanceof Error)) return false;
    current = current.cause;
  }
  return false;
}
function notFound(code: string, message: string) {
  return new ApplicationError({ code, message, statusCode: HttpStatus.NOT_FOUND });
}
function requirePlatform(context: AuthorizationContext): void {
  if (!context.isPlatformActor)
    throw new ApplicationError({
      code: "FORBIDDEN",
      message: "Platform access is required.",
      statusCode: HttpStatus.FORBIDDEN,
    });
}
