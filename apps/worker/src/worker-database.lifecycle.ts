import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";

import { WORKER_DATABASE_POOL } from "./webhooks/webhook.constants.js";

/** Owns the process-level database pool so CLI tools and workers release it deterministically. */
@Injectable()
export class WorkerDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
