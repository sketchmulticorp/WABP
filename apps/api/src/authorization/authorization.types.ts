import type { IncomingHttpHeaders } from "node:http";

import type { RequestWithId } from "../common/http/request-id.js";

export type SystemRoleKey = "SUPER_ADMIN" | "TENANT_ADMIN" | "TENANT_USER";

export interface AuthorizationContext {
  readonly passwordChangeRequired?: boolean;
  readonly actorId: string;
  readonly email: string;
  readonly isPlatformActor: boolean;
  readonly permissions: ReadonlySet<string>;
  readonly requestId: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly roleSystemKey: SystemRoleKey;
  readonly sessionId: string;
  readonly tenantId: string | null;
}

declare const tenantRepositoryContextBrand: unique symbol;

/** Only TenantScopeService can produce this context for tenant-owned repositories. */
export interface TenantRepositoryContext {
  readonly actorId: string;
  readonly permissions: ReadonlySet<string>;
  readonly requestId: string;
  readonly roleSystemKey: "TENANT_ADMIN" | "TENANT_USER";
  readonly sessionId: string;
  readonly tenantId: string;
  readonly [tenantRepositoryContextBrand]: true;
}

export interface AuthenticatedRequest extends RequestWithId {
  authContext?: AuthorizationContext;
  readonly headers: IncomingHttpHeaders;
}

export interface AuthenticatedPrincipalRecord {
  readonly mustChangePassword?: boolean;
  readonly email: string;
  readonly homeTenantId: string | null;
  readonly membershipId: string | null;
  readonly membershipRoleId: string | null;
  readonly membershipTenantId: string | null;
  readonly roleId: string;
  readonly roleIsDeleted: boolean;
  readonly roleName: string;
  readonly roleSystemKey: string | null;
  readonly roleTenantId: string | null;
  readonly sessionExpiresAt: string;
  readonly sessionRevokedAt: string | null;
  readonly tenantIsDeleted: boolean | null;
  readonly tenantStatus: string | null;
  readonly userId: string;
  readonly userStatus: string;
}
