import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { PinoLogger } from "nestjs-pino";

import type { RequestWithId } from "../http/request-id.js";
import { mapExceptionToApiError } from "./error-response.factory.js";

const SERVER_ERROR_STATUS_MINIMUM = 500;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<RequestWithId>();
    const response = httpContext.getResponse<unknown>();
    const mappedError = mapExceptionToApiError(exception, request.id);
    const logContext = {
      errorCode: mappedError.envelope.error.code,
      event: "http_request_failed",
      method: request.method,
      path: request.url?.split("?", 1)[0],
      requestId: request.id,
      statusCode: mappedError.statusCode,
    };

    if (mappedError.statusCode >= SERVER_ERROR_STATUS_MINIMUM) {
      this.logger.error({ ...logContext, err: normalizeError(exception) }, "HTTP request failed");
    } else {
      this.logger.warn(logContext, "HTTP request rejected");
    }

    this.httpAdapterHost.httpAdapter.reply(response, mappedError.envelope, mappedError.statusCode);
  }
}

function normalizeError(exception: unknown): Error {
  return exception instanceof Error ? exception : new Error("A non-Error value was thrown");
}
