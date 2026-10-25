import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabaseTransaction } from "../database.types.js";
import {
  auditLogsInApp,
  permissionsInApp,
  plansInApp,
  rolePermissionsInApp,
  rolesInApp,
  subscriptionsInApp,
  tenantsInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../schema/index.js";
import type {
  SeedMembershipRecord,
  SeedPlanRecord,
  SeedRoleRecord,
  SeedSubscriptionRecord,
  SeedTenantRecord,
  SeedUserRecord,
} from "./seed.types.js";

const SEED_LOCK_KEY = "whatsapp-saas:database-seed:v1";

/** Shared catalog/identity persistence; seed and tenant-provisioning services own policy. */
export class SeedRepository {
  async acquireTransactionLock(transaction: AppDatabaseTransaction): Promise<void> {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${SEED_LOCK_KEY}))`);
  }

  async findPlanByCode(
    transaction: AppDatabaseTransaction,
    code: string,
  ): Promise<SeedPlanRecord | undefined> {
    const rows = await transaction
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
      .where(eq(plansInApp.code, code))
      .limit(1);

    return rows[0];
  }

  async createPlan(
    transaction: AppDatabaseTransaction,
    input: Omit<SeedPlanRecord, "id">,
  ): Promise<SeedPlanRecord> {
    const rows = await transaction.insert(plansInApp).values(input).returning({
      id: plansInApp.id,
      code: plansInApp.code,
      name: plansInApp.name,
      status: plansInApp.status,
      priceMinor: plansInApp.priceMinor,
      currency: plansInApp.currency,
      validityDays: plansInApp.validityDays,
      limits: plansInApp.limits,
      featureFlags: plansInApp.featureFlags,
    });

    return requireInserted(rows[0], "plan");
  }

  async findActiveTenantBySlug(
    transaction: AppDatabaseTransaction,
    slug: string,
  ): Promise<SeedTenantRecord | undefined> {
    const rows = await transaction
      .select({
        id: tenantsInApp.id,
        name: tenantsInApp.name,
        slug: tenantsInApp.slug,
        status: tenantsInApp.status,
        defaultTimezone: tenantsInApp.defaultTimezone,
        defaultCountryCode: tenantsInApp.defaultCountryCode,
      })
      .from(tenantsInApp)
      .where(and(eq(tenantsInApp.slug, slug), eq(tenantsInApp.isDeleted, false)))
      .limit(1);

    return rows[0];
  }

  async createTenant(
    transaction: AppDatabaseTransaction,
    input: Omit<SeedTenantRecord, "id">,
  ): Promise<SeedTenantRecord> {
    const rows = await transaction.insert(tenantsInApp).values(input).returning({
      id: tenantsInApp.id,
      name: tenantsInApp.name,
      slug: tenantsInApp.slug,
      status: tenantsInApp.status,
      defaultTimezone: tenantsInApp.defaultTimezone,
      defaultCountryCode: tenantsInApp.defaultCountryCode,
    });

    return requireInserted(rows[0], "tenant");
  }

  async findActiveRoleBySystemKey(
    transaction: AppDatabaseTransaction,
    systemKey: string,
    tenantId: string | null,
  ): Promise<SeedRoleRecord | undefined> {
    const tenantPredicate =
      tenantId === null ? isNull(rolesInApp.tenantId) : eq(rolesInApp.tenantId, tenantId);
    const rows = await transaction
      .select({
        id: rolesInApp.id,
        tenantId: rolesInApp.tenantId,
        name: rolesInApp.name,
        systemKey: rolesInApp.systemKey,
        isSystem: rolesInApp.isSystem,
      })
      .from(rolesInApp)
      .where(
        and(eq(rolesInApp.systemKey, systemKey), tenantPredicate, eq(rolesInApp.isDeleted, false)),
      )
      .limit(1);

    return rows[0];
  }

  async createRole(
    transaction: AppDatabaseTransaction,
    input: Omit<SeedRoleRecord, "id">,
  ): Promise<SeedRoleRecord> {
    const rows = await transaction.insert(rolesInApp).values(input).returning({
      id: rolesInApp.id,
      tenantId: rolesInApp.tenantId,
      name: rolesInApp.name,
      systemKey: rolesInApp.systemKey,
      isSystem: rolesInApp.isSystem,
    });

    return requireInserted(rows[0], "role");
  }

  async upsertPermissions(
    transaction: AppDatabaseTransaction,
    permissions: readonly (readonly [key: string, description: string])[],
  ): Promise<ReadonlyMap<string, string>> {
    const rows = await transaction
      .insert(permissionsInApp)
      .values(permissions.map(([permissionKey, description]) => ({ permissionKey, description })))
      .onConflictDoUpdate({
        target: permissionsInApp.permissionKey,
        set: { description: sql`excluded.description` },
      })
      .returning({ id: permissionsInApp.id, permissionKey: permissionsInApp.permissionKey });

    return new Map(rows.map((row) => [row.permissionKey, row.id]));
  }

  async replaceRolePermissions(
    transaction: AppDatabaseTransaction,
    roleId: string,
    permissionIds: readonly string[],
  ): Promise<void> {
    await transaction.delete(rolePermissionsInApp).where(eq(rolePermissionsInApp.roleId, roleId));
    if (permissionIds.length === 0) {
      return;
    }

    await transaction
      .insert(rolePermissionsInApp)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId })));
  }

  async findActiveUserByEmail(
    transaction: AppDatabaseTransaction,
    email: string,
  ): Promise<SeedUserRecord | undefined> {
    const rows = await transaction
      .select({
        id: usersInApp.id,
        homeTenantId: usersInApp.homeTenantId,
        roleId: usersInApp.roleId,
        email: usersInApp.email,
        passwordHash: usersInApp.passwordHash,
        displayName: usersInApp.displayName,
        status: usersInApp.status,
      })
      .from(usersInApp)
      .where(
        and(sql`lower(${usersInApp.email}) = lower(${email})`, eq(usersInApp.isDeleted, false)),
      )
      .limit(1);

    return rows[0];
  }

  async createUser(
    transaction: AppDatabaseTransaction,
    input: Omit<SeedUserRecord, "id">,
  ): Promise<SeedUserRecord> {
    const rows = await transaction
      .insert(usersInApp)
      .values({ ...input, mustChangePassword: input.homeTenantId !== null })
      .returning({
        id: usersInApp.id,
        homeTenantId: usersInApp.homeTenantId,
        roleId: usersInApp.roleId,
        email: usersInApp.email,
        passwordHash: usersInApp.passwordHash,
        displayName: usersInApp.displayName,
        status: usersInApp.status,
      });

    return requireInserted(rows[0], "user");
  }

  async findActiveMembershipByUserId(
    transaction: AppDatabaseTransaction,
    userId: string,
  ): Promise<SeedMembershipRecord | undefined> {
    const rows = await transaction
      .select({
        id: userTenantScopesInApp.id,
        userId: userTenantScopesInApp.userId,
        tenantId: userTenantScopesInApp.tenantId,
        roleId: userTenantScopesInApp.roleId,
      })
      .from(userTenantScopesInApp)
      .where(
        and(eq(userTenantScopesInApp.userId, userId), eq(userTenantScopesInApp.isDeleted, false)),
      )
      .limit(1);

    return rows[0];
  }

  async createMembership(
    transaction: AppDatabaseTransaction,
    input: Omit<SeedMembershipRecord, "id">,
  ): Promise<SeedMembershipRecord> {
    const rows = await transaction.insert(userTenantScopesInApp).values(input).returning({
      id: userTenantScopesInApp.id,
      userId: userTenantScopesInApp.userId,
      tenantId: userTenantScopesInApp.tenantId,
      roleId: userTenantScopesInApp.roleId,
    });

    return requireInserted(rows[0], "tenant membership");
  }

  async findOpenSubscriptions(
    transaction: AppDatabaseTransaction,
    tenantId: string,
  ): Promise<readonly SeedSubscriptionRecord[]> {
    return transaction
      .select({
        id: subscriptionsInApp.id,
        tenantId: subscriptionsInApp.tenantId,
        planId: subscriptionsInApp.planId,
        status: subscriptionsInApp.status,
        endsAt: subscriptionsInApp.endsAt,
      })
      .from(subscriptionsInApp)
      .where(and(eq(subscriptionsInApp.tenantId, tenantId), isNull(subscriptionsInApp.endsAt)));
  }

  async createSubscription(
    transaction: AppDatabaseTransaction,
    input: {
      readonly tenantId: string;
      readonly planId: string;
      readonly status: string;
      readonly startsAt: string;
    },
  ): Promise<SeedSubscriptionRecord> {
    const rows = await transaction.insert(subscriptionsInApp).values(input).returning({
      id: subscriptionsInApp.id,
      tenantId: subscriptionsInApp.tenantId,
      planId: subscriptionsInApp.planId,
      status: subscriptionsInApp.status,
      endsAt: subscriptionsInApp.endsAt,
    });

    return requireInserted(rows[0], "subscription");
  }

  async recordSeedAuditOnce(
    transaction: AppDatabaseTransaction,
    requestId: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const existing = await transaction
      .select({ id: auditLogsInApp.id })
      .from(auditLogsInApp)
      .where(
        and(
          eq(auditLogsInApp.requestId, requestId),
          eq(auditLogsInApp.action, "SYSTEM_SEED_APPLIED"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    await transaction.insert(auditLogsInApp).values({
      action: "SYSTEM_SEED_APPLIED",
      entityType: "database_seed",
      metadata,
      requestId,
      result: "SUCCESS",
    });
  }
}

function requireInserted<T>(record: T | undefined, entityName: string): T {
  if (record === undefined) {
    throw new Error(`Database did not return the inserted ${entityName}.`);
  }
  return record;
}
