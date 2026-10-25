import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { S3ObjectStorage } from "@whatsapp-platform/storage";
import { PinoLogger } from "nestjs-pino";

import { WORKER_RUNTIME_CONFIG } from "../webhooks/webhook.constants.js";
import { CONTACT_IMPORT_WORKER_ENABLED } from "./contact-import.constants.js";
import { ContactImportRepository } from "./contact-import.repository.js";

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Applies the approved retention policy without retaining uploaded PII indefinitely. */
@Injectable()
export class ContactImportRetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: ContactImportRepository,
    private readonly storage: S3ObjectStorage,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(CONTACT_IMPORT_WORKER_ENABLED) private readonly enabled: boolean,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactImportRetentionService.name);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void this.purgeExpired();
    this.timer = setInterval(() => void this.purgeExpired(), RETENTION_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async purgeExpired(): Promise<void> {
    try {
      const files = await this.repository.findExpiredStoredFiles(
        this.config.uploads.importRetentionDays,
      );
      for (const file of files) {
        await this.storage.delete(file.storageKey);
        await this.repository.markStoredFileDeleted(file.id);
      }
      const deletedErrors = await this.repository.deleteExpiredErrors(
        this.config.uploads.importRetentionDays,
      );
      if (files.length > 0 || deletedErrors > 0) {
        this.logger.info(
          {
            deletedErrorRows: deletedErrors,
            deletedFiles: files.length,
            event: "contact_import_retention_purged",
          },
          "Expired contact import artifacts were deleted",
        );
      }
    } catch {
      this.logger.error(
        { event: "contact_import_retention_failed" },
        "Contact import retention will retry on the next scheduled run",
      );
    }
  }
}
