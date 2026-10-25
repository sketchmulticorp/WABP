import { type DynamicModule, Module } from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";

import { META_WEBHOOK_CONFIG } from "./webhook.constants.js";
import { WebhookController } from "./webhook.controller.js";
import { WebhookRepository } from "./webhook.repository.js";
import { WebhookService } from "./webhook.service.js";

@Module({})
export class WebhookModule {
  static register(config: RuntimeConfig): DynamicModule {
    return {
      module: WebhookModule,
      controllers: [WebhookController],
      providers: [
        {
          provide: META_WEBHOOK_CONFIG,
          useValue: Object.freeze({
            appSecret: config.meta.appSecret,
            verifyToken: config.meta.webhookVerifyToken,
          }),
        },
        WebhookRepository,
        WebhookService,
      ],
    };
  }
}
