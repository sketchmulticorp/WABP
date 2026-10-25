import type { WhatsAppProviderErrorCode } from "./whatsapp-provider.types.js";
/** Provider-neutral error. Raw responses and recipient content never cross this boundary. */
export class WhatsAppProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly statusCode: number;
  readonly details = [];
  constructor(
    readonly providerCode: WhatsAppProviderErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.code = `WHATSAPP_PROVIDER_${providerCode}`;
    this.retryable = providerCode === "RATE_LIMITED" || providerCode === "TRANSIENT";
    this.statusCode =
      providerCode === "RATE_LIMITED" ? 429 : providerCode === "TRANSIENT" ? 503 : 422;
  }
}
export function normalizeWhatsAppProviderError(input: {
  readonly httpStatus?: number;
  readonly retryAfterSeconds?: number;
  readonly type?: string;
}): WhatsAppProviderError {
  const code: WhatsAppProviderErrorCode =
    input.httpStatus === 401
      ? "AUTHENTICATION"
      : input.httpStatus === 403
        ? "AUTHORIZATION"
        : input.httpStatus === 429
          ? "RATE_LIMITED"
          : input.httpStatus !== undefined && input.httpStatus >= 500
            ? "TRANSIENT"
            : input.httpStatus !== undefined && input.httpStatus >= 400
              ? "VALIDATION"
              : input.type === "configuration"
                ? "CONFIGURATION"
                : "UNKNOWN";
  return new WhatsAppProviderError(
    code,
    "The WhatsApp provider request could not be completed.",
    input.retryAfterSeconds,
  );
}
