import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase } from "../database/database.types.js";

@Injectable()
export class HealthRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  /** Executes a minimal database round trip without reading application data. */
  async pingDatabase(): Promise<void> {
    await this.database.execute(sql`select 1`);
  }
}
