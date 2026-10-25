export type PasswordChangeErrorCode =
  | "PASSWORD_CHANGE_NOT_REQUIRED"
  | "CURRENT_PASSWORD_INVALID"
  | "NEW_PASSWORD_REUSED"
  | "PASSWORD_CHANGE_SESSION_INVALID"
  | "PASSWORD_CHANGE_RATE_LIMITED"
  | "PASSWORD_CHANGE_UNAVAILABLE";

/** Domain failure without HTTP or persistence details. */
export class PasswordChangeError extends Error {
  constructor(readonly code: PasswordChangeErrorCode) {
    super(code);
    this.name = "PasswordChangeError";
  }
}
