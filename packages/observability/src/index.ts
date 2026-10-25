import type { DynamicModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import type { IncomingMessage, ServerResponse } from "node:http";
import pino from "pino";

export interface LoggingModuleOptions {
  readonly serviceName: string;
  readonly level: pino.LevelWithSilent;
  readonly requestIdFactory?: (request: IncomingMessage, response: ServerResponse) => string;
}

const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_LOG_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-api-key",
  "req.headers.x-bootstrap-secret",
  "*.bootstrapSecret",
  "res.headers.set-cookie",
  "*.accessToken",
  "*.access_token",
  "*.authorization",
  "*.cookie",
  "*.dataEncryptionKey",
  "*.password",
  "*.current_password",
  "*.new_password",
  "*.currentPassword",
  "*.newPassword",
  "*.refreshToken",
  "*.refresh_token",
  "*.secret",
  "*.secretAccessKey",
  "*.token",
  "*.encryptedToken",
  "*.encrypted_token",
  "*.credentialEncryption",
  "*.WHATSAPP_CREDENTIAL_KEYRING",
  "*.nonce",
  "*.client_secret",
  "*.input_token",
  "*.appSecret",
] as const;

/**
 * Creates the one structured logger module shared by HTTP and background services.
 * Request serializers deliberately omit query strings, headers, and bodies because those
 * fields can carry credentials, contact identifiers, or message content.
 */
export function createLoggingModule(options: LoggingModuleOptions): DynamicModule {
  return LoggerModule.forRoot({
    pinoHttp: {
      base: { service: options.serviceName },
      customAttributeKeys: {
        responseTime: "latency_ms",
      },
      genReqId: options.requestIdFactory,
      level: options.level,
      redact: {
        censor: REDACTED_VALUE,
        paths: [...SENSITIVE_LOG_PATHS],
      },
      serializers: {
        err: pino.stdSerializers.err,
        req: (request: IncomingMessage & { id?: string }) => ({
          id: request.id,
          method: request.method,
          path: request.url?.split("?", 1)[0],
        }),
        res: (response: ServerResponse) => ({
          statusCode: response.statusCode,
        }),
      },
    },
  });
}
