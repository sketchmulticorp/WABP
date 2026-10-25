import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const databaseDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(databaseDirectory, "../../..");
const schemaDirectory = join(databaseDirectory, "schema");
const manifest = JSON.parse(await readFile(join(schemaDirectory, "manifest.json"), "utf8"));

const schemaFiles = [
  "000_bootstrap.sql",
  ...manifest.tables.map((table) => table.file),
  "900_deferred_foreign_keys.sql",
  "910_updated_at_triggers.sql",
];

const schemaStatements = await Promise.all(
  schemaFiles.map(async (file) => {
    const sql = await readFile(join(schemaDirectory, file), "utf8");
    return `-- Begin ${file}\n${sql}\n-- End ${file}`;
  }),
);

const expectedTableCount = manifest.tableCount;
const expectedSoftDeleteTableCount = manifest.tables.filter(
  (table) => table.deletion === "soft",
).length;

const validationSql = `
BEGIN;
${schemaStatements.join("\n\n")}

DO $schema_validation$
DECLARE
  actual_table_count integer;
  actual_soft_delete_table_count integer;
  cascade_foreign_key_count integer;
BEGIN
  SELECT count(*)
    INTO actual_table_count
    FROM pg_tables
   WHERE schemaname = 'app';

  IF actual_table_count <> ${String(expectedTableCount)} THEN
    RAISE EXCEPTION 'Expected ${String(expectedTableCount)} app tables, found %', actual_table_count;
  END IF;

  SELECT count(*)
    INTO actual_soft_delete_table_count
    FROM information_schema.columns
   WHERE table_schema = 'app'
     AND column_name = 'is_deleted';

  IF actual_soft_delete_table_count <> ${String(expectedSoftDeleteTableCount)} THEN
    RAISE EXCEPTION 'Expected ${String(expectedSoftDeleteTableCount)} soft-delete tables, found %', actual_soft_delete_table_count;
  END IF;

  SELECT count(*)
    INTO cascade_foreign_key_count
    FROM pg_constraint
   WHERE contype = 'f'
     AND confdeltype = 'c'
     AND connamespace = 'app'::regnamespace;

  IF cascade_foreign_key_count <> 0 THEN
    RAISE EXCEPTION 'Expected zero cascading foreign keys, found %', cascade_foreign_key_count;
  END IF;
END;
$schema_validation$;

ROLLBACK;
`;

const postgresUser = process.env.POSTGRES_USER ?? "whatsapp";
const validationDatabase = `whatsapp_schema_validation_${String(process.pid)}_${String(Date.now())}`;
let validationDatabaseCreated = false;

try {
  await runDockerCommand(["createdb", "--username", postgresUser, validationDatabase]);
  validationDatabaseCreated = true;
  await runDockerPsql(validationSql, postgresUser, validationDatabase);
} finally {
  if (validationDatabaseCreated) {
    await runDockerCommand([
      "dropdb",
      "--if-exists",
      "--force",
      "--username",
      postgresUser,
      validationDatabase,
    ]);
  }
}

console.log(
  `PostgreSQL schema validation passed: ${String(expectedTableCount)} tables, ` +
    `${String(expectedSoftDeleteTableCount)} soft-delete tables, zero cascade foreign keys.`,
);
console.log("The disposable validation database was removed; development data was unchanged.");

async function runDockerPsql(sql, user, database) {
  const argumentsList = [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "--username",
    user,
    "--dbname",
    database,
    "--set",
    "ON_ERROR_STOP=1",
    "--quiet",
  ];

  await new Promise((resolvePromise, rejectPromise) => {
    const processHandle = spawn("docker", argumentsList, {
      cwd: repositoryRoot,
      stdio: ["pipe", "inherit", "inherit"],
      windowsHide: true,
    });

    processHandle.once("error", (error) => {
      rejectPromise(new Error(`Unable to start Docker schema validation: ${error.message}`));
    });

    processHandle.once("exit", (exitCode, signal) => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `PostgreSQL schema validation failed with exit code ${String(exitCode)}` +
            (signal ? ` and signal ${signal}` : ""),
        ),
      );
    });

    processHandle.stdin.once("error", (error) => {
      rejectPromise(new Error(`Unable to send schema SQL to PostgreSQL: ${error.message}`));
    });

    processHandle.stdin.end(sql);
  });
}

async function runDockerCommand(postgresArguments) {
  const argumentsList = ["compose", "exec", "-T", "postgres", ...postgresArguments];

  await new Promise((resolvePromise, rejectPromise) => {
    const processHandle = spawn("docker", argumentsList, {
      cwd: repositoryRoot,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });

    processHandle.once("error", (error) => {
      rejectPromise(new Error(`Unable to start Docker database command: ${error.message}`));
    });

    processHandle.once("exit", (exitCode, signal) => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `Docker database command failed with exit code ${String(exitCode)}` +
            (signal ? ` and signal ${signal}` : ""),
        ),
      );
    });
  });
}
