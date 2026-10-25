export type BootstrapErrorCode =
  | "BOOTSTRAP_DISABLED"
  | "BOOTSTRAP_DENIED"
  | "BOOTSTRAP_CLOSED"
  | "BOOTSTRAP_CATALOG_CONFLICT"
  | "BOOTSTRAP_RATE_LIMITED"
  | "BOOTSTRAP_UNAVAILABLE";

/** Pure application failure; HTTP mapping belongs to the controller. */
export class BootstrapError extends Error {
  constructor(readonly code: BootstrapErrorCode) {
    super(code);
    this.name = "BootstrapError";
  }
}
