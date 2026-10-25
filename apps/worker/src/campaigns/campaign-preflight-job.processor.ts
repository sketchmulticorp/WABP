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
  CAMPAIGN_PREFLIGHT_JOB_NAME,
  CAMPAIGN_PREFLIGHT_QUEUE_NAME,
  CAMPAIGN_PREFLIGHT_WORKER_ENABLED,
  type CampaignPreflightJobData,
} from "./campaign-preflight.constants.js";
import { CampaignPreflightService } from "./campaign-preflight.service.js";

/** Thin BullMQ adapter; the application service owns every preflight decision. */
@Injectable()
export class CampaignPreflightJobProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker: Worker<CampaignPreflightJobData> | undefined;
  constructor(
    private readonly service: CampaignPreflightService,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(CAMPAIGN_PREFLIGHT_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignPreflightJobProcessor.name);
  }
  onApplicationBootstrap() {
    if (!this.enabled) return;
    this.worker = new Worker<CampaignPreflightJobData>(
      CAMPAIGN_PREFLIGHT_QUEUE_NAME,
      async (job) => {
        if (job.name !== CAMPAIGN_PREFLIGHT_JOB_NAME) return;
        try {
          await this.service.process(job.data.preflightRunId);
        } catch (error) {
          if (job.attemptsMade + 1 >= (job.opts.attempts ?? 3))
            await this.service.fail(job.data.preflightRunId);
          throw error;
        }
      },
      {
        connection: { url: this.config.redis.url },
        concurrency: 1,
        prefix: this.config.redis.queuePrefix,
      },
    );
    this.worker.on("failed", (job) => {
      this.logger.warn(
        { event: "campaign_preflight_job_failed", preflightRunId: job?.data.preflightRunId },
        "Campaign preflight job failed",
      );
    });
  }
  async onApplicationShutdown() {
    await this.worker?.close();
  }
}
