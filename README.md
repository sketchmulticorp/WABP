# WhatsApp Marketing and Automation Platform

Multi-tenant SaaS for official WhatsApp Business onboarding, contact and group management, approved-template campaigns, a shared inbox, and basic conversation automation.

## MVP stack

- Frontend: Next.js App Router and TypeScript
- Backend: NestJS REST API and TypeScript
- Workers: NestJS and BullMQ
- Database: PostgreSQL
- Queue/cache: Redis
- Object storage: S3-compatible Railway Bucket
- Hosting: Railway Pro
- Provider: Meta WhatsApp Cloud API and verified webhooks

## Product scope

The MVP includes authentication, multi-tenant authorization, package limits, WhatsApp onboarding, Contacts, Groups, templates, campaigns, shared inbox, basic automation, audit logs, usage, and reporting.

Tags and Lead CRM are explicitly out of scope.

## Read before coding

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `design-doc/MVP_BACKEND_LLD.md`
4. `docs/DESIGN.md`
5. `docs/SECURITY.md`
6. `RULES.md`
7. `TASKS.md`
8. `docs/MEMORY.md`

The detailed specification index is available at `docs/README.md`.

## Repository layout

```text
apps/
  web/        Next.js frontend
  api/        NestJS REST API and webhook gateway
  worker/     BullMQ consumers and scheduler entry points
packages/
  contracts/  Shared browser-safe DTO schemas and generated types
  config/     Shared TypeScript, lint, and build configuration
  ui/         Shared frontend UI primitives
docs/         Product, architecture, security, test, and operating documents
design-doc/   Backend and database low-level design
tests/        Cross-application integration and end-to-end tests
```

## Initial workspace commands

Prerequisites: Node.js 24, Corepack/pnpm, and Docker Desktop.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm infra:up
pnpm dev
```

The web application uses port `3000` and the API uses port `4000`. Docker Compose supplies PostgreSQL, Redis, MinIO object storage, and Mailpit email capture. See [local development infrastructure](docs/LOCAL_DEVELOPMENT.md) for endpoints, lifecycle commands, and reset guidance.

Before committing a change, run the complete local quality gate:

```powershell
pnpm check
```

This verifies formatting, ESLint, strict TypeScript, tests, and the production build. Individual commands include `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Delivery workflow

Work one task at a time:

```text
Read -> Understand -> Plan -> Implement -> Test -> Review -> Fix -> Commit -> Update docs
```

Do not begin implementation without a task ID and acceptance criteria. Do not make production the first test environment.

## Environments

- Local development: local services or isolated development resources.
- Railway development: the `dev` branch deploys to an isolated full-stack `development`
  environment for implementation, Meta test-asset E2E and owner UAT.
- Railway production: the `main` branch deploys to `production`. It remains unchanged until
  development acceptance and explicit owner approval for a reviewed `dev` -> `main` promotion.
- Do not maintain a separate `PROD` branch. Keep environment-specific data, Redis/queues,
  buckets, keys, Meta credentials and domains isolated through Railway configuration.
- Customer production requires backups, monitoring, cost controls, production credentials and
  the recorded launch gates; a successful development deployment is not production approval.

Copy `.env.example` to the appropriate untracked local environment file and provide actual secrets through the environment or Railway variables.

The API and worker load the repository-root `.env` file when it exists and validate configuration before NestJS starts. Invalid configuration stops startup with field names and constraints only; submitted values are never included in validation errors. Production additionally requires authentication, encryption, and Meta credentials.
