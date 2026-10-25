import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Queue } from "bullmq";

import {
  CONTACT_IMPORT_JOB_NAME,
  CONTACT_IMPORT_QUEUE_NAME,
  type ContactImportJobData,
} from "./contact-import.constants.js";

/** Queue payloads deliberately contain only the durable import identifier. */
export class ContactImportQueue {
  private readonly queue: Queue<ContactImportJobData>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<ContactImportJobData>(CONTACT_IMPORT_QUEUE_NAME, {
      connection: { url: config.redis.url },
      prefix: config.redis.queuePrefix,
    });
  }

  async enqueue(contactImportId: string, config: RuntimeConfig["imports"]): Promise<void> {
    await this.queue.add(
      CONTACT_IMPORT_JOB_NAME,
      { contactImportId },
      {
        attempts: config.maxAttempts,
        backoff: { delay: config.retryBaseDelayMs, type: "exponential" },
        // BullMQ rejects two-part colon IDs; keep one deterministic key per durable import.
        jobId: `contact-import-${contactImportId}`,
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}
