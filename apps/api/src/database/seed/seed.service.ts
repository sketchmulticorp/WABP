import { isDeepStrictEqual } from "node:util";

import type { PasswordHasher } from "../../common/security/password-hasher.js";
import type { AppDatabaseTransaction } from "../database.types.js";
import {
  INTERNAL_PLAN,
  SUPER_ADMIN_PERMISSION_KEYS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLE_KEYS,
  TENANT_ADMIN_PERMISSION_KEYS,
  TENANT_USER_PERMISSION_KEYS,
} from "./seed.catalog.js";
import { SeedConflictError } from "./seed.error.js";
import type { SeedRepository } from "./seed.repository.js";
import type {
  ApprovedSeedConfig,
  SeedPlanRecord,
  SeedResult,
  SeedRoleRecord,
  SeedTenantRecord,
  SeedTransactionRunner,
  SeedUserRecord,
} from "./seed.types.js";

const SEED_AUDIT_REQUEST_ID = "bootstrap:task-022:v1";

interface HashedSeedCredentials {
  readonly superAdmin: string;
  readonly tenantAdmin: string;
  readonly tenantUser: string;
}

/** Orchestrates the approved bootstrap policy while SeedRepository owns all SQL operations. */
export class SeedService {
  constructor(
    private readonly repository: SeedRepository,
    private readonly transactions: SeedTransactionRunner,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async run(config: ApprovedSeedConfig): Promise<SeedResult> {
    // Expensive password derivation stays outside the database transaction.
    const hashes = await this.hashBootstrapPasswords(config);

    return this.transactions.execute(async (transaction) => {
      await this.repository.acquireTransactionLock(transaction);

      const planResult = await this.ensurePlan(transaction, config);
      const tenantResult = await this.ensureTenant(transaction, config);
      const permissionIds = await this.repository.upsertPermissions(
        transaction,
        SYSTEM_PERMISSIONS,
      );
      const superAdminRole = await this.ensureRole(
        transaction,
        null,
        "Super Admin",
        SYSTEM_ROLE_KEYS.superAdmin,
      );
      const tenantAdminRole = await this.ensureRole(
        transaction,
        tenantResult.record.id,
        "Tenant Admin",
        SYSTEM_ROLE_KEYS.tenantAdmin,
      );
      const tenantUserRole = await this.ensureRole(
        transaction,
        tenantResult.record.id,
        "Tenant User",
        SYSTEM_ROLE_KEYS.tenantUser,
      );

      await this.assignPermissions(
        transaction,
        superAdminRole.id,
        SUPER_ADMIN_PERMISSION_KEYS,
        permissionIds,
      );
      await this.assignPermissions(
        transaction,
        tenantAdminRole.id,
        TENANT_ADMIN_PERMISSION_KEYS,
        permissionIds,
      );
      await this.assignPermissions(
        transaction,
        tenantUserRole.id,
        TENANT_USER_PERMISSION_KEYS,
        permissionIds,
      );

      const superAdminResult = await this.ensureUser(transaction, {
        email: config.superAdmin.email,
        displayName: config.superAdmin.displayName,
        passwordHash: hashes.superAdmin,
        roleId: superAdminRole.id,
        homeTenantId: null,
      });
      await this.ensureNoTenantMembership(transaction, superAdminResult.record);

      const tenantAdminResult = await this.ensureUser(transaction, {
        email: config.tenantAdmin.email,
        displayName: config.tenantAdmin.displayName,
        passwordHash: hashes.tenantAdmin,
        roleId: tenantAdminRole.id,
        homeTenantId: tenantResult.record.id,
      });
      await this.ensureMembership(
        transaction,
        tenantAdminResult.record,
        tenantResult.record.id,
        tenantAdminRole.id,
      );

      const tenantUserResult = await this.ensureUser(transaction, {
        email: config.tenantUser.email,
        displayName: config.tenantUser.displayName,
        passwordHash: hashes.tenantUser,
        roleId: tenantUserRole.id,
        homeTenantId: tenantResult.record.id,
      });
      await this.ensureMembership(
        transaction,
        tenantUserResult.record,
        tenantResult.record.id,
        tenantUserRole.id,
      );

      const subscriptionCreated = await this.ensureSubscription(
        transaction,
        tenantResult.record.id,
        planResult.record.id,
      );
      const created = Object.freeze({
        plan: planResult.created,
        tenant: tenantResult.created,
        superAdmin: superAdminResult.created,
        tenantAdmin: tenantAdminResult.created,
        tenantUser: tenantUserResult.created,
        subscription: subscriptionCreated,
      });

      await this.repository.recordSeedAuditOnce(transaction, SEED_AUDIT_REQUEST_ID, {
        planCode: INTERNAL_PLAN.code,
        tenantId: tenantResult.record.id,
        created,
      });

      return Object.freeze({
        created,
        permissionCount: SYSTEM_PERMISSIONS.length,
        roleCount: 3,
      });
    });
  }

  private async hashBootstrapPasswords(config: ApprovedSeedConfig): Promise<HashedSeedCredentials> {
    return {
      superAdmin: await this.passwordHasher.hash(config.superAdmin.password),
      tenantAdmin: await this.passwordHasher.hash(config.tenantAdmin.password),
      tenantUser: await this.passwordHasher.hash(config.tenantUser.password),
    };
  }

  private async ensurePlan(
    transaction: AppDatabaseTransaction,
    config: ApprovedSeedConfig,
  ): Promise<{ readonly created: boolean; readonly record: SeedPlanRecord }> {
    const expected: Omit<SeedPlanRecord, "id"> = {
      code: INTERNAL_PLAN.code,
      name: INTERNAL_PLAN.name,
      status: "ACTIVE",
      priceMinor: 0,
      currency: null,
      validityDays: null,
      limits: {
        max_users: config.plan.maxUsers,
        max_whatsapp_numbers: config.plan.maxWhatsappNumbers,
        max_contacts: config.plan.maxContacts,
        monthly_message_limit: config.plan.monthlyMessageLimit,
        monthly_campaign_limit: config.plan.monthlyCampaignLimit,
        max_templates: config.plan.maxTemplates,
        storage_gb: config.plan.storageGb,
      },
      featureFlags: {
        automation_enabled: config.plan.automationEnabled,
        api_enabled: false,
        ai_enabled: false,
      },
    };
    const existing = await this.repository.findPlanByCode(transaction, INTERNAL_PLAN.code);

    if (existing === undefined) {
      return { created: true, record: await this.repository.createPlan(transaction, expected) };
    }
    if (!isDeepStrictEqual(withoutId(existing), expected)) {
      throw new SeedConflictError(
        `${INTERNAL_PLAN.code} already exists with values that differ from the approved seed configuration.`,
      );
    }
    return { created: false, record: existing };
  }

  private async ensureTenant(
    transaction: AppDatabaseTransaction,
    config: ApprovedSeedConfig,
  ): Promise<{ readonly created: boolean; readonly record: SeedTenantRecord }> {
    const expected: Omit<SeedTenantRecord, "id"> = {
      name: config.tenant.name,
      slug: config.tenant.slug,
      status: "ACTIVE",
      defaultTimezone: config.tenant.timezone,
      defaultCountryCode: config.tenant.countryCode,
    };
    const existing = await this.repository.findActiveTenantBySlug(transaction, config.tenant.slug);

    if (existing === undefined) {
      return { created: true, record: await this.repository.createTenant(transaction, expected) };
    }
    if (!isDeepStrictEqual(withoutId(existing), expected)) {
      throw new SeedConflictError(
        `Active tenant slug '${config.tenant.slug}' belongs to different tenant configuration.`,
      );
    }
    return { created: false, record: existing };
  }

  private async ensureRole(
    transaction: AppDatabaseTransaction,
    tenantId: string | null,
    name: string,
    systemKey: string,
  ): Promise<SeedRoleRecord> {
    const existing = await this.repository.findActiveRoleBySystemKey(
      transaction,
      systemKey,
      tenantId,
    );
    if (existing === undefined) {
      return this.repository.createRole(transaction, {
        tenantId,
        name,
        systemKey,
        isSystem: true,
      });
    }
    if (existing.name !== name || !existing.isSystem) {
      throw new SeedConflictError(`System role '${systemKey}' has incompatible persisted values.`);
    }
    return existing;
  }

  private async assignPermissions(
    transaction: AppDatabaseTransaction,
    roleId: string,
    permissionKeys: readonly string[],
    permissionIds: ReadonlyMap<string, string>,
  ): Promise<void> {
    const ids = permissionKeys.map((key) => {
      const id = permissionIds.get(key);
      if (id === undefined) {
        throw new SeedConflictError(
          `Permission '${key}' was not persisted by the seed repository.`,
        );
      }
      return id;
    });
    await this.repository.replaceRolePermissions(transaction, roleId, ids);
  }

  private async ensureUser(
    transaction: AppDatabaseTransaction,
    input: Omit<SeedUserRecord, "id" | "status">,
  ): Promise<{ readonly created: boolean; readonly record: SeedUserRecord }> {
    const existing = await this.repository.findActiveUserByEmail(transaction, input.email);
    if (existing === undefined) {
      return {
        created: true,
        record: await this.repository.createUser(transaction, { ...input, status: "ACTIVE" }),
      };
    }

    if (existing.roleId !== input.roleId || existing.homeTenantId !== input.homeTenantId) {
      throw new SeedConflictError(
        `Bootstrap email '${input.email}' is already assigned to an incompatible role or tenant.`,
      );
    }

    // A rerun must never reset credentials, reactivate a disabled account, or rename a user.
    return { created: false, record: existing };
  }

  private async ensureNoTenantMembership(
    transaction: AppDatabaseTransaction,
    user: SeedUserRecord,
  ): Promise<void> {
    const membership = await this.repository.findActiveMembershipByUserId(transaction, user.id);
    if (membership !== undefined) {
      throw new SeedConflictError("The Super Admin bootstrap account has a tenant membership.");
    }
  }

  private async ensureMembership(
    transaction: AppDatabaseTransaction,
    user: SeedUserRecord,
    tenantId: string,
    roleId: string,
  ): Promise<void> {
    const membership = await this.repository.findActiveMembershipByUserId(transaction, user.id);
    if (membership === undefined) {
      await this.repository.createMembership(transaction, { userId: user.id, tenantId, roleId });
      return;
    }
    if (membership.tenantId !== tenantId || membership.roleId !== roleId) {
      throw new SeedConflictError(
        `Bootstrap user '${user.email}' already has an incompatible active tenant membership.`,
      );
    }
  }

  private async ensureSubscription(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    planId: string,
  ): Promise<boolean> {
    const existing = await this.repository.findOpenSubscriptions(transaction, tenantId);
    const current = existing[0];
    if (current === undefined) {
      await this.repository.createSubscription(transaction, {
        tenantId,
        planId,
        status: "ACTIVE",
        startsAt: new Date().toISOString(),
      });
      return true;
    }
    if (existing.length !== 1 || current.planId !== planId || current.status !== "ACTIVE") {
      throw new SeedConflictError(
        "The bootstrap tenant already has an incompatible open subscription.",
      );
    }
    return false;
  }
}

function withoutId<T extends { readonly id: string }>(record: T): Omit<T, "id"> {
  const { id, ...rest } = record;
  if (id.length === 0) {
    throw new SeedConflictError("Persisted seed records must have a non-empty identifier.");
  }
  return rest;
}
