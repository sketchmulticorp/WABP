import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Worker, UnrecoverableError, DelayedError } from "bullmq";
import { PinoLogger } from "nestjs-pino";

import { WORKER_RUNTIME_CONFIG } from "../webhooks/webhook.constants.js";
import {
  MessageDeliveryService,
  MessageDeliveryError,
  CampaignDeliveryDeferred,
} from "./message-delivery.service.js";
import {
  MESSAGE_JOB_NAME,
  MESSAGE_QUEUE_NAME,
  MESSAGE_WORKER_ENABLED,
  type MessageJobData,
} from "./message.constants.js";

/** Thin transport adapter. Delivery policy belongs to MessageDeliveryService. */
@Injectable()
export class MessageJobProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<MessageJobData> | undefined;

  constructor(
    private readonly service: MessageDeliveryService,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(MESSAGE_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MessageJobProcessor.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.worker = new Worker<MessageJobData>(
      MESSAGE_QUEUE_NAME,
      async (job, token) => {
        if (job.name !== MESSAGE_JOB_NAME) return;
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            job.data.messageId,
          )
        )
          throw new UnrecoverableError("MESSAGE_JOB_INVALID");
        try {
          await this.service.process(job.data.messageId, job.attemptsMade + 1);
        } catch (error) {
          if (error instanceof CampaignDeliveryDeferred) {
            await job.moveToDelayed(Date.now() + 5000, token);
            throw new DelayedError();
          }
          if (error instanceof MessageDeliveryError && error.retryDelayMs === null)
            throw new UnrecoverableError(error.code);
          throw error;
        }
      },
      {
        connection: { url: this.config.redis.url },
        concurrency: this.config.messaging.queueConcurrency,
        prefix: this.config.redis.queuePrefix,
        settings: {
          backoffStrategy: (_attempts, _type, error) =>
            error instanceof MessageDeliveryError && error.retryDelayMs !== null
              ? error.retryDelayMs
              : 1000,
        },
      },
    );
    this.worker.on("failed", (job) => {
      this.logger.warn(
        { event: "message_job_failed", messageId: job?.data.messageId },
        "Message processing job failed",
      );
    });
    this.worker.on("error", () => {
      this.logger.error(
        { event: "message_worker_transport_error" },
        "Message worker transport requires recovery",
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
