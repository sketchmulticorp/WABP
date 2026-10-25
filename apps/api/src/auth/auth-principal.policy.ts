export interface PrincipalEligibilityRecord {
  readonly homeTenantId: string | null;
  readonly membershipId: string | null;
  readonly membershipRoleId: string | null;
  readonly membershipTenantId: string | null;
  readonly roleId: string;
  readonly roleIsDeleted: boolean;
  readonly roleSystemKey: string | null;
  readonly roleTenantId: string | null;
  readonly tenantIsDeleted: boolean | null;
  readonly tenantStatus: string | null;
  readonly userStatus: string;
}

/** Central role/membership invariant shared by login and per-request authentication. */
export function isEligibleAuthPrincipal(principal: PrincipalEligibilityRecord): boolean {
  if (principal.userStatus !== "ACTIVE" || principal.roleIsDeleted) {
    return false;
  }
  if (principal.roleSystemKey === "SUPER_ADMIN") {
    return (
      principal.roleTenantId === null &&
      principal.homeTenantId === null &&
      principal.membershipId === null
    );
  }
  if (principal.roleSystemKey !== "TENANT_ADMIN" && principal.roleSystemKey !== "TENANT_USER") {
    return false;
  }
  return (
    principal.homeTenantId !== null &&
    principal.roleTenantId === principal.homeTenantId &&
    principal.membershipTenantId === principal.homeTenantId &&
    principal.membershipRoleId === principal.roleId &&
    principal.tenantStatus === "ACTIVE" &&
    principal.tenantIsDeleted === false
  );
}
