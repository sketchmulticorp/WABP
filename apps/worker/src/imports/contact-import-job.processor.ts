import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Worker } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import { WORKER_RUNTIME_CONFIG } from "../webhooks/webhook.constants.js";
import {
  CONTACT_IMPORT_JOB_NAME,
  CONTACT_IMPORT_QUEUE_NAME,
  CONTACT_IMPORT_WORKER_ENABLED,
  type ContactImportJobData,
} from "./contact-import.constants.js";
import { ContactImportService } from "./contact-import.service.js";

/** Thin BullMQ transport adapter; all import workflow decisions live in ContactImportService. */
@Injectable()
export class ContactImportJobProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<ContactImportJobData> | undefined;

  constructor(
    private readonly service: ContactImportService,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(CONTACT_IMPORT_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactImportJobProcessor.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.worker = new Worker<ContactImportJobData>(
      CONTACT_IMPORT_QUEUE_NAME,
      async (job) => {
        if (job.name !== CONTACT_IMPORT_JOB_NAME) return;
        try {
          await this.service.process(job.data.contactImportId);
        } catch (error) {
          await this.service.fail(job.data.contactImportId, error);
          throw error;
        }
      },
      {
        connection: { url: this.config.redis.url },
        concurrency: this.config.imports.queueConcurrency,
        prefix: this.config.redis.queuePrefix,
      },
    );
    this.worker.on("failed", (job) => {
      this.logger.warn(
        { event: "contact_import_job_failed", contactImportId: job?.data.contactImportId },
        "Contact import processing job failed",
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
