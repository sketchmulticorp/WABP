import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export interface RequestWithId extends IncomingMessage {
  readonly id: string;
}

/**
 * Preserves a safe upstream correlation ID and rejects values that could pollute
 * logs or response headers. Missing or invalid IDs are replaced with a UUID.
 */
export function assignRequestId(request: IncomingMessage, response: ServerResponse): string {
  const suppliedRequestId = request.headers[REQUEST_ID_HEADER];
  const requestId = isValidRequestId(suppliedRequestId) ? suppliedRequestId : randomUUID();

  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}
