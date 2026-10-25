export type SuperAdminErrorCode =
  | "SUPER_ADMIN_FORBIDDEN"
  | "SUPER_ADMIN_EMAIL_UNAVAILABLE"
  | "SUPER_ADMIN_RATE_LIMITED"
  | "SUPER_ADMIN_CREATE_UNAVAILABLE";

export class SuperAdminError extends Error {
  constructor(readonly code: SuperAdminErrorCode) {
    super(code);
    this.name = "SuperAdminError";
  }
}
