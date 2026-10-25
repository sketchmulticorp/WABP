import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Queue } from "bullmq";

import { MESSAGE_JOB_NAME, MESSAGE_QUEUE_NAME, type MessageJobData } from "./message.constants.js";

/** Redis receives only a durable identifier; message content remains in PostgreSQL. */
export class MessageQueue {
  private readonly queue: Queue<MessageJobData>;
  private readonly attempts: number;

  constructor(config: RuntimeConfig) {
    this.attempts = config.messaging.maxAttempts;
    this.queue = new Queue<MessageJobData>(MESSAGE_QUEUE_NAME, {
      connection: { url: config.redis.url },
      prefix: config.redis.queuePrefix,
    });
  }

  async enqueue(messageId: string, eventId: string = messageId): Promise<void> {
    await this.queue.add(
      MESSAGE_JOB_NAME,
      { messageId },
      {
        attempts: this.attempts,
        backoff: { type: "message-delivery" },
        jobId: `outbound-message-${messageId}-${eventId}`,
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}
