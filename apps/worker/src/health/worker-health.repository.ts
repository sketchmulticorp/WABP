import { Inject, Injectable } from "@nestjs/common";
import type { ClientConfig, Pool, QueryConfig } from "pg";
import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

/** Infrastructure-only probe; no tenant rows, job payloads or migration writes. */
@Injectable()
export class WorkerHealthRepository {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}
  async ping(): Promise<void> {
    // Installed pg reads per-query query_timeout; @types/pg declares it only on ClientConfig.
    const query: QueryConfig & Pick<ClientConfig, "query_timeout"> = {
      text: "SELECT 1",
      query_timeout: 3_000,
    };
    await this.pool.query(query);
  }
}
