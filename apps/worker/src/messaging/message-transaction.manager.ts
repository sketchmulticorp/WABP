import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { WORKER_DATABASE_POOL } from "../webhooks/webhook.constants.js";

/** Worker services own transaction boundaries; repositories use the supplied session. */
@Injectable()
export class MessageTransactionManager {
  constructor(@Inject(WORKER_DATABASE_POOL) private readonly pool: Pool) {}
  async execute<T>(work: (session: PoolClient) => Promise<T>): Promise<T> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      const result = await work(session);
      await session.query("COMMIT");
      return result;
    } catch (error) {
      await session.query("ROLLBACK");
      throw error;
    } finally {
      session.release();
    }
  }
}
