import { HttpStatus, Injectable } from "@nestjs/common";

import { AccessTokenService } from "../auth/access-token.service.js";
import { isEligibleAuthPrincipal } from "../auth/auth-principal.policy.js";
import { ApplicationError } from "../common/errors/application-error.js";
import { AuthorizationRepository } from "./authorization.repository.js";
import type {
  AuthorizationContext,
  SystemRoleKey,
  TenantRepositoryContext,
} from "./authorization.types.js";

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly repository: AuthorizationRepository,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async authenticate(
    authorizationHeader: string | readonly string[] | undefined,
    requestId: string,
    allowPasswordChange = false,
  ): Promise<AuthorizationContext> {
    const token = readBearerToken(authorizationHeader);
    const claims = token === undefined ? undefined : this.accessTokens.verify(token);
    if (claims === undefined) {
      throw unauthenticatedError();
    }

    const principal = await this.repository.findPrincipal(claims.sub, claims.sid);
    if (principal === undefined) {
      throw unauthenticatedError();
    }
    if (
      principal.sessionRevokedAt !== null ||
      Date.parse(principal.sessionExpiresAt) <= Date.now() ||
      !isEligibleAuthPrincipal(principal) ||
      principal.homeTenantId !== claims.tid ||
      !isSystemRoleKey(principal.roleSystemKey)
    ) {
      throw unauthenticatedError();
    }

    const passwordChangeRequired = principal.mustChangePassword === true;
    if (passwordChangeRequired && !allowPasswordChange) {
      throw new ApplicationError({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Change your temporary password before continuing.",
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
    const permissions = passwordChangeRequired
      ? []
      : await this.repository.listPermissionKeys(principal.roleId);
    return Object.freeze({
      actorId: principal.userId,
      passwordChangeRequired,
      email: principal.email,
      isPlatformActor: principal.roleSystemKey === "SUPER_ADMIN",
      permissions: new Set(permissions),
      requestId,
      roleId: principal.roleId,
      roleName: principal.roleName,
      roleSystemKey: principal.roleSystemKey,
      sessionId: claims.sid,
      tenantId: principal.homeTenantId,
    });
  }
}

@Injectable()
export class TenantScopeService {
  requireTenantContext(context: AuthorizationContext): TenantRepositoryContext {
    if (
      context.isPlatformActor ||
      context.tenantId === null ||
      (context.roleSystemKey !== "TENANT_ADMIN" && context.roleSystemKey !== "TENANT_USER")
    ) {
      throw forbiddenError("Tenant content is available only to an active tenant member.");
    }
    return Object.freeze({
      actorId: context.actorId,
      permissions: context.permissions,
      requestId: context.requestId,
      roleSystemKey: context.roleSystemKey,
      sessionId: context.sessionId,
      tenantId: context.tenantId,
    }) as TenantRepositoryContext;
  }
}

export function forbiddenError(message = "You do not have permission to perform this action.") {
  return new ApplicationError({ code: "FORBIDDEN", message, statusCode: HttpStatus.FORBIDDEN });
}

function unauthenticatedError(): ApplicationError {
  return new ApplicationError({
    code: "UNAUTHENTICATED",
    message: "Authentication is required.",
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}

function readBearerToken(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u.exec(value);
  return match?.[1];
}

function isSystemRoleKey(value: string | null): value is SystemRoleKey {
  return value === "SUPER_ADMIN" || value === "TENANT_ADMIN" || value === "TENANT_USER";
}
