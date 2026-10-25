import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const databaseDirectory = dirname(fileURLToPath(import.meta.url));
const schemaDirectory = join(databaseDirectory, "schema");
const migrationDirectory = join(databaseDirectory, "migrations");
const manifest = JSON.parse(await readFile(join(schemaDirectory, "manifest.json"), "utf8"));

assert.equal(
  manifest.tableCount,
  manifest.tables.length,
  "Manifest table count must match entries",
);
assert.equal(manifest.tableCount, 35, "MVP schema count changed; update approved documentation");

const directoryFiles = new Set(await readdir(schemaDirectory));
const tableNames = new Set();
const tableSqlByName = new Map();
let combinedSql = "";

for (const table of manifest.tables) {
  assert.ok(directoryFiles.has(table.file), `Missing schema file: ${table.file}`);
  assert.ok(!tableNames.has(table.name), `Duplicate manifest table: ${table.name}`);
  tableNames.add(table.name);

  const sql = await readFile(join(schemaDirectory, table.file), "utf8");
  tableSqlByName.set(table.name, sql);
  const createMatches = [...sql.matchAll(/CREATE TABLE app\.([a-z_]+)/gu)];
  assert.equal(createMatches.length, 1, `${table.file} must create exactly one table`);
  assert.equal(createMatches[0][1], table.name, `${table.file} creates the wrong table`);

  if (table.deletion === "soft") {
    for (const column of ["is_deleted boolean", "deleted_at timestamptz", "deleted_by uuid"]) {
      assert.match(sql, new RegExp(column, "u"), `${table.name} is missing ${column}`);
    }
  } else {
    assert.doesNotMatch(
      sql,
      /\bis_deleted\b/u,
      `${table.name} must not silently use soft deletion`,
    );
  }

  combinedSql += sql;
}

assert.doesNotMatch(combinedSql, /ON DELETE CASCADE/iu, "API schema must not hard-cascade deletes");

assert.match(
  tableSqlByName.get("user_tenant_scopes"),
  /CREATE UNIQUE INDEX user_tenant_scopes_user_active_uq\s+ON app\.user_tenant_scopes \(user_id\)\s+WHERE is_deleted = false;/u,
  "Tenant Admin/User membership must allow only one active business per user",
);

for (const tableName of ["templates", "campaigns"]) {
  const sql = tableSqlByName.get(tableName);

  for (const column of [
    "content_version integer",
    "approval_status text",
    "approval_requested_by uuid",
    "reviewed_by uuid",
    "approved_version integer",
  ]) {
    assert.match(sql, new RegExp(column, "u"), `${tableName} is missing ${column}`);
  }

  assert.match(
    sql,
    /approved_version = content_version/u,
    `${tableName} approval must bind to the current material version`,
  );
  assert.match(
    sql,
    /reviewed_by <> approval_requested_by/u,
    `${tableName} must reject self-approval at the database boundary`,
  );
}

assert.match(
  tableSqlByName.get("templates"),
  /provider_status text/u,
  "Template provider status must remain separate from internal Admin approval",
);

const numberedTableFiles = [...directoryFiles].filter((file) => /^\d{3}_[a-z_]+\.sql$/u.test(file));
const unexpectedTableFiles = numberedTableFiles.filter(
  (file) =>
    !["000_bootstrap.sql", "900_deferred_foreign_keys.sql", "910_updated_at_triggers.sql"].includes(
      file,
    ) && !manifest.tables.some((table) => table.file === file),
);
assert.deepEqual(unexpectedTableFiles, [], "Every numbered table SQL file must be in the manifest");

const migrationSql = await readFile(
  join(migrationDirectory, "0000_initial_mvp_schema.sql"),
  "utf8",
);
const migrationSnapshot = JSON.parse(
  await readFile(join(migrationDirectory, "meta", "0000_snapshot.json"), "utf8"),
);
const migratedTableNames = [...migrationSql.matchAll(/CREATE TABLE "app"\."([a-z_]+)"/gu)].map(
  (match) => match[1],
);
const initialTableNames = manifest.tables
  // Tables introduced by reviewed follow-up migrations are intentionally absent from 0000.
  .filter((table) => !["payment_records", "campaign_preflight_runs"].includes(table.name))
  .map((table) => table.name)
  .toSorted();

assert.deepEqual(
  migratedTableNames.toSorted(),
  initialTableNames,
  "Initial Drizzle migration tables must match the approved manifest",
);
assert.deepEqual(
  Object.keys(migrationSnapshot.tables).toSorted(),
  initialTableNames.map((tableName) => `app.${tableName}`),
  "Drizzle snapshot tables must match the approved manifest",
);
assert.match(
  migrationSql,
  /CREATE EXTENSION IF NOT EXISTS "pgcrypto";/u,
  "Initial migration must install the approved UUID prerequisite",
);
assert.doesNotMatch(
  migrationSql,
  /ON DELETE CASCADE/iu,
  "Initial Drizzle migration must not hard-cascade deletes",
);

const deferredForeignKeySql = await readFile(
  join(schemaDirectory, "900_deferred_foreign_keys.sql"),
  "utf8",
);
const expectedDeferredForeignKeys = [
  ...deferredForeignKeySql.matchAll(/ADD CONSTRAINT ([a-z_]+)/gu),
].map((match) => match[1]);

for (const constraintName of expectedDeferredForeignKeys.filter(
  (name) => name !== "campaigns_tenant_final_preflight_fk",
)) {
  assert.match(
    migrationSql,
    new RegExp(`CONSTRAINT "${constraintName}"`, "u"),
    `Initial migration is missing deferred foreign key ${constraintName}`,
  );
}

const triggerSql = await readFile(join(schemaDirectory, "910_updated_at_triggers.sql"), "utf8");
const expectedTriggers = [...triggerSql.matchAll(/CREATE TRIGGER ([a-z_]+)/gu)].map(
  (match) => match[1],
);
const migratedTriggers = [...migrationSql.matchAll(/CREATE TRIGGER "([a-z_]+)"/gu)].map(
  (match) => match[1],
);

assert.deepEqual(
  migratedTriggers.toSorted(),
  expectedTriggers.toSorted(),
  "Initial Drizzle migration updated_at triggers must match the canonical schema",
);

console.log(
  `Schema contract and initial Drizzle migration verified: ${manifest.tableCount} tables in dependency order.`,
);
