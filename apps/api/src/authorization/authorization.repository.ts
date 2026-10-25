import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase } from "../database/database.types.js";
import {
  authSessionsInApp,
  permissionsInApp,
  rolePermissionsInApp,
  rolesInApp,
  tenantsInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../database/schema/index.js";
import type { AuthenticatedPrincipalRecord } from "./authorization.types.js";

@Injectable()
export class AuthorizationRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async findPrincipal(
    userId: string,
    sessionId: string,
  ): Promise<AuthenticatedPrincipalRecord | undefined> {
    const rows = await this.database
      .select({
        email: usersInApp.email,
        mustChangePassword: usersInApp.mustChangePassword,
        homeTenantId: usersInApp.homeTenantId,
        membershipId: userTenantScopesInApp.id,
        membershipRoleId: userTenantScopesInApp.roleId,
        membershipTenantId: userTenantScopesInApp.tenantId,
        roleId: rolesInApp.id,
        roleIsDeleted: rolesInApp.isDeleted,
        roleName: rolesInApp.name,
        roleSystemKey: rolesInApp.systemKey,
        roleTenantId: rolesInApp.tenantId,
        sessionExpiresAt: authSessionsInApp.expiresAt,
        sessionRevokedAt: authSessionsInApp.revokedAt,
        tenantIsDeleted: tenantsInApp.isDeleted,
        tenantStatus: tenantsInApp.status,
        userId: usersInApp.id,
        userStatus: usersInApp.status,
      })
      .from(authSessionsInApp)
      .innerJoin(usersInApp, eq(usersInApp.id, authSessionsInApp.userId))
      .innerJoin(rolesInApp, eq(rolesInApp.id, usersInApp.roleId))
      .leftJoin(
        userTenantScopesInApp,
        and(
          eq(userTenantScopesInApp.userId, usersInApp.id),
          eq(userTenantScopesInApp.isDeleted, false),
        ),
      )
      .leftJoin(
        tenantsInApp,
        and(eq(tenantsInApp.id, userTenantScopesInApp.tenantId), eq(tenantsInApp.isDeleted, false)),
      )
      .where(
        and(
          eq(authSessionsInApp.id, sessionId),
          eq(authSessionsInApp.userId, userId),
          eq(usersInApp.isDeleted, false),
        ),
      )
      .limit(1);

    return rows[0];
  }

  async listPermissionKeys(roleId: string): Promise<readonly string[]> {
    const rows = await this.database
      .select({ permissionKey: permissionsInApp.permissionKey })
      .from(rolePermissionsInApp)
      .innerJoin(permissionsInApp, eq(permissionsInApp.id, rolePermissionsInApp.permissionId))
      .where(eq(rolePermissionsInApp.roleId, roleId))
      .orderBy(asc(permissionsInApp.permissionKey));
    return rows.map((row) => row.permissionKey);
  }
}
