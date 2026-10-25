import type { DatabaseConfig } from "@whatsapp-platform/config/runtime";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";
import type { AppDatabase } from "./database.types.js";

/** Creates the process-owned PostgreSQL pool from validated runtime configuration. */
export function createDatabasePool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.url,
    max: config.poolMax,
    min: config.poolMin,
  });
}

/** Creates the typed Drizzle client used only by repositories and database adapters. */
export function createDatabaseClient(pool: Pool): AppDatabase {
  return drizzle({ client: pool, schema });
}
