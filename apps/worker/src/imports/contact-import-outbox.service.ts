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
import { CONTACT_IMPORT_WORKER_ENABLED } from "./contact-import.constants.js";
import { ContactImportOutboxRepository } from "./contact-import-outbox.repository.js";
import { ContactImportQueue } from "./contact-import.queue.js";

/** Relays committed import work to BullMQ without exposing file contents in queue payloads. */
@Injectable()
export class ContactImportOutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly workerId = `contact-import-relay:${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: ContactImportOutboxRepository,
    private readonly queue: ContactImportQueue,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(CONTACT_IMPORT_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactImportOutboxService.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void this.dispatchAvailable();
    this.timer = setInterval(
      () => void this.dispatchAvailable(),
      this.config.imports.relayPollIntervalMs,
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
          this.config.imports.outboxLockTimeoutSeconds,
        );
        if (claimed === undefined) return;
        try {
          await this.queue.enqueue(claimed.contactImportId, this.config.imports);
          await this.repository.publish(claimed.id, this.workerId);
        } catch {
          await this.repository.fail(
            claimed.id,
            this.workerId,
            this.config.imports.retryBaseDelayMs,
          );
          this.logger.warn(
            { event: "contact_import_outbox_dispatch_failed", outboxEventId: claimed.id },
            "Contact import outbox event will be retried",
          );
          return;
        }
      }
    } catch {
      this.logger.error(
        { event: "contact_import_outbox_claim_failed" },
        "Import outbox relay failed safely",
      );
    }
  }
}
