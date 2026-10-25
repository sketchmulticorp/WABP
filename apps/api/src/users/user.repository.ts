import { Inject, Injectable } from "@nestjs/common";
import type { TenantUserSummary } from "@whatsapp-platform/contracts";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import {
  auditLogsInApp,
  authSessionsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../database/schema/index.js";

@Injectable()
export class UserRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async list(tenantId: string): Promise<readonly TenantUserSummary[]> {
    const rows = await this.database
      .select({
        createdAt: usersInApp.createdAt,
        displayName: usersInApp.displayName,
        email: usersInApp.email,
        id: usersInApp.id,
        role: rolesInApp.systemKey,
        status: usersInApp.status,
      })
      .from(usersInApp)
      .innerJoin(rolesInApp, eq(usersInApp.roleId, rolesInApp.id))
      .innerJoin(
        userTenantScopesInApp,
        and(
          eq(userTenantScopesInApp.userId, usersInApp.id),
          eq(userTenantScopesInApp.tenantId, tenantId),
          eq(userTenantScopesInApp.roleId, rolesInApp.id),
          eq(userTenantScopesInApp.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(usersInApp.homeTenantId, tenantId),
          eq(usersInApp.isDeleted, false),
          eq(rolesInApp.isDeleted, false),
        ),
      )
      .orderBy(asc(usersInApp.displayName), asc(usersInApp.email));
    return rows.map((row) => {
      if (row.role !== "TENANT_ADMIN" && row.role !== "TENANT_USER") {
        throw new Error("Persisted tenant user has an invalid system role.");
      }
      if (!["ACTIVE", "DISABLED", "INVITED", "LOCKED"].includes(row.status)) {
        throw new Error("Persisted tenant user has an invalid status.");
      }
      return {
        created_at: row.createdAt,
        display_name: row.displayName,
        email: row.email,
        id: row.id,
        role: row.role,
        status: row.status as TenantUserSummary["status"],
      };
    });
  }

  async createTenantUser(
    transaction: AppDatabaseTransaction,
    input: {
      readonly displayName: string;
      readonly email: string;
      readonly passwordHash: string;
      readonly roleId: string;
      readonly tenantId: string;
    },
  ) {
    const [user] = await transaction
      .insert(usersInApp)
      .values({
        displayName: input.displayName,
        email: input.email,
        homeTenantId: input.tenantId,
        passwordHash: input.passwordHash,
        mustChangePassword: true,
        roleId: input.roleId,
        status: "ACTIVE",
      })
      .returning({
        createdAt: usersInApp.createdAt,
        displayName: usersInApp.displayName,
        email: usersInApp.email,
        id: usersInApp.id,
      });
    if (user === undefined) throw new Error("Tenant User creation did not return a row.");
    await transaction.insert(userTenantScopesInApp).values({
      roleId: input.roleId,
      tenantId: input.tenantId,
      userId: user.id,
    });
    return { ...user, role: "TENANT_USER" as const, status: "ACTIVE" as const };
  }

  async findSystemTenantUserRole(transaction: AppDatabaseTransaction, tenantId: string) {
    const [role] = await transaction
      .select({ id: rolesInApp.id })
      .from(rolesInApp)
      .where(
        and(
          eq(rolesInApp.systemKey, "TENANT_USER"),
          eq(rolesInApp.tenantId, tenantId),
          eq(rolesInApp.isSystem, true),
          eq(rolesInApp.isDeleted, false),
        ),
      )
      .limit(1);
    if (role === undefined) throw new Error("The system Tenant User role is missing.");
    return role;
  }

  /** Explicit restore lookup; ordinary account queries must continue excluding deleted rows. */
  findDeletedByEmailForUpdate(transaction: AppDatabaseTransaction, email: string) {
    return transaction
      .select({ homeTenantId: usersInApp.homeTenantId, id: usersInApp.id })
      .from(usersInApp)
      .where(and(sql`lower(${usersInApp.email}) = ${email}`, eq(usersInApp.isDeleted, true)))
      .limit(2)
      .for("update");
  }

  findMembershipsForUpdate(transaction: AppDatabaseTransaction, userId: string) {
    return transaction
      .select({
        id: userTenantScopesInApp.id,
        isDeleted: userTenantScopesInApp.isDeleted,
        tenantId: userTenantScopesInApp.tenantId,
      })
      .from(userTenantScopesInApp)
      .where(eq(userTenantScopesInApp.userId, userId))
      .for("update");
  }

  async restoreTenantUser(
    transaction: AppDatabaseTransaction,
    input: {
      readonly displayName: string;
      readonly email: string;
      readonly passwordHash: string;
      readonly roleId: string;
      readonly tenantId: string;
      readonly userId: string;
    },
  ) {
    const [user] = await transaction
      .update(usersInApp)
      .set({
        deletedAt: null,
        deletedBy: null,
        displayName: input.displayName,
        email: input.email,
        homeTenantId: input.tenantId,
        isDeleted: false,
        passwordHash: input.passwordHash,
        roleId: input.roleId,
        status: "ACTIVE",
        tokenVersion: sql`${usersInApp.tokenVersion} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(usersInApp.id, input.userId), eq(usersInApp.isDeleted, true)))
      .returning({
        createdAt: usersInApp.createdAt,
        displayName: usersInApp.displayName,
        email: usersInApp.email,
        id: usersInApp.id,
      });
    if (user === undefined) return undefined;
    await transaction
      .update(authSessionsInApp)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(authSessionsInApp.userId, user.id), isNull(authSessionsInApp.revokedAt)));
    return { ...user, role: "TENANT_USER" as const, status: "ACTIVE" as const };
  }

  async restoreMembership(
    transaction: AppDatabaseTransaction,
    input: {
      readonly membershipId: string;
      readonly roleId: string;
      readonly tenantId: string;
    },
  ) {
    await transaction
      .update(userTenantScopesInApp)
      .set({
        deletedAt: null,
        deletedBy: null,
        isDeleted: false,
        roleId: input.roleId,
        tenantId: input.tenantId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(userTenantScopesInApp.id, input.membershipId));
  }

  async createMembership(
    transaction: AppDatabaseTransaction,
    input: { readonly roleId: string; readonly tenantId: string; readonly userId: string },
  ) {
    await transaction.insert(userTenantScopesInApp).values(input);
  }

  async findTenantUserForUpdate(
    transaction: AppDatabaseTransaction,
    tenantId: string,
    userId: string,
  ) {
    const rows = await transaction
      .select({
        createdAt: usersInApp.createdAt,
        displayName: usersInApp.displayName,
        email: usersInApp.email,
        id: usersInApp.id,
        isDeleted: usersInApp.isDeleted,
        membershipId: userTenantScopesInApp.id,
        membershipIsDeleted: userTenantScopesInApp.isDeleted,
        status: usersInApp.status,
      })
      .from(usersInApp)
      .innerJoin(
        rolesInApp,
        and(
          eq(rolesInApp.id, usersInApp.roleId),
          eq(rolesInApp.systemKey, "TENANT_USER"),
          eq(rolesInApp.isDeleted, false),
        ),
      )
      .innerJoin(
        userTenantScopesInApp,
        and(
          eq(userTenantScopesInApp.userId, usersInApp.id),
          eq(userTenantScopesInApp.tenantId, tenantId),
          eq(userTenantScopesInApp.roleId, rolesInApp.id),
        ),
      )
      .where(and(eq(usersInApp.id, userId), eq(usersInApp.homeTenantId, tenantId)))
      .limit(1)
      .for("update");
    return rows[0];
  }

  async changeStatus(
    transaction: AppDatabaseTransaction,
    userId: string,
    status: "ACTIVE" | "DISABLED",
  ) {
    const [user] = await transaction
      .update(usersInApp)
      .set({
        status,
        tokenVersion: sql`${usersInApp.tokenVersion} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(usersInApp.id, userId), eq(usersInApp.isDeleted, false)))
      .returning({
        createdAt: usersInApp.createdAt,
        displayName: usersInApp.displayName,
        email: usersInApp.email,
        id: usersInApp.id,
        status: usersInApp.status,
      });
    if (user !== undefined) await this.revokeSessions(transaction, user.id);
    return user;
  }

  async softDeleteTenantUser(
    transaction: AppDatabaseTransaction,
    input: { readonly actorId: string; readonly membershipId: string; readonly userId: string },
  ) {
    const deletedAt = new Date().toISOString();
    const [user] = await transaction
      .update(usersInApp)
      .set({
        deletedAt,
        deletedBy: input.actorId,
        isDeleted: true,
        status: "DISABLED",
        tokenVersion: sql`${usersInApp.tokenVersion} + 1`,
        updatedAt: deletedAt,
      })
      .where(and(eq(usersInApp.id, input.userId), eq(usersInApp.isDeleted, false)))
      .returning({ id: usersInApp.id });
    if (user === undefined) return undefined;
    await transaction
      .update(userTenantScopesInApp)
      .set({
        deletedAt,
        deletedBy: input.actorId,
        isDeleted: true,
        updatedAt: deletedAt,
      })
      .where(
        and(
          eq(userTenantScopesInApp.id, input.membershipId),
          eq(userTenantScopesInApp.isDeleted, false),
        ),
      );
    await this.revokeSessions(transaction, user.id);
    return user;
  }

  async auditAccountChange(
    transaction: AppDatabaseTransaction,
    input: {
      readonly action: "TENANT_USER_ACTIVATED" | "TENANT_USER_DEACTIVATED" | "TENANT_USER_DELETED";
      readonly actorId: string;
      readonly actorRole: string;
      readonly requestId: string;
      readonly tenantId: string;
      readonly userId: string;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: input.userId,
      entityType: "user",
      metadata: {},
      requestId: input.requestId,
      result: "SUCCESS",
      tenantId: input.tenantId,
    });
  }

  private async revokeSessions(transaction: AppDatabaseTransaction, userId: string) {
    await transaction
      .update(authSessionsInApp)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(authSessionsInApp.userId, userId), isNull(authSessionsInApp.revokedAt)));
  }

  async auditCreation(
    transaction: AppDatabaseTransaction,
    input: {
      readonly actorId: string;
      readonly actorRole: string;
      readonly requestId: string;
      readonly tenantId: string;
      readonly userId: string;
      readonly restored: boolean;
    },
  ) {
    await transaction.insert(auditLogsInApp).values({
      action: input.restored ? "TENANT_USER_RESTORED" : "TENANT_USER_CREATED",
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: input.userId,
      entityType: "user",
      metadata: { role: "TENANT_USER" },
      requestId: input.requestId,
      result: "SUCCESS",
      tenantId: input.tenantId,
    });
  }
}
