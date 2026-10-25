# Database Runtime and Migration Operations

## Runtime ownership

- `apps/api/src/database/database.module.ts` owns the API process PostgreSQL pool, typed
  Drizzle client, shutdown lifecycle, transaction boundary, and outbox repository.
- Repositories are the only feature classes allowed to import the Drizzle client or schema.
- Application services inject `DatabaseTransactionManager`, open the transaction around a
  complete business workflow, and pass its executor to every participating repository.
- Provider, queue, storage, and email calls must happen after the database transaction has
  committed.

The pool uses validated `DATABASE_URL`, `DATABASE_POOL_MIN`, and `DATABASE_POOL_MAX`
settings. NestJS shutdown hooks close it during an orderly API termination. Readiness
executes `SELECT 1`; it returns HTTP 503 with `database: "down"` when PostgreSQL cannot be
reached, while liveness remains independent of external dependencies.

## Transactional outbox boundary

`OutboxRepository.create()` requires the transaction received from
`DatabaseTransactionManager.execute()`. It cannot accept the non-transactional root client.
This makes the business write and `PENDING` outbox row commit or roll back together.

The webhook relay claims eligible outbox rows with PostgreSQL `FOR UPDATE SKIP LOCKED`,
an ownership token, and a bounded stale-lock timeout. It first publishes the event UUID to
BullMQ and then atomically records the outbox `PUBLISHED` state plus webhook `QUEUED`
state. If queue publication fails, the row returns to `FAILED` after its configured delay.
No code may publish to Redis from inside the open database transaction, and queue jobs may
contain only the webhook event UUID rather than a raw provider payload.

## Local migration workflow

Start the local services and copy the development environment template if needed:

```powershell
Copy-Item .env.example .env
pnpm infra:up
pnpm schema:migrate
```

`schema:migrate` validates only database variables, reads committed migrations from
`apps/api/database/migrations/`, and records applied versions in
`drizzle.__drizzle_migrations`. It is idempotent: rerunning it applies only newer committed
migrations.

Run the PostgreSQL integration suite after the migration:

```powershell
pnpm schema:test:integration
```

The suite verifies the migration record and 33-table inventory, committed outbox writes,
rollback of outbox writes when a transaction fails, and transactional/idempotent bootstrap
seeding without password reset. Seed assertions execute inside a rolled-back transaction.

For a new environment, configure the required bootstrap values and then run:

```powershell
pnpm schema:seed
```

The command is separate from migrations and application startup. See
[Database bootstrap seed](BOOTSTRAP_SEED.md) for variables, role assignments, internal
plan defaults, conflict behavior, and credential handling.

## Deployment workflow

1. Back up the database according to the environment recovery policy.
2. Run schema verification and database integration tests against an isolated environment.
3. Run `pnpm schema:migrate` once as a controlled release/pre-deploy job using the direct
   PostgreSQL connection and migration credentials.
4. Verify the migration record and readiness.
5. For a new environment only, run the controlled seed command with secret bootstrap
   values and verify its redacted result.
6. Deploy compatible workers, API, and web artifacts.

Application startup never applies migrations. This avoids competing migration attempts
when API or worker replicas start simultaneously and keeps DDL permissions out of normal
runtime identities.

## Failure and recovery

Migrations are forward-only. Never edit an already deployed migration, delete migration
history, or automatically run down migrations against production data.

- If migration execution fails before its history row is recorded, stop the release,
  diagnose the safe database error through restricted operational logs, correct the cause,
  verify database state, and rerun the same command. Drizzle applies migration statements
  inside a transaction, so failed migration statements roll back together; its migration
  schema/table may already exist without a completed history row.
- If a migration succeeds but application verification fails, keep the database state and
  deploy a compatible code rollback or a reviewed forward corrective migration.
- If corruption or destructive DDL requires data recovery, stop writers and use the tested
  backup/PITR restore procedure. Production RPO, RTO, and restore automation remain part of
  TASK-083 and must be approved before launch.

Do not use `drizzle-kit push` against shared, staging, or production databases. Deployed
schema changes must come from reviewed committed migrations.
