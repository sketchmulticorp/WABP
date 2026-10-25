import { Queue } from "bullmq";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";

import { WEBHOOK_JOB_NAME, WEBHOOK_QUEUE_NAME, type WebhookJobData } from "./webhook.constants.js";

/** Queue payloads contain only durable identifiers; webhook payloads remain in PostgreSQL. */
export class WebhookQueue {
  private readonly queue: Queue<WebhookJobData>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
      connection: { url: config.redis.url },
      prefix: config.redis.queuePrefix,
    });
  }

  enqueue(eventId: string, maxAttempts: number, retryBaseDelayMs: number): Promise<void> {
    return this.queue
      .add(
        WEBHOOK_JOB_NAME,
        { webhookEventId: eventId },
        {
          attempts: maxAttempts,
          backoff: { delay: retryBaseDelayMs, type: "exponential" },
          jobId: `webhook-event-${eventId}`,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      )
      .then(() => undefined);
  }

  close(): Promise<void> {
    return this.queue.close();
  }

  /** Reuse this queue's connection for infrastructure readiness without creating jobs. */
  async ping(): Promise<void> {
    const client = await this.queue.getBackend().client;
    const result: unknown = await client.runCommand("ping", []);
    if (result !== "PONG") throw new Error("QUEUE_HEALTH_UNAVAILABLE");
  }
}
