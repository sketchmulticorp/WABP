import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, isNull } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseExecutor } from "../database/database.types.js";
import {
  auditLogsInApp,
  paymentRecordsInApp,
  plansInApp,
  rolesInApp,
  subscriptionsInApp,
  tenantsInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../database/schema/index.js";

@Injectable()
export class PlatformRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async dashboard() {
    const [tenant] = await this.database
      .select({ count: count() })
      .from(tenantsInApp)
      .where(eq(tenantsInApp.isDeleted, false));
    const [active] = await this.database
      .select({ count: count() })
      .from(tenantsInApp)
      .where(and(eq(tenantsInApp.isDeleted, false), eq(tenantsInApp.status, "ACTIVE")));
    const [admins] = await this.database
      .select({ count: count() })
      .from(usersInApp)
      .innerJoin(rolesInApp, eq(usersInApp.roleId, rolesInApp.id))
      .innerJoin(
        tenantsInApp,
        and(eq(tenantsInApp.id, usersInApp.homeTenantId), eq(tenantsInApp.isDeleted, false)),
      )
      .innerJoin(
        userTenantScopesInApp,
        and(
          eq(userTenantScopesInApp.userId, usersInApp.id),
          eq(userTenantScopesInApp.tenantId, tenantsInApp.id),
          eq(userTenantScopesInApp.roleId, rolesInApp.id),
          eq(userTenantScopesInApp.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(usersInApp.isDeleted, false),
          eq(rolesInApp.isDeleted, false),
          eq(usersInApp.status, "ACTIVE"),
          eq(rolesInApp.systemKey, "TENANT_ADMIN"),
        ),
      );
    return {
      activeTenants: active?.count ?? 0,
      tenantCount: tenant?.count ?? 0,
      tenantAdminCount: admins?.count ?? 0,
    };
  }

  listTenants() {
    return this.database
      .select({
        id: tenantsInApp.id,
        name: tenantsInApp.name,
        slug: tenantsInApp.slug,
        status: tenantsInApp.status,
        defaultTimezone: tenantsInApp.defaultTimezone,
        createdAt: tenantsInApp.createdAt,
      })
      .from(tenantsInApp)
      .where(eq(tenantsInApp.isDeleted, false))
      .orderBy(tenantsInApp.name);
  }

  async createTenant(
    executor: AppDatabaseExecutor,
    input: {
      readonly country: string | null;
      readonly timezone: string;
      readonly name: string;
      readonly slug: string;
    },
  ) {
    const [tenant] = await executor
      .insert(tenantsInApp)
      .values({
        name: input.name,
        slug: input.slug,
        status: "ACTIVE",
        defaultTimezone: input.timezone,
        defaultCountryCode: input.country,
      })
      .returning({
        id: tenantsInApp.id,
        name: tenantsInApp.name,
        slug: tenantsInApp.slug,
        status: tenantsInApp.status,
      });
    if (tenant === undefined) throw new Error("Tenant creation did not return a row.");
    return tenant;
  }

  async createTenantAdmin(
    executor: AppDatabaseExecutor,
    input: {
      readonly tenantId: string;
      readonly roleId: string;
      readonly adminEmail: string;
      readonly adminName: string;
      readonly passwordHash: string;
    },
  ) {
    const [user] = await executor
      .insert(usersInApp)
      .values({
        homeTenantId: input.tenantId,
        roleId: input.roleId,
        email: input.adminEmail,
        displayName: input.adminName,
        passwordHash: input.passwordHash,
        mustChangePassword: true,
        status: "ACTIVE",
      })
      .returning({
        id: usersInApp.id,
        email: usersInApp.email,
        displayName: usersInApp.displayName,
      });
    if (user === undefined) throw new Error("Tenant Admin creation did not return a row.");
    await executor
      .insert(userTenantScopesInApp)
      .values({ userId: user.id, tenantId: input.tenantId, roleId: input.roleId });
    return user;
  }

  async setTenantStatus(
    executor: AppDatabaseExecutor,
    tenantId: string,
    status: "ACTIVE" | "SUSPENDED",
  ) {
    const rows = await executor
      .update(tenantsInApp)
      .set({ status })
      .where(and(eq(tenantsInApp.id, tenantId), eq(tenantsInApp.isDeleted, false)))
      .returning({ id: tenantsInApp.id, name: tenantsInApp.name, status: tenantsInApp.status });
    return rows[0];
  }

  listPlans() {
    return this.database
      .select({
        id: plansInApp.id,
        code: plansInApp.code,
        name: plansInApp.name,
        status: plansInApp.status,
        priceMinor: plansInApp.priceMinor,
        currency: plansInApp.currency,
        validityDays: plansInApp.validityDays,
        limits: plansInApp.limits,
        featureFlags: plansInApp.featureFlags,
      })
      .from(plansInApp)
      .orderBy(plansInApp.code);
  }
  async createPlan(
    executor: AppDatabaseExecutor,
    input: {
      readonly code: string;
      readonly currency: string | null;
      readonly featureFlags: Readonly<Record<string, unknown>>;
      readonly limits: Readonly<Record<string, unknown>>;
      readonly name: string;
      readonly priceMinor: number;
      readonly validityDays: number | null;
    },
  ) {
    const rows = await executor
      .insert(plansInApp)
      .values({ ...input, status: "ACTIVE" })
      .returning({
        id: plansInApp.id,
        code: plansInApp.code,
        name: plansInApp.name,
        status: plansInApp.status,
      });
    return rows[0];
  }
  async replaceSubscription(
    executor: AppDatabaseExecutor,
    tenantId: string,
    input: {
      readonly endsAt: string | null;
      readonly planId: string;
      readonly startsAt: string;
      readonly status: string;
    },
  ) {
    await executor
      .update(subscriptionsInApp)
      .set({ status: "CANCELLED", endsAt: input.startsAt })
      .where(and(eq(subscriptionsInApp.tenantId, tenantId), isNull(subscriptionsInApp.endsAt)));
    const rows = await executor
      .insert(subscriptionsInApp)
      .values({ tenantId, ...input })
      .returning({
        id: subscriptionsInApp.id,
        planId: subscriptionsInApp.planId,
        status: subscriptionsInApp.status,
        startsAt: subscriptionsInApp.startsAt,
        endsAt: subscriptionsInApp.endsAt,
      });
    return rows[0];
  }
  async recordPayment(
    executor: AppDatabaseExecutor,
    tenantId: string,
    actorId: string,
    input: {
      readonly amountMinor: number;
      readonly currency: string;
      readonly note: string | null;
      readonly paidAt: string;
      readonly reference: string;
    },
  ) {
    const rows = await executor
      .insert(paymentRecordsInApp)
      .values({ tenantId, recordedBy: actorId, ...input })
      .returning({
        id: paymentRecordsInApp.id,
        amountMinor: paymentRecordsInApp.amountMinor,
        currency: paymentRecordsInApp.currency,
        paidAt: paymentRecordsInApp.paidAt,
        reference: paymentRecordsInApp.reference,
        note: paymentRecordsInApp.note,
        createdAt: paymentRecordsInApp.createdAt,
      });
    return rows[0];
  }
  async lockPaymentTenant(executor: AppDatabaseExecutor, tenantId: string) {
    const rows = await executor
      .select({ id: tenantsInApp.id })
      .from(tenantsInApp)
      .where(and(eq(tenantsInApp.id, tenantId), eq(tenantsInApp.isDeleted, false)))
      .for("update");
    return rows[0];
  }
  listPayments(tenantId: string) {
    return this.database
      .select({
        id: paymentRecordsInApp.id,
        amountMinor: paymentRecordsInApp.amountMinor,
        currency: paymentRecordsInApp.currency,
        paidAt: paymentRecordsInApp.paidAt,
        reference: paymentRecordsInApp.reference,
        note: paymentRecordsInApp.note,
        createdAt: paymentRecordsInApp.createdAt,
      })
      .from(paymentRecordsInApp)
      .where(eq(paymentRecordsInApp.tenantId, tenantId))
      .orderBy(desc(paymentRecordsInApp.paidAt));
  }
  async audit(
    executor: AppDatabaseExecutor,
    input: {
      readonly action: string;
      readonly actorId: string;
      readonly entityId: string;
      readonly entityType: string;
      readonly metadata: Readonly<Record<string, unknown>>;
      readonly requestId: string;
      readonly tenantId: string | null;
    },
  ) {
    await executor
      .insert(auditLogsInApp)
      .values({ ...input, actorRole: "SUPER_ADMIN", result: "SUCCESS" });
  }
}
