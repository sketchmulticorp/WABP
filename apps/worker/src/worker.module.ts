import { type DynamicModule, Module, type Provider } from "@nestjs/common";
import { SERVICE_NAMES } from "@whatsapp-platform/config";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { createLoggingModule } from "@whatsapp-platform/observability";
import { Pool } from "pg";
import { ProviderCredentialRepository } from "@whatsapp-platform/api/provider-credentials";
import {
  EnvironmentCredentialReferenceResolver,
  ProviderCredentialCipher,
  ProviderCredentialService,
} from "@whatsapp-platform/whatsapp-provider";
import { S3ObjectStorage } from "@whatsapp-platform/storage";

import { CONTACT_IMPORT_WORKER_ENABLED } from "./imports/contact-import.constants.js";
import { ContactImportJobProcessor } from "./imports/contact-import-job.processor.js";
import { ContactImportOutboxRepository } from "./imports/contact-import-outbox.repository.js";
import { ContactImportOutboxService } from "./imports/contact-import-outbox.service.js";
import { ContactImportQueue } from "./imports/contact-import.queue.js";
import { ContactImportRepository } from "./imports/contact-import.repository.js";
import { ContactImportRetentionService } from "./imports/contact-import-retention.service.js";
import { ContactImportService } from "./imports/contact-import.service.js";
import {
  WEBHOOK_WORKER_ENABLED,
  WORKER_DATABASE_POOL,
  WORKER_RUNTIME_CONFIG,
} from "./webhooks/webhook.constants.js";
import { WebhookEventRepository } from "./webhooks/webhook-event.repository.js";
import { WebhookEventService } from "./webhooks/webhook-event.service.js";
import { WebhookJobProcessor } from "./webhooks/webhook-job.processor.js";
import { WebhookOutboxRepository } from "./webhooks/webhook-outbox.repository.js";
import { WebhookOutboxService } from "./webhooks/webhook-outbox.service.js";
import { WebhookQueue } from "./webhooks/webhook.queue.js";
import { WorkerDatabaseLifecycle } from "./worker-database.lifecycle.js";
import {
  MESSAGE_WORKER_ENABLED,
  MESSAGE_PROVIDER,
  MESSAGE_RELAY_ENABLED,
} from "./messaging/message.constants.js";
import { MessageDeliveryRepository } from "./messaging/message-delivery.repository.js";
import { MessageDeliveryService } from "./messaging/message-delivery.service.js";
import { MessageJobProcessor } from "./messaging/message-job.processor.js";
import { MessageOutboxRepository } from "./messaging/message-outbox.repository.js";
import { MessageOutboxService } from "./messaging/message-outbox.service.js";
import { MessageQueue } from "./messaging/message.queue.js";
import { MetaWhatsAppProviderAdapter } from "@whatsapp-platform/whatsapp-provider";
import { MessageTransactionManager } from "./messaging/message-transaction.manager.js";
import { CAMPAIGN_PREFLIGHT_WORKER_ENABLED } from "./campaigns/campaign-preflight.constants.js";
import { CampaignPreflightQueue } from "./campaigns/campaign-preflight.queue.js";
import { CampaignPreflightOutboxRepository } from "./campaigns/campaign-preflight-outbox.repository.js";
import { CampaignPreflightOutboxService } from "./campaigns/campaign-preflight-outbox.service.js";
import { CampaignPreflightRepository } from "./campaigns/campaign-preflight.repository.js";
import { CampaignPreflightService } from "./campaigns/campaign-preflight.service.js";
import { CampaignPreflightTransactionManager } from "./campaigns/campaign-preflight-transaction.manager.js";
import { CampaignPreflightJobProcessor } from "./campaigns/campaign-preflight-job.processor.js";
import { CampaignRuntimeModule } from "@whatsapp-platform/api/campaign-runtime";
import { CampaignSchedulerService } from "./campaigns/campaign-scheduler.service.js";
import { AutomationRuntimeModule } from "@whatsapp-platform/api/automation-runtime";
import { AutomationOutboxRepository } from "./automation/automation-outbox.repository.js";
import { AutomationTransportService } from "./automation/automation-transport.service.js";
import { AutomationQueue, AUTOMATION_ENABLED } from "./automation/automation-queue.adapter.js";
import { AutomationJobProcessor } from "./automation/automation-job.processor.js";
import { AutomationTransactionManager } from "./automation/automation-transaction.manager.js";
import { CAMPAIGN_SCHEDULER_ENABLED } from "./campaigns/campaign-scheduler.constants.js";
import { WorkerHealthController } from "./health/worker-health.controller.js";
import { WorkerHealthRepository } from "./health/worker-health.repository.js";
import { PROCESS_HEALTH_NAME, WorkerHealthService } from "./health/worker-health.service.js";

@Module({})
export class WorkerModule {
  /** Builds the worker root module from the same validated config used by the API. */
  static register(
    config: RuntimeConfig,
    options: {
      readonly startContactImportProcessing?: boolean;
      readonly startWebhookProcessing?: boolean;
      readonly startMessageProcessing?: boolean;
      readonly startMessageRelay?: boolean;
      readonly startCampaignPreflightProcessing?: boolean;
      readonly startAutomationProcessing?: boolean;
      readonly startCampaignScheduling?: boolean;
      readonly exposeHealth?: boolean;
    } = {},
  ): DynamicModule {
    const databasePool: Provider = {
      provide: WORKER_DATABASE_POOL,
      useFactory: () =>
        new Pool({
          connectionString: config.database.url,
          max: config.database.poolMax,
          min: config.database.poolMin,
          connectionTimeoutMillis: 5_000,
        }),
    };
    return {
      module: WorkerModule,
      imports: [
        CampaignRuntimeModule.register(config),
        AutomationRuntimeModule.register(config),
        createLoggingModule({
          level: config.runtime.logLevel,
          serviceName: SERVICE_NAMES.worker,
        }),
      ],
      providers: [
        databasePool,
        {
          provide: CAMPAIGN_SCHEDULER_ENABLED,
          useValue:
            options.startCampaignScheduling ?? options.startCampaignPreflightProcessing ?? true,
        },
        ...(options.exposeHealth
          ? [
              { provide: PROCESS_HEALTH_NAME, useValue: SERVICE_NAMES.worker },
              WorkerHealthRepository,
              WorkerHealthService,
              WorkerHealthController,
            ]
          : []),
        { provide: AUTOMATION_ENABLED, useValue: options.startAutomationProcessing ?? true },
        { provide: AutomationQueue, useFactory: () => new AutomationQueue(config) },
        AutomationOutboxRepository,
        AutomationTransactionManager,
        AutomationTransportService,
        AutomationJobProcessor,
        { provide: WebhookQueue, useFactory: () => new WebhookQueue(config) },
        { provide: ContactImportQueue, useFactory: () => new ContactImportQueue(config) },
        { provide: MessageQueue, useFactory: () => new MessageQueue(config) },
        { provide: CampaignPreflightQueue, useFactory: () => new CampaignPreflightQueue(config) },
        {
          provide: MESSAGE_PROVIDER,
          useFactory: (pool: Pool) =>
            new MetaWhatsAppProviderAdapter(
              config.meta,
              new ProviderCredentialService(
                new ProviderCredentialRepository(pool),
                new ProviderCredentialCipher(config.credentialEncryption),
                new EnvironmentCredentialReferenceResolver(config.meta.developmentAccessToken),
              ),
            ),
          inject: [WORKER_DATABASE_POOL],
        },
        MessageTransactionManager,
        { provide: S3ObjectStorage, useFactory: () => new S3ObjectStorage(config.storage) },
        { provide: WORKER_RUNTIME_CONFIG, useValue: config },
        { provide: WEBHOOK_WORKER_ENABLED, useValue: options.startWebhookProcessing ?? true },
        { provide: MESSAGE_WORKER_ENABLED, useValue: options.startMessageProcessing ?? true },
        { provide: MESSAGE_RELAY_ENABLED, useValue: options.startMessageRelay ?? true },
        {
          provide: CAMPAIGN_PREFLIGHT_WORKER_ENABLED,
          useValue: options.startCampaignPreflightProcessing ?? true,
        },
        {
          provide: CONTACT_IMPORT_WORKER_ENABLED,
          useValue: options.startContactImportProcessing ?? true,
        },
        WebhookEventRepository,
        WebhookEventService,
        WebhookJobProcessor,
        WebhookOutboxRepository,
        WebhookOutboxService,
        ContactImportRepository,
        {
          provide: ContactImportService,
          useFactory: (
            repository: ContactImportRepository,
            storage: S3ObjectStorage,
            runtimeConfig: RuntimeConfig,
          ) => new ContactImportService(repository, storage, runtimeConfig),
          inject: [ContactImportRepository, S3ObjectStorage, WORKER_RUNTIME_CONFIG],
        },
        ContactImportRetentionService,
        ContactImportJobProcessor,
        ContactImportOutboxRepository,
        ContactImportOutboxService,
        MessageDeliveryRepository,
        MessageDeliveryService,
        MessageJobProcessor,
        MessageOutboxRepository,
        MessageOutboxService,
        CampaignPreflightRepository,
        CampaignPreflightService,
        CampaignPreflightTransactionManager,
        CampaignPreflightJobProcessor,
        CampaignPreflightOutboxRepository,
        CampaignPreflightOutboxService,
        CampaignSchedulerService,
        WorkerDatabaseLifecycle,
      ],
    };
  }
}
