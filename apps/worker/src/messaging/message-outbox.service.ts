import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { randomUUID } from "node:crypto";
import { PinoLogger } from "nestjs-pino";

import { WORKER_RUNTIME_CONFIG } from "../webhooks/webhook.constants.js";
import { MessageOutboxRepository } from "./message-outbox.repository.js";
import { MessageQueue } from "./message.queue.js";
import { MESSAGE_RELAY_ENABLED } from "./message.constants.js";

@Injectable()
export class MessageOutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly workerId = `message-relay:${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: MessageOutboxRepository,
    private readonly queue: MessageQueue,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    private readonly logger: PinoLogger,
    @Inject(MESSAGE_RELAY_ENABLED) private readonly enabled = true,
  ) {
    this.logger.setContext(MessageOutboxService.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void this.dispatchAvailable();
    this.timer = setInterval(
      () => void this.dispatchAvailable(),
      this.config.messaging.relayPollIntervalMs,
    );
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.queue.close();
  }

  async dispatchAvailable(): Promise<void> {
    try {
      for (;;) {
        const claimed = await this.repository.claimNext(
          this.workerId,
          this.config.messaging.outboxLockTimeoutSeconds,
        );
        if (claimed === undefined) return;
        try {
          await this.queue.enqueue(claimed.messageId, claimed.id);
          await this.repository.publish(claimed.id, this.workerId, claimed.messageId);
        } catch {
          await this.repository.fail(
            claimed.id,
            this.workerId,
            this.config.messaging.relayPollIntervalMs,
          );
          this.logger.warn(
            { event: "message_outbox_dispatch_failed", outboxEventId: claimed.id },
            "Message outbox event will be retried",
          );
          return;
        }
      }
    } catch {
      this.logger.error(
        { event: "message_outbox_claim_failed" },
        "Message outbox relay failed safely",
      );
    }
  }
}
