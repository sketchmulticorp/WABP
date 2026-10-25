import { Injectable } from "@nestjs/common";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { SeedRepository } from "../database/seed/seed.repository.js";
import {
  SYSTEM_PERMISSIONS,
  TENANT_ADMIN_PERMISSION_KEYS,
  TENANT_USER_PERMISSION_KEYS,
  type SystemPermissionKey,
} from "../database/seed/seed.catalog.js";

/** Provisions only a new business; never reconciles or broadens existing role grants. */
@Injectable()
export class TenantRoleProvisioningService {
  constructor(private readonly repository: SeedRepository) {}

  async provisionForNewTenant(transaction: AppDatabaseTransaction, tenantId: string) {
    const permissions = await this.repository.upsertPermissions(transaction, SYSTEM_PERMISSIONS);
    const admin = await this.createRole(
      transaction,
      tenantId,
      "TENANT_ADMIN",
      "Tenant Admin",
      TENANT_ADMIN_PERMISSION_KEYS,
      permissions,
    );
    const user = await this.createRole(
      transaction,
      tenantId,
      "TENANT_USER",
      "Tenant User",
      TENANT_USER_PERMISSION_KEYS,
      permissions,
    );
    return { admin, user };
  }

  private async createRole(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    systemKey: "TENANT_ADMIN" | "TENANT_USER",
    name: string,
    keys: readonly SystemPermissionKey[],
    permissions: ReadonlyMap<string, string>,
  ) {
    const role = await this.repository.createRole(transaction, {
      tenantId,
      name,
      systemKey,
      isSystem: true,
    });
    const ids = keys.map((key) => {
      const id = permissions.get(key);
      if (id === undefined) throw new Error("The approved permission catalog is incomplete.");
      return id;
    });
    // These are fresh roles in the caller's transaction, not existing customer grants.
    await this.repository.replaceRolePermissions(transaction, role.id, ids);
    return role;
  }
}
