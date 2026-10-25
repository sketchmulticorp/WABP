export interface TenantUserSummary {
  readonly created_at: string;
  readonly display_name: string;
  readonly email: string;
  readonly id: string;
  readonly role: "TENANT_ADMIN" | "TENANT_USER";
  readonly status: "ACTIVE" | "DISABLED" | "INVITED" | "LOCKED";
}

export interface TenantUserListResponse {
  readonly users: readonly TenantUserSummary[];
}

export interface CreateTenantUserResponse {
  readonly user: TenantUserSummary;
}

export interface TenantUserStatusResponse {
  readonly user: TenantUserSummary;
}

export interface DeleteTenantUserResponse {
  readonly deleted: true;
  readonly id: string;
}

export interface PlatformTenantCreationResponse {
  readonly admin: {
    readonly displayName: string;
    readonly email: string;
    readonly id: string;
  };
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly status: string;
  };
}
