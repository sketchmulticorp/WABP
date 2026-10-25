import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import { AccessTokenService } from "../auth/access-token.service.js";
import type { AuthModuleConfig } from "../auth/auth.types.js";
import type { AuthorizationRepository } from "./authorization.repository.js";
import { PermissionGuard } from "./permission.guard.js";
import { AuthorizationService, TenantScopeService } from "./authorization.service.js";
import type {
  AuthenticatedPrincipalRecord,
  AuthenticatedRequest,
  AuthorizationContext,
} from "./authorization.types.js";

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

const tenantId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000020";
const sessionId = "00000000-0000-4000-8000-000000000030";
const roleId = "00000000-0000-4000-8000-000000000040";

const activeTenantPrincipal: AuthenticatedPrincipalRecord = {
  email: "doctor@example.test",
  homeTenantId: tenantId,
  membershipId: "00000000-0000-4000-8000-000000000050",
  membershipRoleId: roleId,
  membershipTenantId: tenantId,
  roleId,
  roleIsDeleted: false,
  roleName: "Tenant Admin",
  roleSystemKey: "TENANT_ADMIN",
  roleTenantId: tenantId,
  sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  sessionRevokedAt: null,
  tenantIsDeleted: false,
  tenantStatus: "ACTIVE",
  userId,
  userStatus: "ACTIVE",
};

void test("pending password change denies feature access and allows only restricted authentication", async () => {
  const accessTokens = new AccessTokenService(config);
  const token = accessTokens.sign({ sessionId, tenantId, userId }).token;
  const service = new AuthorizationService(
    repositoryReturning({ ...activeTenantPrincipal, mustChangePassword: true }, ["contact.read"]),
    accessTokens,
  );
  await assert.rejects(
    () => service.authenticate(`Bearer ${token}`, "password-gate"),
    hasCode("PASSWORD_CHANGE_REQUIRED"),
  );
  const restricted = await service.authenticate(`Bearer ${token}`, "password-gate", true);
  assert.equal(restricted.passwordChangeRequired, true);
  assert.equal(restricted.permissions.size, 0);
});

void test("builds server-side authorization context from a live session and active membership", async () => {
  const repository = repositoryReturning(activeTenantPrincipal, ["contact.read", "tenant.read"]);
  const accessTokens = new AccessTokenService(config);
  const token = accessTokens.sign({ sessionId, tenantId, userId }).token;
  const service = new AuthorizationService(repository, accessTokens);

  const context = await service.authenticate(`Bearer ${token}`, "request-1");

  assert.equal(context.actorId, userId);
  assert.equal(context.tenantId, tenantId);
  assert.equal(context.roleSystemKey, "TENANT_ADMIN");
  assert.equal(context.permissions.has("contact.read"), true);
  assert.equal(new TenantScopeService().requireTenantContext(context).tenantId, tenantId);
});

void test("rejects revoked sessions, tenant-claim mismatches, and platform tenant-content access", async () => {
  const accessTokens = new AccessTokenService(config);
  const revoked = { ...activeTenantPrincipal, sessionRevokedAt: new Date().toISOString() };
  const revokedService = new AuthorizationService(repositoryReturning(revoked, []), accessTokens);
  const token = accessTokens.sign({ sessionId, tenantId, userId }).token;

  await assert.rejects(
    () => revokedService.authenticate(`Bearer ${token}`, "request-2"),
    hasCode("UNAUTHENTICATED"),
  );

  const mismatchedToken = accessTokens.sign({
    sessionId,
    tenantId: "00000000-0000-4000-8000-000000000099",
    userId,
  }).token;
  const activeService = new AuthorizationService(
    repositoryReturning(activeTenantPrincipal, []),
    accessTokens,
  );
  await assert.rejects(
    () => activeService.authenticate(`Bearer ${mismatchedToken}`, "request-3"),
    hasCode("UNAUTHENTICATED"),
  );

  const platformContext: AuthorizationContext = {
    actorId: userId,
    email: "owner@example.test",
    isPlatformActor: true,
    permissions: new Set(["platform.dashboard.read"]),
    requestId: "request-4",
    roleId,
    roleName: "Super Admin",
    roleSystemKey: "SUPER_ADMIN",
    sessionId,
    tenantId: null,
  };
  assert.throws(
    () => new TenantScopeService().requireTenantContext(platformContext),
    hasCode("FORBIDDEN"),
  );
});

void test("requires every permission declared by a protected route", () => {
  const reflector = {
    getAllAndOverride: () => ["contact.read", "contact.write"],
  } as unknown as Reflector;
  const guard = new PermissionGuard(reflector);
  const context = authorizationContext(new Set(["contact.read"]));
  const executionContext = executionContextFor({ authContext: context });

  assert.throws(() => guard.canActivate(executionContext), hasCode("FORBIDDEN"));
  const allowedExecutionContext = executionContextFor({
    authContext: authorizationContext(new Set(["contact.read", "contact.write"])),
  });
  assert.equal(guard.canActivate(allowedExecutionContext), true);
});

function repositoryReturning(
  principal: AuthenticatedPrincipalRecord,
  permissions: readonly string[],
): AuthorizationRepository {
  return {
    findPrincipal: () => Promise.resolve(principal),
    listPermissionKeys: () => Promise.resolve(permissions),
  } as unknown as AuthorizationRepository;
}

function authorizationContext(permissions: ReadonlySet<string>): AuthorizationContext {
  return {
    actorId: userId,
    email: activeTenantPrincipal.email,
    isPlatformActor: false,
    permissions,
    requestId: "request-5",
    roleId,
    roleName: "Tenant Admin",
    roleSystemKey: "TENANT_ADMIN",
    sessionId,
    tenantId,
  };
}

function executionContextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getClass: () => PermissionGuard,
    getHandler: () => (): void => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && "code" in error && error.code === expected;
}
