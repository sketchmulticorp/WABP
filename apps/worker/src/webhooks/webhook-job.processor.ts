import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Worker } from "bullmq";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { PinoLogger } from "nestjs-pino";

import {
  WEBHOOK_JOB_NAME,
  WEBHOOK_QUEUE_NAME,
  WEBHOOK_WORKER_ENABLED,
  WORKER_RUNTIME_CONFIG,
  type WebhookJobData,
} from "./webhook.constants.js";
import { WebhookEventService } from "./webhook-event.service.js";

@Injectable()
export class WebhookJobProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<WebhookJobData> | undefined;

  constructor(
    private readonly service: WebhookEventService,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WEBHOOK_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WebhookJobProcessor.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.worker = new Worker<WebhookJobData>(
      WEBHOOK_QUEUE_NAME,
      async (job) => {
        if (job.name !== WEBHOOK_JOB_NAME) return;
        try {
          await this.service.process(job.data.webhookEventId);
        } catch (error) {
          await this.service.fail(
            job.data.webhookEventId,
            error,
            job.attemptsMade + 1 >= (job.opts.attempts ?? this.config.webhooks.maxAttempts),
          );
          throw error;
        }
      },
      {
        connection: { url: this.config.redis.url },
        concurrency: this.config.webhooks.queueConcurrency,
        prefix: this.config.redis.queuePrefix,
      },
    );
    this.worker.on("failed", (job) => {
      this.logger.warn(
        { event: "webhook_job_failed", webhookEventId: job?.data.webhookEventId },
        "Webhook processing job failed",
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
