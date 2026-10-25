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
import { AUTOMATION_ENABLED, AUTOMATION_QUEUE } from "./automation-queue.adapter.js";
import type { AutomationEvent } from "./automation-outbox.repository.js";
import { AutomationTransportService } from "./automation-transport.service.js";

/** Thin BullMQ entry point. No SQL, repositories or node execution inside this adapter. */
@Injectable()
export class AutomationJobProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<AutomationEvent> | undefined;
  constructor(
    private readonly service: AutomationTransportService,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(AUTOMATION_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {}
  onApplicationBootstrap() {
    if (!this.enabled) return;
    this.worker = new Worker<AutomationEvent>(
      AUTOMATION_QUEUE,
      async (job) => {
        const data: unknown = job.data;
        if (job.name !== "automation-event" || !valid(data))
          throw new Error("AUTOMATION_JOB_INVALID");
        try {
          await this.service.process(data);
        } catch (error) {
          if (job.attemptsMade + 1 >= (job.opts.attempts ?? 5)) await this.service.exhausted(data);
          throw error;
        }
      },
      {
        connection: { url: this.config.redis.url },
        prefix: this.config.redis.queuePrefix,
        concurrency: 2,
      },
    );
    this.worker.on("failed", (job) => {
      this.logger.warn(
        {
          event: "automation_job_failed",
          eventId: valid(job?.data) ? job.data.eventId : undefined,
        },
        "Automation job retained for retry/review",
      );
    });
    this.worker.on("error", () => {
      this.logger.error(
        { event: "automation_worker_error" },
        "Automation worker connection requires attention",
      );
    });
  }
  async onApplicationShutdown() {
    await this.worker?.close();
  }
}
function valid(value: unknown): value is AutomationEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>,
    uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  return (
    Object.keys(data).length === 3 &&
    typeof data.eventId === "string" &&
    uuid.test(data.eventId) &&
    typeof data.targetId === "string" &&
    uuid.test(data.targetId) &&
    (data.kind === "inbound" || data.kind === "advance")
  );
}
