export type * from "./campaigns.js";
export type * from "./conversations.js";
export type * from "./automations.js";
export type * from "./insights.js";
export type * from "./users.js";
export type * from "./whatsapp.js";
export type ServiceStatus = "initialized" | "ready" | "degraded";

export interface ServiceDescriptor {
  name: string;
  status: ServiceStatus;
  version: string;
}

export interface ApiSuccessEnvelope<TData> {
  readonly data: TData;
  readonly request_id: string;
}

export interface ApiErrorDetail {
  readonly code?: string;
  readonly field?: string;
  readonly message: string;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly request_id: string;
  readonly retryable: boolean;
  readonly details: readonly ApiErrorDetail[];
}

export interface ApiErrorEnvelope {
  readonly error: ApiError;
}

export interface AuthTokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly token_type: "Bearer";
}

export interface LogoutResponse {
  readonly logged_out: true;
}

export interface CurrentUserResponse {
  /** Live server-side gate; absent on older APIs. */
  readonly password_change_required?: boolean;
  /** Server capability profile, independent of role/permission grants. Absent on older full APIs. */
  readonly deployment_mode?: "full" | "preview";
  readonly email: string;
  readonly display_name: string;
  readonly id: string;
  readonly permissions: readonly string[];
  readonly role: {
    readonly name: string;
    readonly system_key: "SUPER_ADMIN" | "TENANT_ADMIN" | "TENANT_USER";
  };
  readonly subscription: {
    readonly ends_at: string | null;
    readonly plan: {
      readonly code: string;
      readonly feature_flags: Readonly<Record<string, unknown>>;
      readonly limits: Readonly<Record<string, unknown>>;
      readonly name: string;
    };
    readonly starts_at: string;
    readonly status: "ACTIVE" | "TRIAL";
  } | null;
  readonly tenant: {
    readonly default_country_code: string | null;
    readonly default_timezone: string;
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  } | null;
}

export interface SessionSummary {
  readonly created_at: string;
  readonly current: boolean;
  readonly expires_at: string;
  readonly id: string;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
}

export interface SessionListResponse {
  readonly sessions: readonly SessionSummary[];
}

export interface RevokeSessionResponse {
  readonly revoked: true;
}

export interface LivenessStatus {
  readonly service: string;
  readonly status: "ok";
  readonly timestamp: string;
}

export interface ReadinessStatus {
  readonly checks: {
    readonly configuration: "up";
    readonly database: "down" | "up";
    readonly redis: "down" | "up";
  };
  readonly service: string;
  readonly status: "not_ready" | "ready";
  readonly timestamp: string;
}
export type {
  OperationalExportKind,
  CampaignExportKind,
  AuditExportFilters,
  TenantReportExportRequest,
  PlatformReportExportRequest,
} from "./report-exports.js";
export type { CreateSuperAdminResponse } from "./super-admins.js";
