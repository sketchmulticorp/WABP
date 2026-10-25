import { loadSeedConfig } from "@whatsapp-platform/config/runtime";

import { Argon2idPasswordHasher } from "../common/security/password-hasher.js";
import { createDatabaseClient, createDatabasePool } from "./database.client.js";
import { DatabaseTransactionManager } from "./database-transaction.manager.js";
import { SeedRepository } from "./seed/seed.repository.js";
import { SeedService } from "./seed/seed.service.js";

async function runSeed(): Promise<void> {
  const config = loadSeedConfig();
  const pool = createDatabasePool(config.database);
  const database = createDatabaseClient(pool);
  const service = new SeedService(
    new SeedRepository(),
    new DatabaseTransactionManager(database),
    new Argon2idPasswordHasher(),
  );

  try {
    const result = await service.run(config);
    process.stdout.write(
      `Database seed completed: ${String(result.permissionCount)} permissions, ${String(result.roleCount)} roles; ` +
        `created=${JSON.stringify(result.created)}.\n`,
    );
  } finally {
    await pool.end();
  }
}

try {
  await runSeed();
} catch (error: unknown) {
  process.stderr.write(`Database seed failed (${describeSafeError(error)}).\n`);
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
