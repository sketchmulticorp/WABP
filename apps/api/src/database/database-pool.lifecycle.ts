import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import type { Pool } from "pg";

import { DATABASE_POOL } from "./database.constants.js";

@Injectable()
export class DatabasePoolLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabasePoolLifecycle.name);
  private closed = false;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  onModuleInit(): void {
    // node-postgres requires an error listener for failures raised by idle pooled clients.
    this.pool.on("error", this.handleIdleClientError);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.pool.off("error", this.handleIdleClientError);
    await this.pool.end();
  }

  private readonly handleIdleClientError = (error: Error): void => {
    this.logger.error(
      "Idle PostgreSQL client failed; the pool discarded the connection",
      error.stack,
    );
  };
}
