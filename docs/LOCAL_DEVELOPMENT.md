# Local Development Infrastructure

`TASK-089` extends the original infrastructure-only Compose project into a production-style
local stack. Docker Compose now builds the same Web, API and Worker images used for Railway,
runs the Worker consumer and singleton Scheduler as separate processes, and keeps the existing
PostgreSQL, Redis, MinIO, ClamAV and Mailpit dependencies. It does not change Railway service
discovery or deploy Worker/Scheduler when code is pushed to `main`.

## Prerequisites

- Docker Desktop with the Docker engine running.
- Node.js 24.7 or newer within the Node.js 24 line, plus pnpm 11. Node 24.7 introduced
  the built-in Argon2id API used for bootstrap and authentication password hashing.
- Ports `5432`, `6379`, `9000`, `9001`, `1025`, and `8025` available on localhost, or custom port values in `.env`.

Copy the safe local defaults before starting:

```powershell
Copy-Item .env.example .env
```

The committed credentials and Compose fallbacks are intentionally limited to local development.
Never reuse them in staging or production. Production-style means compiled images, production
configuration validation, process separation and health checks; it does not turn local placeholder
provider settings into valid Meta credentials.

## Start and stop

Build the application images and apply migrations as an explicit one-off operation before
starting the runtime services:

```powershell
pnpm infra:build
pnpm infra:migrate
pnpm infra:up
pnpm infra:status
```

`infra:up` builds changed images, starts the complete stack and waits for health. It also runs
the idempotent `minio-init` service, which creates the configured object-storage bucket if it
does not exist. Migrations remain separate from application startup, matching the controlled
deployment rule.

`infra:migrate` starts PostgreSQL when necessary, runs the compiled API migration entry point,
and exits. It is safe to rerun and does not run automatically when the API starts. See
[Database runtime and migration operations](DATABASE_OPERATIONS.md) for integration tests,
deployment ordering, and recovery rules.

To create the first local accounts, replace the blank `SEED_*` identity values in `.env`
with non-shared development identities and strong temporary passwords, review the internal
plan limits, and run:

```powershell
pnpm infra:seed
```

The seed is transactional and safe to rerun, but it deliberately does not reset an
existing password or repair conflicting identity data. See
[Database bootstrap seed](BOOTSTRAP_SEED.md) before running it.

The first build compiles three production application images and MinIO from its pinned source
commit, so it can take several minutes. The Scheduler reuses the Worker image. Docker caches the
layers, making later builds substantially faster unless their inputs change.

Stop containers without deleting development data:

```powershell
pnpm infra:down
```

Follow service output when diagnosing a startup problem:

```powershell
pnpm infra:logs
```

## Service endpoints

| Service | Local endpoint | Purpose |
|---|---|---|
| Web | `http://localhost:3000` | Production Next.js server and same-origin `/api/v1` proxy |
| API | `http://localhost:4000` | Production NestJS HTTP API and Meta webhook receiver |
| Worker | `http://localhost:4001/health/ready` | Queue consumers, relays and provider delivery |
| Scheduler | `http://localhost:4002/health/ready` | Singleton campaign scheduling process |
| PostgreSQL | `localhost:5432` | Durable application data |
| Redis | `redis://localhost:6379` | BullMQ, cache, locks, and transient coordination |
| MinIO S3 API | `http://localhost:9000` | S3-compatible import, media, and export storage |
| MinIO console | `http://localhost:9001` | Local object-storage administration |
| Mailpit SMTP | `localhost:1025` | Captures application email instead of sending it |
| Mailpit web UI | `http://localhost:8025` | Displays captured development email |

Docker publishes every port on `127.0.0.1` only. Other containers in this Compose project reach services by their Compose names (`postgres`, `redis`, `minio`, and `mailpit`) rather than `localhost`.

## Data persistence

Named Docker volumes preserve PostgreSQL records, Redis append-only data, MinIO objects, and captured Mailpit messages across normal stop/start cycles.

To remove all local service data and start clean, run:

```powershell
pnpm infra:reset
pnpm infra:up
```

`infra:reset` permanently deletes the four local Docker volumes. It does not affect staging or production.

## Configuration rules

- `.env.example` is the canonical variable list; `.env` remains untracked.
- Compose passes container-network addresses (`postgres`, `redis`, `minio`, `clamav`, and
  `mailpit`) to server containers while retaining localhost URLs for the browser.
- Web uses `/api/v1` and a fixed build-time proxy target of `http://api:4000/api/v1`; no server secret
  is exposed to browser JavaScript.
- API, Worker and Scheduler use `NODE_ENV=production` and `APP_MODE=full` inside Compose.
  Railway variables and service definitions remain independent and unchanged.
- API and worker host development/start commands still load the repository-root `.env` when it
  exists. Existing process or Railway variables remain the deployment source of truth.
- Both server processes validate and convert configuration before creating NestJS providers. Invalid ports, URLs, booleans, sizes, pool bounds, or required values stop startup immediately.
- `JWT_ACCESS_SECRET` and `REFRESH_TOKEN_PEPPER` are mandatory in every runtime
  environment now that authentication is active. Encryption and Meta values may remain
  blank during local foundation work but are mandatory when `NODE_ENV=production`.
- An automated parity test fails when a validated key is missing from `.env.example`, duplicated, or documented without a matching schema entry.
- Keep `DATABASE_URL` aligned with the `POSTGRES_*` values when overriding local database credentials or ports.
- MinIO uses `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET`, so the application and bucket initializer share one configuration source.
- `S3_FORCE_PATH_STYLE=true` is required for the local MinIO endpoint.
- Replace the local-only Meta fallbacks in `.env` before a real provider test. Without valid
  Meta values the application starts, but explicit provider operations fail safely.
- Production uses Railway-managed PostgreSQL, Redis, and object storage; Mailpit is development-only.
- MinIO Community Edition stopped publishing container images and archived its source repository. The Compose build therefore compiles the final Community Edition release from its immutable official source commit, while Go verifies downloaded modules against the committed checksums. Never deploy this historical compatibility image to staging or production.

## Basic diagnostics

Validate the Compose file without starting containers:

```powershell
pnpm infra:config
```

Inspect unhealthy service output with:

```powershell
docker compose ps --all
docker compose logs <service-name>
```

If a default host port is already occupied, change its matching `*_PORT` value in `.env` and keep the application URL or port setting aligned.
