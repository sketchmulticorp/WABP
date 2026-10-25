import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Queue } from "bullmq";
import {
  CAMPAIGN_PREFLIGHT_JOB_NAME,
  CAMPAIGN_PREFLIGHT_QUEUE_NAME,
  type CampaignPreflightJobData,
} from "./campaign-preflight.constants.js";

/** Queue envelopes contain only the durable preflight identifier. */
export class CampaignPreflightQueue {
  private readonly queue: Queue<CampaignPreflightJobData>;
  constructor(config: RuntimeConfig) {
    this.queue = new Queue(CAMPAIGN_PREFLIGHT_QUEUE_NAME, {
      connection: { url: config.redis.url },
      prefix: config.redis.queuePrefix,
    });
  }
  async enqueue(preflightRunId: string): Promise<void> {
    await this.queue.add(
      CAMPAIGN_PREFLIGHT_JOB_NAME,
      { preflightRunId },
      {
        attempts: 3,
        backoff: { delay: 5_000, type: "exponential" },
        jobId: `campaign-preflight-${preflightRunId}`,
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
  }
  close(): Promise<void> {
    return this.queue.close();
  }
}
