import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { DEPLOYMENT_MODE, type DeploymentMode } from "../common/deployment-mode.js";
import type {
  CurrentUserResponse,
  RevokeSessionResponse,
  SessionListResponse,
} from "@whatsapp-platform/contracts";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { MeRepository } from "./me.repository.js";
import { ProfileError } from "./profile.error.js";

@Injectable()
export class MeService {
  constructor(
    private readonly repository: MeRepository,
    private readonly transactions: DatabaseTransactionManager,
    @Optional() @Inject(DEPLOYMENT_MODE) private readonly deploymentMode: DeploymentMode = "full",
  ) {}

  async updateProfile(
    context: AuthorizationContext,
    displayName: string,
  ): Promise<{ display_name: string }> {
    try {
      return await this.transactions.execute(async (transaction) => {
        const updated = await this.repository.updateOwnName(transaction, context, displayName);
        if (!updated) throw new ProfileError("PROFILE_SESSION_INVALID");
        await this.repository.recordProfileUpdate(transaction, context);
        return { display_name: displayName };
      });
    } catch (error: unknown) {
      if (error instanceof ProfileError) throw error;
      // Driver errors can contain submitted names; retain only a safe public failure.
      throw new ProfileError("PROFILE_UPDATE_UNAVAILABLE");
    }
  }

  async getCurrentUser(context: AuthorizationContext): Promise<CurrentUserResponse> {
    const user = await this.repository.findCurrentUser(context.actorId);
    if (user === undefined) {
      throw unauthenticatedError();
    }
    if (user.roleSystemKey !== context.roleSystemKey) {
      throw unauthenticatedError();
    }
    if (user.tenantId !== context.tenantId) {
      throw unauthenticatedError();
    }
    if (context.passwordChangeRequired === true) {
      // Restricted identity only: no subscription, business or workspace projection before change.
      return {
        deployment_mode: this.deploymentMode,
        password_change_required: true,
        email: user.email,
        display_name: user.displayName,
        id: user.userId,
        permissions: [],
        role: { name: user.roleName, system_key: context.roleSystemKey },
        tenant: null,
        subscription: null,
      };
    }
    const subscription =
      context.tenantId === null
        ? undefined
        : await this.repository.findActiveSubscription(context.tenantId);
    return {
      deployment_mode: this.deploymentMode,
      password_change_required: false,
      email: user.email,
      display_name: user.displayName,
      id: user.userId,
      permissions: [...context.permissions].sort(),
      role: { name: user.roleName, system_key: context.roleSystemKey },
      subscription:
        subscription === undefined
          ? null
          : {
              ends_at: subscription.endsAt,
              plan: {
                code: subscription.planCode,
                feature_flags: requireJsonObject(subscription.featureFlags),
                limits: requireJsonObject(subscription.limits),
                name: subscription.planName,
              },
              starts_at: subscription.startsAt,
              status: subscription.status === "TRIAL" ? "TRIAL" : "ACTIVE",
            },
      tenant:
        context.tenantId === null
          ? null
          : {
              default_country_code: user.defaultCountryCode,
              default_timezone: user.defaultTimezone ?? "UTC",
              id: context.tenantId,
              name: requireValue(user.tenantName),
              slug: requireValue(user.tenantSlug),
            },
    };
  }

  async listSessions(context: AuthorizationContext): Promise<SessionListResponse> {
    const sessions = await this.repository.listActiveSessions(context.actorId);
    return {
      sessions: sessions.map((session) => ({
        created_at: session.createdAt,
        current: session.id === context.sessionId,
        expires_at: session.expiresAt,
        id: session.id,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
      })),
    };
  }

  async revokeSession(
    context: AuthorizationContext,
    targetSessionId: string,
  ): Promise<RevokeSessionResponse> {
    await this.transactions.execute(async (transaction) => {
      const session = await this.repository.findOwnedSessionForUpdate(
        transaction,
        context.actorId,
        targetSessionId,
      );
      if (session === undefined) {
        throw new ApplicationError({
          code: "SESSION_NOT_FOUND",
          message: "The session was not found.",
          statusCode: HttpStatus.NOT_FOUND,
        });
      }
      const revokedAt = new Date().toISOString();
      await this.repository.revokeSessionFamily(transaction, session.tokenFamilyId, revokedAt);
      await this.repository.recordSessionRevocation(transaction, {
        actorId: context.actorId,
        actorRole: context.roleSystemKey,
        currentSession: targetSessionId === context.sessionId,
        requestId: context.requestId,
        sessionId: targetSessionId,
        tenantId: context.tenantId,
      });
    });
    return { revoked: true };
  }
}

function requireJsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Persisted plan configuration must be a JSON object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireValue(value: string | null): string {
  if (value === null) {
    throw new Error("Authenticated tenant metadata is incomplete.");
  }
  return value;
}

function unauthenticatedError(): ApplicationError {
  return new ApplicationError({
    code: "UNAUTHENTICATED",
    message: "Authentication is required.",
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}
