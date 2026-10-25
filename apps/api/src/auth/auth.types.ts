import type { CoreRuntimeConfig } from "@whatsapp-platform/config/runtime";

export interface AuthModuleConfig {
  readonly accessSecret: string;
  readonly accessTtlSeconds: number;
  readonly allowedOrigins: readonly string[];
  readonly cookieSecure: boolean;
  readonly loginEmailLimit: number;
  readonly loginIpLimit: number;
  readonly loginWindowSeconds: number;
  readonly refreshPepper: string;
  readonly refreshTtlSeconds: number;
  readonly redisKeyPrefix: string;
}

export function mapAuthModuleConfig(config: CoreRuntimeConfig): AuthModuleConfig {
  return Object.freeze({
    accessSecret: config.authentication.jwtAccessSecret,
    accessTtlSeconds: config.authentication.jwtAccessTtlSeconds,
    allowedOrigins: config.http.corsAllowedOrigins,
    cookieSecure: config.runtime.environment === "production",
    loginEmailLimit: config.authentication.loginEmailLimit,
    loginIpLimit: config.authentication.loginIpLimit,
    loginWindowSeconds: config.authentication.loginWindowSeconds,
    refreshPepper: config.authentication.refreshTokenPepper,
    refreshTtlSeconds: config.authentication.refreshTokenTtlSeconds,
    redisKeyPrefix: config.redis.queuePrefix,
  });
}

export interface AuthRequestContext {
  readonly ipAddress: string | null;
  readonly requestId: string;
  readonly userAgent: string | null;
}

export interface AuthPrincipalRecord {
  readonly displayName: string;
  readonly email: string;
  readonly homeTenantId: string | null;
  readonly membershipId: string | null;
  readonly membershipRoleId: string | null;
  readonly membershipTenantId: string | null;
  readonly passwordHash: string;
  readonly roleId: string;
  readonly roleIsDeleted: boolean;
  readonly roleSystemKey: string | null;
  readonly roleTenantId: string | null;
  readonly tenantIsDeleted: boolean | null;
  readonly tenantStatus: string | null;
  readonly tokenVersion: number;
  readonly twoFactorEnabled: boolean;
  readonly userId: string;
  readonly userStatus: string;
}

export interface AuthSessionRecord {
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly refreshTokenHash: string;
  readonly replacedBySessionId: string | null;
  readonly revokedAt: string | null;
  readonly tokenFamilyId: string;
  readonly userId: string;
}

export interface AccessTokenClaims {
  readonly aud: "whatsapp-saas-web";
  readonly exp: number;
  readonly iat: number;
  readonly iss: "whatsapp-saas-api";
  readonly sid: string;
  readonly sub: string;
  readonly tid: string | null;
}

export interface AuthenticationResult {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}
