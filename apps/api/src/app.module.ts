import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { SERVICE_NAMES } from "@whatsapp-platform/config";
import type { ApiRuntimeConfig } from "@whatsapp-platform/config/runtime";
import { createLoggingModule } from "@whatsapp-platform/observability";

import { AppController } from "./app.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter.js";
import { assignRequestId } from "./common/http/request-id.js";
import { ResponseEnvelopeInterceptor } from "./common/http/response-envelope.interceptor.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { HealthRepository } from "./health/health.repository.js";
import { HealthService } from "./health/health.service.js";
import { RedisHealthAdapter } from "./health/redis-health.adapter.js";
import { RedisModule } from "./redis/redis.module.js";
import { WebhookModule } from "./webhooks/webhook.module.js";

@Module({})
export class AppModule {
  /** Builds the root module from already validated configuration. */
  static register(config: ApiRuntimeConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        createLoggingModule({
          level: config.runtime.logLevel,
          requestIdFactory: assignRequestId,
          serviceName: SERVICE_NAMES.api,
        }),
        DatabaseModule.register(config.database),
        RedisModule.register(config.redis),
        AuthModule.register(config),
        ...(config.deploymentMode === "preview" ? [] : [WebhookModule.register(config)]),
      ],
      controllers: [AppController, HealthController],
      providers: [
        {
          provide: APP_FILTER,
          useClass: ApiExceptionFilter,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: ResponseEnvelopeInterceptor,
        },
        HealthRepository,
        RedisHealthAdapter,
        HealthService,
      ],
    };
  }
}
