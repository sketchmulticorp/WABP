import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseExecutor } from "../database/database.types.js";
import {
  auditLogsInApp,
  authSessionsInApp,
  plansInApp,
  rolesInApp,
  subscriptionsInApp,
  tenantsInApp,
  usersInApp,
} from "../database/schema/index.js";
import type { CurrentUserRecord, SessionRecord, SubscriptionRecord } from "./me.types.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";

@Injectable()
export class MeRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  async updateOwnName(
    executor: AppDatabaseExecutor,
    context: AuthorizationContext,
    displayName: string,
  ): Promise<boolean> {
    const rows = await executor
      .update(usersInApp)
      .set({ displayName, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(usersInApp.id, context.actorId),
          eq(usersInApp.isDeleted, false),
          eq(usersInApp.status, "ACTIVE"),
          eq(usersInApp.mustChangePassword, false),
          context.tenantId === null
            ? isNull(usersInApp.homeTenantId)
            : eq(usersInApp.homeTenantId, context.tenantId),
        ),
      )
      .returning({ id: usersInApp.id });
    if (rows.length === 0) return false;
    return true;
  }

  async recordProfileUpdate(
    executor: AppDatabaseExecutor,
    context: AuthorizationContext,
  ): Promise<void> {
    await executor.insert(auditLogsInApp).values({
      action: "PROFILE_UPDATED",
      actorId: context.actorId,
      actorRole: context.roleSystemKey,
      entityId: context.actorId,
      entityType: "user",
      tenantId: context.tenantId,
      requestId: context.requestId,
      result: "SUCCESS",
      metadata: { fields: ["display_name"] },
    });
  }

  async findCurrentUser(userId: string): Promise<CurrentUserRecord | undefined> {
    const rows = await this.database
      .select({
        defaultCountryCode: tenantsInApp.defaultCountryCode,
        defaultTimezone: tenantsInApp.defaultTimezone,
        displayName: usersInApp.displayName,
        email: usersInApp.email,
        roleName: rolesInApp.name,
        roleSystemKey: rolesInApp.systemKey,
        tenantId: tenantsInApp.id,
        tenantName: tenantsInApp.name,
        tenantSlug: tenantsInApp.slug,
        userId: usersInApp.id,
      })
      .from(usersInApp)
      .innerJoin(rolesInApp, eq(rolesInApp.id, usersInApp.roleId))
      .leftJoin(
        tenantsInApp,
        and(eq(tenantsInApp.id, usersInApp.homeTenantId), eq(tenantsInApp.isDeleted, false)),
      )
      .where(
        and(
          eq(usersInApp.id, userId),
          eq(usersInApp.status, "ACTIVE"),
          eq(usersInApp.isDeleted, false),
          eq(rolesInApp.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async findActiveSubscription(tenantId: string): Promise<SubscriptionRecord | undefined> {
    const now = new Date().toISOString();
    const rows = await this.database
      .select({
        endsAt: subscriptionsInApp.endsAt,
        featureFlags: plansInApp.featureFlags,
        limits: plansInApp.limits,
        planCode: plansInApp.code,
        planName: plansInApp.name,
        startsAt: subscriptionsInApp.startsAt,
        status: subscriptionsInApp.status,
      })
      .from(subscriptionsInApp)
      .innerJoin(plansInApp, eq(plansInApp.id, subscriptionsInApp.planId))
      .where(
        and(
          eq(subscriptionsInApp.tenantId, tenantId),
          inArray(subscriptionsInApp.status, ["ACTIVE", "TRIAL"]),
          eq(plansInApp.status, "ACTIVE"),
          lte(subscriptionsInApp.startsAt, now),
          or(isNull(subscriptionsInApp.endsAt), gt(subscriptionsInApp.endsAt, now)),
        ),
      )
      .orderBy(desc(subscriptionsInApp.startsAt))
      .limit(1);
    return rows[0];
  }

  async listActiveSessions(userId: string): Promise<readonly SessionRecord[]> {
    return this.database
      .select({
        createdAt: authSessionsInApp.createdAt,
        expiresAt: authSessionsInApp.expiresAt,
        id: authSessionsInApp.id,
        ipAddress: authSessionsInApp.ipAddress,
        tokenFamilyId: authSessionsInApp.tokenFamilyId,
        userAgent: authSessionsInApp.userAgent,
      })
      .from(authSessionsInApp)
      .where(
        and(
          eq(authSessionsInApp.userId, userId),
          isNull(authSessionsInApp.revokedAt),
          gt(authSessionsInApp.expiresAt, new Date().toISOString()),
        ),
      )
      .orderBy(desc(authSessionsInApp.createdAt));
  }

  async findOwnedSessionForUpdate(
    executor: AppDatabaseExecutor,
    userId: string,
    sessionId: string,
  ): Promise<SessionRecord | undefined> {
    const rows = await executor
      .select({
        createdAt: authSessionsInApp.createdAt,
        expiresAt: authSessionsInApp.expiresAt,
        id: authSessionsInApp.id,
        ipAddress: authSessionsInApp.ipAddress,
        tokenFamilyId: authSessionsInApp.tokenFamilyId,
        userAgent: authSessionsInApp.userAgent,
      })
      .from(authSessionsInApp)
      .where(
        and(
          eq(authSessionsInApp.id, sessionId),
          eq(authSessionsInApp.userId, userId),
          isNull(authSessionsInApp.revokedAt),
          gt(authSessionsInApp.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1)
      .for("update");
    return rows[0];
  }

  async revokeSessionFamily(
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

  async recordSessionRevocation(
    executor: AppDatabaseExecutor,
    input: {
      readonly actorId: string;
      readonly actorRole: string;
      readonly currentSession: boolean;
      readonly requestId: string;
      readonly sessionId: string;
      readonly tenantId: string | null;
    },
  ): Promise<void> {
    await executor.insert(auditLogsInApp).values({
      action: "SESSION_REVOKE",
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: input.sessionId,
      entityType: "auth_session",
      metadata: { current_session: input.currentSession },
      requestId: input.requestId,
      result: "SUCCESS",
      tenantId: input.tenantId,
    });
  }
}
