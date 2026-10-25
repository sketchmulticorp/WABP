import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { PinoLogger } from "nestjs-pino";

import { WebhookOutboxRepository } from "./webhook-outbox.repository.js";
import { WebhookQueue } from "./webhook.queue.js";
import { WEBHOOK_WORKER_ENABLED, WORKER_RUNTIME_CONFIG } from "./webhook.constants.js";

@Injectable()
export class WebhookOutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly workerId = `webhook-relay:${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: WebhookOutboxRepository,
    private readonly queue: WebhookQueue,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WEBHOOK_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WebhookOutboxService.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void this.dispatchAvailable();
    this.timer = setInterval(
      () => void this.dispatchAvailable(),
      this.config.webhooks.relayPollIntervalMs,
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
          this.config.webhooks.outboxLockTimeoutSeconds,
        );
        if (claimed === undefined) return;
        try {
          await this.queue.enqueue(
            claimed.webhookEventId,
            this.config.webhooks.maxAttempts,
            this.config.webhooks.retryBaseDelayMs,
          );
          await this.repository.publish(claimed.id, claimed.webhookEventId, this.workerId);
        } catch {
          await this.repository.fail(
            claimed.id,
            this.workerId,
            this.config.webhooks.retryBaseDelayMs,
          );
          this.logger.warn(
            { event: "webhook_outbox_dispatch_failed", outboxEventId: claimed.id },
            "Webhook outbox event will be retried",
          );
          return;
        }
      }
    } catch {
      this.logger.error(
        { event: "webhook_outbox_claim_failed" },
        "Webhook outbox relay failed safely",
      );
    }
  }
}
