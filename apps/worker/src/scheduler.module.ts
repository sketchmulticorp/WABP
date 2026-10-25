import { Module, type DynamicModule } from "@nestjs/common";
import { CampaignRuntimeModule } from "@whatsapp-platform/api/campaign-runtime";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { createLoggingModule } from "@whatsapp-platform/observability";
import { Pool } from "pg";
import { CampaignSchedulerService } from "./campaigns/campaign-scheduler.service.js";
import { CAMPAIGN_SCHEDULER_ENABLED } from "./campaigns/campaign-scheduler.constants.js";
import { WORKER_DATABASE_POOL, WORKER_RUNTIME_CONFIG } from "./webhooks/webhook.constants.js";
import { WebhookQueue } from "./webhooks/webhook.queue.js";
import { WorkerDatabaseLifecycle } from "./worker-database.lifecycle.js";
import { WorkerHealthController } from "./health/worker-health.controller.js";
import { WorkerHealthRepository } from "./health/worker-health.repository.js";
import { PROCESS_HEALTH_NAME, WorkerHealthService } from "./health/worker-health.service.js";
import { Injectable, type OnApplicationShutdown } from "@nestjs/common";

/** Scheduler has no webhook processor to close its readiness-only queue connection. */
@Injectable()
class SchedulerQueueLifecycle implements OnApplicationShutdown {
  constructor(private readonly queue: WebhookQueue) {}
  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

/** Existing campaign service owns all due-work policy; no consumers/provider adapter start here. */
@Module({})
export class SchedulerModule {
  static register(config: RuntimeConfig): DynamicModule {
    return {
      module: SchedulerModule,
      imports: [
        CampaignRuntimeModule.register(config),
        createLoggingModule({ level: config.runtime.logLevel, serviceName: "scheduler" }),
      ],
      providers: [
        { provide: WORKER_RUNTIME_CONFIG, useValue: config },
        { provide: CAMPAIGN_SCHEDULER_ENABLED, useValue: true },
        { provide: PROCESS_HEALTH_NAME, useValue: "scheduler" },
        {
          provide: WORKER_DATABASE_POOL,
          useFactory: () =>
            new Pool({
              connectionString: config.database.url,
              min: 0,
              max: 1,
              connectionTimeoutMillis: 5_000,
            }),
        },
        { provide: WebhookQueue, useFactory: () => new WebhookQueue(config) },
        CampaignSchedulerService,
        SchedulerQueueLifecycle,
        WorkerDatabaseLifecycle,
        WorkerHealthRepository,
        WorkerHealthService,
        WorkerHealthController,
      ],
    };
  }
}
