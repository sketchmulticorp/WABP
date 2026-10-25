import { Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { AppDatabaseTransaction } from "../../database/database.types.js";
import {
  auditLogsInApp,
  authSessionsInApp,
  rolesInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../../database/schema/index.js";

/** Platform account persistence only: never reads tenant contacts or communication content. */
@Injectable()
export class SuperAdminRepository {
  async lockCreator(
    tx: AppDatabaseTransaction,
    actorId: string,
    roleId: string,
    sessionId: string,
  ): Promise<boolean> {
    // Lock only the user row: joined outer relations cannot be locked, and the installed
    // Drizzle version emits an invalid schema-qualified FOR UPDATE OF target.
    await tx
      .select({ id: usersInApp.id })
      .from(usersInApp)
      .where(and(eq(usersInApp.id, actorId), eq(usersInApp.isDeleted, false)))
      .for("update");
    const rows = await tx
      .select({ id: usersInApp.id })
      .from(usersInApp)
      .innerJoin(rolesInApp, eq(rolesInApp.id, usersInApp.roleId))
      .innerJoin(authSessionsInApp, eq(authSessionsInApp.userId, usersInApp.id))
      .leftJoin(
        userTenantScopesInApp,
        and(
          eq(userTenantScopesInApp.userId, usersInApp.id),
          eq(userTenantScopesInApp.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(usersInApp.id, actorId),
          eq(usersInApp.roleId, roleId),
          eq(usersInApp.status, "ACTIVE"),
          eq(usersInApp.isDeleted, false),
          eq(usersInApp.mustChangePassword, false),
          isNull(usersInApp.homeTenantId),
          eq(rolesInApp.systemKey, "SUPER_ADMIN"),
          eq(rolesInApp.isSystem, true),
          eq(rolesInApp.isDeleted, false),
          isNull(rolesInApp.tenantId),
          isNull(userTenantScopesInApp.id),
          eq(authSessionsInApp.id, sessionId),
          isNull(authSessionsInApp.revokedAt),
          gt(authSessionsInApp.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);
    return rows.length === 1;
  }

  /** Boolean-only provisioning safeguard: deleted identities cannot be promoted or reclaimed. */
  async isEmailReservedIncludingDeleted(
    tx: AppDatabaseTransaction,
    email: string,
  ): Promise<boolean> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('super-admin-email:v1'), hashtext(${email}))`,
    );
    const rows = await tx
      .select({ id: usersInApp.id })
      .from(usersInApp)
      .where(sql`lower(${usersInApp.email}) = ${email}`)
      .limit(1);
    return rows.length > 0;
  }

  async create(
    tx: AppDatabaseTransaction,
    input: { displayName: string; email: string; passwordHash: string; roleId: string },
  ) {
    const rows = await tx
      .insert(usersInApp)
      .values({
        displayName: input.displayName,
        email: input.email,
        passwordHash: input.passwordHash,
        roleId: input.roleId,
        homeTenantId: null,
        status: "ACTIVE",
        mustChangePassword: true,
      })
      .returning({
        id: usersInApp.id,
        display_name: usersInApp.displayName,
        email: usersInApp.email,
      });
    const created = rows[0];
    if (created === undefined) throw new Error("Platform account insert returned no row");
    return created;
  }

  async auditCreation(
    tx: AppDatabaseTransaction,
    actorId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    await tx.insert(auditLogsInApp).values({
      tenantId: null,
      actorId,
      actorRole: "SUPER_ADMIN",
      action: "SUPER_ADMIN_CREATED",
      entityType: "user",
      entityId: userId,
      requestId,
      result: "SUCCESS",
      metadata: { role: "SUPER_ADMIN", password_change_required: true },
    });
  }
}
