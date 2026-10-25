import assert from "node:assert/strict";
import test from "node:test";

import type { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { AccessTokenService } from "./access-token.service.js";
import type { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import type { AuthModuleConfig, AuthPrincipalRecord, AuthSessionRecord } from "./auth.types.js";
import type { LoginRateLimiterAdapter } from "./login-rate-limiter.adapter.js";
import { RefreshTokenService } from "./refresh-token.service.js";

const config: AuthModuleConfig = {
  accessSecret: "test-access-secret-that-is-at-least-thirty-two-characters",
  accessTtlSeconds: 900,
  allowedOrigins: ["http://localhost:3000"],
  cookieSecure: false,
  loginEmailLimit: 10,
  loginIpLimit: 100,
  loginWindowSeconds: 900,
  refreshPepper: "test-refresh-pepper-that-is-at-least-thirty-two-characters",
  refreshTtlSeconds: 2_592_000,
  redisKeyPrefix: "test",
};

const principal: AuthPrincipalRecord = {
  displayName: "Example Doctor",
  email: "doctor@example.test",
  homeTenantId: "00000000-0000-4000-8000-000000000010",
  membershipId: "00000000-0000-4000-8000-000000000020",
  membershipRoleId: "00000000-0000-4000-8000-000000000030",
  membershipTenantId: "00000000-0000-4000-8000-000000000010",
  passwordHash: "stored-password-hash",
  roleId: "00000000-0000-4000-8000-000000000030",
  roleIsDeleted: false,
  roleSystemKey: "TENANT_ADMIN",
  roleTenantId: "00000000-0000-4000-8000-000000000010",
  tenantIsDeleted: false,
  tenantStatus: "ACTIVE",
  tokenVersion: 1,
  twoFactorEnabled: false,
  userId: "00000000-0000-4000-8000-000000000040",
  userStatus: "ACTIVE",
};

void test("logs in, rotates without extending absolute expiry, and revokes the family on reuse", async () => {
  const sessions: AuthSessionRecord[] = [];
  const auditActions: string[] = [];
  const repository = {
    lockUserAuthentication: () => Promise.resolve(),
    findRefreshOwner: (hash: string) =>
      Promise.resolve(sessions.find((session) => session.refreshTokenHash === hash)?.userId),
    findPrincipalByEmail: (email: string) =>
      Promise.resolve(email === principal.email ? principal : undefined),
    findPrincipalById: () => Promise.resolve(principal),
    createSession: (_executor: unknown, input: AuthSessionRecord) => {
      const session: AuthSessionRecord = {
        ...input,
        createdAt: new Date().toISOString(),
        replacedBySessionId: null,
        revokedAt: null,
      };
      sessions.push(session);
      return Promise.resolve(session);
    },
    findSessionByHashForUpdate: (_executor: unknown, hash: string) =>
      Promise.resolve(sessions.find((session) => session.refreshTokenHash === hash)),
    rotateSession: (
      _executor: unknown,
      currentId: string,
      input: AuthSessionRecord,
      revokedAt: string,
    ) => {
      const current = sessions.find((session) => session.id === currentId);
      assert.ok(current);
      const replacement: AuthSessionRecord = {
        ...input,
        createdAt: new Date().toISOString(),
        replacedBySessionId: null,
        revokedAt: null,
      };
      Object.assign(current, { replacedBySessionId: replacement.id, revokedAt });
      sessions.push(replacement);
      return Promise.resolve(replacement);
    },
    revokeSession: (_executor: unknown, sessionId: string, revokedAt: string) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (session !== undefined) Object.assign(session, { revokedAt });
      return Promise.resolve();
    },
    revokeTokenFamily: (_executor: unknown, familyId: string, revokedAt: string) => {
      for (const session of sessions.filter((item) => item.tokenFamilyId === familyId)) {
        Object.assign(session, { revokedAt });
      }
      return Promise.resolve();
    },
    updateLastLogin: () => Promise.resolve(),
    recordAudit: (_executor: unknown, input: { readonly action: string }) => {
      auditActions.push(input.action);
      return Promise.resolve();
    },
  } as unknown as AuthRepository;
  const transactions = {
    execute: async <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>): Promise<T> =>
      work({} as AppDatabaseTransaction),
  } as unknown as DatabaseTransactionManager;
  const passwordHasher = {
    verify: (password: string) => Promise.resolve(password === "Correct!Password123"),
  } as unknown as Argon2idPasswordHasher;
  const limiter = {
    consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 1 }),
    resetEmail: () => Promise.resolve(),
  } as unknown as LoginRateLimiterAdapter;
  const refreshTokens = new RefreshTokenService(config);
  const service = new AuthService(
    repository,
    transactions,
    passwordHasher,
    new AccessTokenService(config),
    refreshTokens,
    limiter,
    config,
  );
  const context = { ipAddress: "127.0.0.1", requestId: "request-1", userAgent: "test" };

  const login = await service.login(
    { email: principal.email, password: "Correct!Password123" },
    context,
  );
  const originalExpiry = login.refreshTokenExpiresAt;
  const refreshed = await service.refresh(login.refreshToken, context);

  assert.equal(refreshed.refreshTokenExpiresAt, originalExpiry);
  assert.notEqual(refreshed.refreshToken, login.refreshToken);
  assert.equal(sessions.length, 2);
  await assert.rejects(
    () => service.refresh(login.refreshToken, context),
    (error: unknown) => {
      return error instanceof Error && "code" in error && error.code === "INVALID_SESSION";
    },
  );
  assert.equal(
    sessions.every((session) => session.revokedAt !== null),
    true,
  );
  assert.deepEqual(auditActions, ["LOGIN", "REFRESH_TOKEN_REUSE"]);
});
