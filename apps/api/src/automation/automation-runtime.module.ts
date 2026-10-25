import { Module, type DynamicModule } from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { DatabaseModule } from "../database/database.module.js";
import { AutomationRepository } from "./automation.repository.js";
import { AutomationRunRepository } from "./automation-run.repository.js";
import { AutomationTriggerService } from "./automation-trigger.service.js";
import { AutomationExecutionService } from "./automation-execution.service.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import { MessagingRepository } from "../messaging/messaging.repository.js";
import { MessagingService } from "../messaging/messaging.service.js";

/** Server-only runtime reuse boundary. It starts no HTTP controller or provider delivery process. */
@Module({})
export class AutomationRuntimeModule {
  static register(config: RuntimeConfig): DynamicModule {
    return {
      module: AutomationRuntimeModule,
      imports: [DatabaseModule.register(config.database)],
      providers: [
        AutomationRepository,
        AutomationRunRepository,
        AutomationTriggerService,
        AutomationExecutionService,
        TenantScopeService,
        MessagingRepository,
        MessagingService,
      ],
      exports: [AutomationTriggerService, AutomationExecutionService],
    };
  }
}
export { AutomationTriggerService } from "./automation-trigger.service.js";
export { AutomationExecutionService } from "./automation-execution.service.js";
