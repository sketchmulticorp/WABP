import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorDetail, ApiErrorEnvelope } from "@whatsapp-platform/contracts";

import { ApplicationError } from "./application-error.js";
import { WhatsAppProviderError } from "@whatsapp-platform/whatsapp-provider";

export interface MappedApiError {
  readonly envelope: ApiErrorEnvelope;
  readonly statusCode: number;
}

const HTTP_ERROR_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION_FAILED",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHENTICATED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "RESOURCE_NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "PAYLOAD_TOO_LARGE",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
  [HttpStatus.GATEWAY_TIMEOUT]: "GATEWAY_TIMEOUT",
};

const HTTP_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "The request is invalid.",
  [HttpStatus.UNAUTHORIZED]: "Authentication is required.",
  [HttpStatus.FORBIDDEN]: "You do not have permission to perform this action.",
  [HttpStatus.NOT_FOUND]: "The requested resource was not found.",
  [HttpStatus.CONFLICT]: "The request conflicts with the current resource state.",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "The request payload is too large.",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too many requests. Try again later.",
  [HttpStatus.SERVICE_UNAVAILABLE]: "The service is temporarily unavailable.",
  [HttpStatus.GATEWAY_TIMEOUT]: "A required service timed out.",
};

const RETRYABLE_HTTP_STATUSES = new Set<number>([
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.SERVICE_UNAVAILABLE,
  HttpStatus.GATEWAY_TIMEOUT,
]);

const BAD_REQUEST_STATUS = 400;

export function mapExceptionToApiError(exception: unknown, requestId: string): MappedApiError {
  // Express body-parser errors are not Nest HttpExceptions. Preserve the approved
  // size-limit response without trusting arbitrary status fields or exposing body data.
  if (
    exception instanceof Error &&
    "type" in exception &&
    exception.type === "entity.too.large" &&
    "status" in exception &&
    exception.status === HttpStatus.PAYLOAD_TOO_LARGE
  ) {
    return createMappedError({
      code: "PAYLOAD_TOO_LARGE",
      details: [],
      message: "The request payload is too large.",
      requestId,
      retryable: false,
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  }
  if (exception instanceof ApplicationError || exception instanceof WhatsAppProviderError) {
    return createMappedError({
      code: exception.code,
      details: exception.details,
      message: exception.message,
      requestId,
      retryable: exception.retryable,
      statusCode: exception.statusCode,
    });
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    return createMappedError({
      code: HTTP_ERROR_CODES[statusCode] ?? "HTTP_REQUEST_FAILED",
      details: extractValidationDetails(exception),
      message: HTTP_ERROR_MESSAGES[statusCode] ?? "The request could not be completed.",
      requestId,
      retryable: RETRYABLE_HTTP_STATUSES.has(statusCode),
      statusCode,
    });
  }

  return createMappedError({
    code: "INTERNAL_ERROR",
    details: [],
    message: "An unexpected error occurred.",
    requestId,
    retryable: false,
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  });
}

function extractValidationDetails(exception: HttpException): readonly ApiErrorDetail[] {
  if (exception.getStatus() !== BAD_REQUEST_STATUS) {
    return [];
  }

  const response = exception.getResponse();
  if (!isObject(response) || !Array.isArray(response.message)) {
    return [];
  }

  return response.message
    .filter((message): message is string => typeof message === "string")
    .map((message) => ({ message }));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createMappedError(options: {
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];
  readonly message: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly statusCode: number;
}): MappedApiError {
  return {
    envelope: {
      error: {
        code: options.code,
        details: options.details,
        message: options.message,
        request_id: options.requestId,
        retryable: options.retryable,
      },
    },
    statusCode: options.statusCode,
  };
}
