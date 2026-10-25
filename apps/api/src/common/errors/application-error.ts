import type { ApiErrorDetail } from "@whatsapp-platform/contracts";

export interface ApplicationErrorOptions {
  readonly code: string;
  readonly details?: readonly ApiErrorDetail[];
  readonly message: string;
  readonly retryable?: boolean;
  readonly statusCode: number;
}

/**
 * Represents a safe, deliberate application failure that may cross the HTTP boundary.
 * Infrastructure and provider exceptions must be normalized before constructing this error.
 */
export class ApplicationError extends Error {
  public readonly code: string;
  public readonly details: readonly ApiErrorDetail[];
  public readonly retryable: boolean;
  public readonly statusCode: number;

  public constructor(options: ApplicationErrorOptions) {
    super(options.message);
    this.name = "ApplicationError";
    this.code = options.code;
    this.details = Object.freeze([...(options.details ?? [])]);
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode;
  }
}
