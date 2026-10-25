import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ApplicationError } from "../common/errors/application-error.js";
import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { AUTH_CONFIG } from "./auth.constants.js";
import { isEligibleAuthPrincipal } from "./auth-principal.policy.js";
import { AccessTokenService } from "./access-token.service.js";
import { AuthRepository } from "./auth.repository.js";
import type {
  AuthenticationResult,
  AuthModuleConfig,
  AuthPrincipalRecord,
  AuthRequestContext,
  AuthSessionRecord,
} from "./auth.types.js";
import type { LoginInput } from "./auth.dto.js";
import { LoginRateLimiterAdapter } from "./login-rate-limiter.adapter.js";
import { RefreshTokenService } from "./refresh-token.service.js";

interface AuthenticationTransactionResult {
  readonly principal: AuthPrincipalRecord;
  readonly session: AuthSessionRecord;
}

type RefreshTransactionResult =
  | { readonly kind: "invalid" }
  | { readonly kind: "reuse" }
  | ({ readonly kind: "success" } & AuthenticationTransactionResult);

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly passwordHasher: Argon2idPasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly rateLimiter: LoginRateLimiterAdapter,
    @Inject(AUTH_CONFIG) private readonly config: AuthModuleConfig,
  ) {}

  async login(input: LoginInput, context: AuthRequestContext): Promise<AuthenticationResult> {
    await this.enforceLoginRateLimit(input.email, context.ipAddress ?? "unknown");
    const principal = await this.repository.findPrincipalByEmail(input.email);
    const passwordMatches = await this.passwordHasher.verify(
      input.password,
      principal?.passwordHash,
    );

    if (!passwordMatches || principal === undefined || !isEligibleAuthPrincipal(principal)) {
      await this.recordDeniedLogin(principal, context);
      throw invalidCredentialsError();
    }
    if (principal.twoFactorEnabled) {
      await this.recordAudit(principal, context, "LOGIN", "DENIED", { reason: "2fa_required" });
      throw new ApplicationError({
        code: "TWO_FACTOR_REQUIRED",
        message: "Two-factor authentication is required for this account.",
        statusCode: HttpStatus.FORBIDDEN,
      });
    }

    const refreshToken = this.refreshTokens.generate();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.refreshTtlSeconds * 1_000).toISOString();
    const authenticated = await this.transactions.execute(
      async (transaction) => {
        await this.repository.lockUserAuthentication(transaction, principal.userId);
        const currentPrincipal = await this.repository.findPrincipalById(
          transaction,
          principal.userId,
        );
        if (
          currentPrincipal === undefined ||
          !isEligibleAuthPrincipal(currentPrincipal) ||
          currentPrincipal.twoFactorEnabled ||
          currentPrincipal.passwordHash !== principal.passwordHash ||
          currentPrincipal.tokenVersion !== principal.tokenVersion
        ) {
          return undefined;
        }
        const session = await this.repository.createSession(transaction, {
          expiresAt,
          id: randomUUID(),
          ipAddress: context.ipAddress,
          refreshTokenHash: this.refreshTokens.digest(refreshToken),
          tokenFamilyId: randomUUID(),
          userAgent: context.userAgent,
          userId: currentPrincipal.userId,
        });
        await this.repository.updateLastLogin(
          transaction,
          currentPrincipal.userId,
          now.toISOString(),
        );
        await this.repository.recordAudit(
          transaction,
          auditInput(currentPrincipal, context, {
            action: "LOGIN",
            entityId: session.id,
            metadata: {},
            result: "SUCCESS",
          }),
        );
        return { principal: currentPrincipal, session };
      },
      { isolationLevel: "read committed" },
    );

    if (authenticated === undefined) {
      throw invalidCredentialsError();
    }
    await this.rateLimiter.resetEmail(input.email).catch(() => undefined);
    return this.buildAuthenticationResult(authenticated, refreshToken);
  }

  async refresh(
    refreshToken: string | undefined,
    context: AuthRequestContext,
  ): Promise<AuthenticationResult> {
    if (refreshToken === undefined) {
      throw invalidSessionError();
    }

    const nextRefreshToken = this.refreshTokens.generate();
    const refreshDigest = this.refreshTokens.digest(refreshToken);
    const ownerId = await this.repository.findRefreshOwner(refreshDigest);
    if (ownerId === undefined) throw invalidSessionError();
    const now = new Date().toISOString();
    const result = await this.transactions.execute<RefreshTransactionResult>(
      async (transaction) => {
        // Lock user before session rows, matching password-change lock order.
        await this.repository.lockUserAuthentication(transaction, ownerId);
        const current = await this.repository.findSessionByHashForUpdate(
          transaction,
          refreshDigest,
        );
        if (current === undefined) {
          return { kind: "invalid" };
        }

        if (current.revokedAt !== null || current.replacedBySessionId !== null) {
          await this.repository.revokeTokenFamily(transaction, current.tokenFamilyId, now);
          const principal = await this.repository.findPrincipalById(transaction, current.userId);
          await this.recordReuseAudit(transaction, principal, current, context);
          return { kind: "reuse" };
        }
        if (Date.parse(current.expiresAt) <= Date.parse(now)) {
          await this.repository.revokeSession(transaction, current.id, now);
          return { kind: "invalid" };
        }

        const principal = await this.repository.findPrincipalById(transaction, current.userId);
        if (
          principal === undefined ||
          !isEligibleAuthPrincipal(principal) ||
          principal.twoFactorEnabled
        ) {
          await this.repository.revokeTokenFamily(transaction, current.tokenFamilyId, now);
          return { kind: "invalid" };
        }
        const replacement = await this.repository.rotateSession(
          transaction,
          current.id,
          {
            expiresAt: current.expiresAt,
            id: randomUUID(),
            ipAddress: context.ipAddress,
            refreshTokenHash: this.refreshTokens.digest(nextRefreshToken),
            tokenFamilyId: current.tokenFamilyId,
            userAgent: context.userAgent,
            userId: current.userId,
          },
          now,
        );
        return { kind: "success", principal, session: replacement };
      },
      { isolationLevel: "read committed" },
    );

    if (result.kind !== "success") {
      throw invalidSessionError();
    }
    return this.buildAuthenticationResult(result, nextRefreshToken);
  }

  async logout(refreshToken: string | undefined, context: AuthRequestContext): Promise<void> {
    if (refreshToken === undefined) {
      return;
    }
    const now = new Date().toISOString();
    await this.transactions.execute(async (transaction) => {
      const session = await this.repository.findSessionByHashForUpdate(
        transaction,
        this.refreshTokens.digest(refreshToken),
      );
      if (session === undefined) {
        return;
      }
      await this.repository.revokeTokenFamily(transaction, session.tokenFamilyId, now);
      const principal = await this.repository.findPrincipalById(transaction, session.userId);
      if (principal !== undefined) {
        await this.repository.recordAudit(
          transaction,
          auditInput(principal, context, {
            action: "LOGOUT",
            entityId: session.id,
            metadata: {},
            result: "SUCCESS",
          }),
        );
      }
    });
  }

  private buildAuthenticationResult(
    authenticated: AuthenticationTransactionResult,
    refreshToken: string,
  ): AuthenticationResult {
    const access = this.accessTokens.sign({
      sessionId: authenticated.session.id,
      tenantId: authenticated.principal.homeTenantId,
      userId: authenticated.principal.userId,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresIn: this.config.accessTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: authenticated.session.expiresAt,
    };
  }

  private async enforceLoginRateLimit(email: string, ipAddress: string): Promise<void> {
    let result;
    try {
      result = await this.rateLimiter.consume(email, ipAddress);
    } catch {
      throw new ApplicationError({
        code: "AUTHENTICATION_UNAVAILABLE",
        message: "Authentication is temporarily unavailable.",
        retryable: true,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
    if (!result.allowed) {
      throw new ApplicationError({
        code: "RATE_LIMITED",
        details: [{ code: "RETRY_AFTER", message: String(result.retryAfterSeconds) }],
        message: "Too many login attempts. Try again later.",
        retryable: true,
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      });
    }
  }

  private async recordDeniedLogin(
    principal: AuthPrincipalRecord | undefined,
    context: AuthRequestContext,
  ): Promise<void> {
    if (principal === undefined) {
      return;
    }
    await this.recordAudit(principal, context, "LOGIN", "DENIED", {
      reason: "invalid_credentials",
    });
  }

  private recordAudit(
    principal: AuthPrincipalRecord,
    context: AuthRequestContext,
    action: string,
    result: "DENIED" | "FAILED" | "SUCCESS",
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    return this.transactions.execute((transaction) =>
      this.repository.recordAudit(
        transaction,
        auditInput(principal, context, {
          action,
          entityId: null,
          metadata,
          result,
        }),
      ),
    );
  }

  private async recordReuseAudit(
    transaction: AppDatabaseTransaction,
    principal: AuthPrincipalRecord | undefined,
    session: AuthSessionRecord,
    context: AuthRequestContext,
  ): Promise<void> {
    if (principal === undefined) {
      return;
    }
    await this.repository.recordAudit(
      transaction,
      auditInput(principal, context, {
        action: "REFRESH_TOKEN_REUSE",
        entityId: session.id,
        metadata: { token_family_revoked: true },
        result: "DENIED",
      }),
    );
  }
}

function auditInput(
  principal: AuthPrincipalRecord,
  context: AuthRequestContext,
  event: {
    readonly action: string;
    readonly entityId: string | null;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly result: "DENIED" | "FAILED" | "SUCCESS";
  },
) {
  return {
    action: event.action,
    actorId: principal.userId,
    actorRole: principal.roleSystemKey,
    entityId: event.entityId,
    ipAddress: context.ipAddress,
    metadata: event.metadata,
    requestId: context.requestId,
    result: event.result,
    tenantId: principal.homeTenantId,
    userAgent: context.userAgent,
  } as const;
}

function invalidCredentialsError(): ApplicationError {
  return new ApplicationError({
    code: "INVALID_CREDENTIALS",
    message: "The email or password is incorrect.",
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}

function invalidSessionError(): ApplicationError {
  return new ApplicationError({
    code: "INVALID_SESSION",
    message: "The authentication session is invalid or expired.",
    statusCode: HttpStatus.UNAUTHORIZED,
  });
}
