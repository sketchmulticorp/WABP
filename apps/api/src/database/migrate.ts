import { loadDatabaseConfig } from "@whatsapp-platform/config/runtime";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabaseClient, createDatabasePool } from "./database.client.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(currentDirectory, "../../database/migrations");

async function runMigrations(): Promise<void> {
  const config = loadDatabaseConfig();
  const pool = createDatabasePool(config);
  const database = createDatabaseClient(pool);

  try {
    await migrate(database, {
      migrationsFolder,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
    process.stdout.write("Database migrations applied successfully.\n");
  } finally {
    await pool.end();
  }
}

try {
  await runMigrations();
} catch (error: unknown) {
  process.stderr.write(`Database migration failed (${describeSafeError(error)}).\n`);
  process.exitCode = 1;
}

function describeSafeError(error: unknown): string {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return `error_type=${errorType}`;
  }

  const code = error.code;
  return typeof code === "string" && /^[A-Z0-9]{5}$/u.test(code)
    ? `error_type=${errorType}, database_code=${code}`
    : `error_type=${errorType}`;
}
