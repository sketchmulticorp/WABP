import { Module, type DynamicModule } from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { DatabaseModule } from "../database/database.module.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { CampaignExecutionRepository } from "./campaign-execution.repository.js";
import { CampaignExecutionService } from "./campaign-execution.service.js";

/** Server-only reuse boundary loaded by the worker. No HTTP/auth controllers are bootstrapped. */
@Module({})
export class CampaignRuntimeModule {
  static register(config: RuntimeConfig): DynamicModule {
    return {
      module: CampaignRuntimeModule,
      imports: [DatabaseModule.register(config.database)],
      providers: [
        TenantScopeService,
        MessagingRepository,
        MessagingService,
        CampaignExecutionRepository,
        CampaignExecutionService,
      ],
      exports: [CampaignExecutionService],
    };
  }
}
export { CampaignExecutionService } from "./campaign-execution.service.js";
