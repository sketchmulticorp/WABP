import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Queue } from "bullmq";
import type { AutomationEvent } from "./automation-outbox.repository.js";

export const AUTOMATION_QUEUE = "automation-run";
export const AUTOMATION_ENABLED = Symbol("AUTOMATION_ENABLED");
/** Events, not runs, identify jobs: distinct durable continuations must not collapse together. */
export class AutomationQueue {
  private readonly queue: Queue<AutomationEvent>;
  constructor(config: RuntimeConfig) {
    this.queue = new Queue(AUTOMATION_QUEUE, {
      connection: { url: config.redis.url },
      prefix: config.redis.queuePrefix,
    });
  }
  async enqueue(event: AutomationEvent) {
    await this.queue.add("automation-event", event, {
      jobId: `automation-${event.eventId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }
  close() {
    return this.queue.close();
  }
}
