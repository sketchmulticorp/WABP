import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

@Injectable()
export class CampaignPreflightTransactionManager {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}
  async execute<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original failure */
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
