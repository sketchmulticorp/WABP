import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type {
  AppDatabase,
  AppDatabaseExecutor,
  AppDatabaseTransaction,
} from "../database/database.types.js";
import {
  auditLogsInApp,
  authSessionsInApp,
  rolesInApp,
  tenantsInApp,
  usersInApp,
  userTenantScopesInApp,
} from "../database/schema/index.js";
import type { AuthPrincipalRecord, AuthSessionRecord } from "./auth.types.js";

@Injectable()
export class AuthRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  /** Shared transaction barrier for all credential/session creation and rotation paths. */
  async lockUserAuthentication(executor: AppDatabaseTransaction, userId: string): Promise<void> {
    await executor.execute(
      sql`select pg_advisory_xact_lock(hashtext('auth-user-credentials:v1'), hashtext(${userId}))`,
    );
  }

  async findRefreshOwner(refreshTokenHash: string): Promise<string | undefined> {
    const rows = await this.database
      .select({ userId: authSessionsInApp.userId })
      .from(authSessionsInApp)
      .where(eq(authSessionsInApp.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return rows[0]?.userId;
  }

  findPrincipalByEmail(email: string): Promise<AuthPrincipalRecord | undefined> {
    return this.findPrincipal(this.database, sql`lower(${usersInApp.email}) = lower(${email})`);
  }

  findPrincipalById(
    executor: AppDatabaseExecutor,
    userId: string,
  ): Promise<AuthPrincipalRecord | undefined> {
    return this.findPrincipal(executor, eq(usersInApp.id, userId));
  }

  async createSession(
    executor: AppDatabaseExecutor,
    input: {
      readonly expiresAt: string;
      readonly id: string;
      readonly ipAddress: string | null;
      readonly refreshTokenHash: string;
      readonly tokenFamilyId: string;
      readonly userAgent: string | null;
      readonly userId: string;
    },
  ): Promise<AuthSessionRecord> {
    const rows = await executor.insert(authSessionsInApp).values(input).returning({
      id: authSessionsInApp.id,
      userId: authSessionsInApp.userId,
      refreshTokenHash: authSessionsInApp.refreshTokenHash,
      tokenFamilyId: authSessionsInApp.tokenFamilyId,
      replacedBySessionId: authSessionsInApp.replacedBySessionId,
      expiresAt: authSessionsInApp.expiresAt,
      revokedAt: authSessionsInApp.revokedAt,
      createdAt: authSessionsInApp.createdAt,
    });
    return requireRecord(rows[0], "authentication session");
  }

  async findSessionByHashForUpdate(
    executor: AppDatabaseExecutor,
    refreshTokenHash: string,
  ): Promise<AuthSessionRecord | undefined> {
    const rows = await executor
      .select({
        id: authSessionsInApp.id,
        userId: authSessionsInApp.userId,
        refreshTokenHash: authSessionsInApp.refreshTokenHash,
        tokenFamilyId: authSessionsInApp.tokenFamilyId,
        replacedBySessionId: authSessionsInApp.replacedBySessionId,
        expiresAt: authSessionsInApp.expiresAt,
        revokedAt: authSessionsInApp.revokedAt,
        createdAt: authSessionsInApp.createdAt,
      })
      .from(authSessionsInApp)
      .where(eq(authSessionsInApp.refreshTokenHash, refreshTokenHash))
      .limit(1)
      .for("update");
    return rows[0];
  }

  async rotateSession(
    executor: AppDatabaseExecutor,
    currentSessionId: string,
    replacement: {
      readonly expiresAt: string;
      readonly id: string;
      readonly ipAddress: string | null;
      readonly refreshTokenHash: string;
      readonly tokenFamilyId: string;
      readonly userAgent: string | null;
      readonly userId: string;
    },
    revokedAt: string,
  ): Promise<AuthSessionRecord> {
    const created = await this.createSession(executor, replacement);
    await executor
      .update(authSessionsInApp)
      .set({ replacedBySessionId: created.id, revokedAt })
      .where(and(eq(authSessionsInApp.id, currentSessionId), isNull(authSessionsInApp.revokedAt)));
    return created;
  }

  async revokeSession(
    executor: AppDatabaseExecutor,
    sessionId: string,
    revokedAt: string,
  ): Promise<void> {
    await executor
      .update(authSessionsInApp)
      .set({ revokedAt })
      .where(and(eq(authSessionsInApp.id, sessionId), isNull(authSessionsInApp.revokedAt)));
  }

  async revokeTokenFamily(
    executor: AppDatabaseExecutor,
    tokenFamilyId: string,
    revokedAt: string,
  ): Promise<void> {
    await executor
      .update(authSessionsInApp)
      .set({ revokedAt })
      .where(
        and(
          eq(authSessionsInApp.tokenFamilyId, tokenFamilyId),
          isNull(authSessionsInApp.revokedAt),
        ),
      );
  }

  async updateLastLogin(
    executor: AppDatabaseExecutor,
    userId: string,
    lastLoginAt: string,
  ): Promise<void> {
    await executor
      .update(usersInApp)
      .set({ lastLoginAt })
      .where(and(eq(usersInApp.id, userId), eq(usersInApp.isDeleted, false)));
  }

  async recordAudit(
    executor: AppDatabaseExecutor,
    input: {
      readonly action: string;
      readonly actorId: string | null;
      readonly actorRole: string | null;
      readonly entityId: string | null;
      readonly ipAddress: string | null;
      readonly metadata: Readonly<Record<string, unknown>>;
      readonly requestId: string;
      readonly result: "DENIED" | "FAILED" | "SUCCESS";
      readonly tenantId: string | null;
      readonly userAgent: string | null;
    },
  ): Promise<void> {
    await executor.insert(auditLogsInApp).values({
      ...input,
      entityType: "auth_session",
    });
  }

  private async findPrincipal(
    executor: AppDatabaseExecutor,
    predicate: SQL,
  ): Promise<AuthPrincipalRecord | undefined> {
    const rows = await executor
      .select({
        userId: usersInApp.id,
        email: usersInApp.email,
        displayName: usersInApp.displayName,
        passwordHash: usersInApp.passwordHash,
        userStatus: usersInApp.status,
        tokenVersion: usersInApp.tokenVersion,
        twoFactorEnabled: usersInApp.twoFactorEnabled,
        homeTenantId: usersInApp.homeTenantId,
        roleId: rolesInApp.id,
        roleTenantId: rolesInApp.tenantId,
        roleSystemKey: rolesInApp.systemKey,
        roleIsDeleted: rolesInApp.isDeleted,
        membershipId: userTenantScopesInApp.id,
        membershipTenantId: userTenantScopesInApp.tenantId,
        membershipRoleId: userTenantScopesInApp.roleId,
        tenantStatus: tenantsInApp.status,
        tenantIsDeleted: tenantsInApp.isDeleted,
      })
      .from(usersInApp)
      .innerJoin(rolesInApp, eq(usersInApp.roleId, rolesInApp.id))
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
      .where(and(predicate, eq(usersInApp.isDeleted, false)))
      .limit(1);

    return rows[0];
  }
}

function requireRecord<T>(record: T | undefined, entity: string): T {
  if (record === undefined) {
    throw new Error(`Database did not return the created ${entity}.`);
  }
  return record;
}
