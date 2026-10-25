# WhatsApp SaaS Platform Documentation

Status: Maintained implementation reference; full launch acceptance remains open
Source baseline: Product Specification v1.0 and Master Technical Document v3.0  
Last guidance reconciliation: 2026-10-23

This documentation describes a multi-tenant SaaS platform that combines compliant WhatsApp marketing, contact management, a shared team inbox, and graph-based automation. The product must use the official WhatsApp Business Platform. Unofficial WhatsApp Web automation and attempts to bypass provider limits are explicitly out of scope.

## Start here

- [Current state, evidence boundaries and document ownership](CURRENT_STATE.md)

- [Product requirements](PRD.md)
- [Architecture summary](ARCHITECTURE.md)
- [Design system](DESIGN.md)
- [MVP application flows](APP_FLOWS.md)
- [Implementation and sign-off plan](IMPLEMENTATION_PLAN.md)
- [Pre-build readiness](PRE_BUILD_READINESS.md)
- [Security requirements](SECURITY.md)
- [Test plan](TEST_PLAN.md)
- [Architecture decisions](DECISIONS.md)
- [Clarification and implementation decision log](CLARIFICATION_DECISION_LOG.md)
- [Current project memory](MEMORY.md)
- [Local development infrastructure](LOCAL_DEVELOPMENT.md)
- [MVP database schema](DATABASE_SCHEMA.md)
- [Database runtime and migration operations](DATABASE_OPERATIONS.md)
- [Database bootstrap seed](BOOTSTRAP_SEED.md)

Repository-level execution rules and tasks are maintained in `../RULES.md`, `../TASKS.md`, and `../AGENTS.md`.

## Documentation map

1. [Product vision and scope](00-product-vision-and-scope.md)
2. [Functional requirements](01-functional-requirements.md)
3. [Roles, permissions, and tenancy](02-roles-permissions-and-tenancy.md)
4. [User experience and screen map](03-user-experience-and-screen-map.md)
5. [System architecture](04-system-architecture.md)
6. [Domain and data model](05-domain-and-data-model.md)
7. [API contracts](06-api-contracts.md)
8. [WhatsApp provider integration](07-whatsapp-provider-integration.md)
9. [Messaging, campaigns, and webhooks](08-messaging-campaigns-and-webhooks.md)
10. [Inbox and automation](09-inbox-and-automation.md)
11. [Security, privacy, and compliance](10-security-privacy-and-compliance.md)
12. [Plans, usage, and billing](11-plans-usage-and-billing.md)
13. [DevOps, reliability, and observability](12-devops-reliability-and-observability.md)
14. [Testing and acceptance](13-testing-and-acceptance.md)
15. [Delivery roadmap, risks, and open decisions](14-roadmap-risks-and-open-decisions.md)
16. [Requirements traceability](15-requirements-traceability.md)
17. [Railway deployment and capacity](16-railway-deployment-and-capacity.md)

The pre-build readiness document maps the six required planning artifacts to their canonical project files. Detailed engineering design remains in `../design-doc/`.

## Binding architectural decisions

- Repository: one pnpm/Turborepo monorepo for the MVP, with independently deployable applications.
- Frontend: a dedicated Next.js App Router application written in TypeScript.
- Backend: a dedicated NestJS REST API written in TypeScript; Next.js route handlers are not the primary business backend.
- Workers: separate NestJS/BullMQ worker processes for messaging, webhooks, imports, scheduling, and automation.
- Initial shape: modular monolith with separate worker processes.
- Database: PostgreSQL.
- Data access and migrations: Drizzle ORM and drizzle-kit, with committed SQL migrations.
- Queue/cache: Redis with BullMQ or equivalent.
- Object storage: S3-compatible storage.
- Inbox refresh: authorized REST polling for the first release (ADR-021); SSE/WebSocket infrastructure is deferred.
- Provider: Meta WhatsApp Cloud API behind an internal adapter.
- Onboarding: Meta Embedded Signup, subject to the approved partner arrangement.
- Events: verified webhooks, durable event persistence, and idempotent processors.
- Tenant isolation: enforced in API, service/repository, database access, object storage, cache, and queues.
- Python: not part of the core MVP stack; it may be introduced later as an isolated AI or data-processing service when justified.
- Full-rollout deployment plan: Railway Pro for web, API, workers, scheduler, PostgreSQL, Redis and S3-compatible storage. Current hosted preview instead uses trial credit and Web/API/PostgreSQL/Redis only; see RAILWAY_LIMITED_PREVIEW.md. The full plan is not deployed or launch-approved merely by being documented.
- Capacity target: 1,000-1,200 registered/daily users and approximately 100-300 concurrent active users, not a measured guarantee. Initial launch workload and focused verification follow MVP_DELIVERY_PRIORITIES.md; extended scale acceptance remains separately tracked.

## Requirement language

- **Must**: required for security, correctness, compliance, or acceptance.
- **Should**: recommended baseline; deviation needs a documented reason.
- **May**: optional or phase-dependent.
- **Open decision**: intentionally unresolved and listed in the roadmap document.

## MVP boundary

The MVP includes tenant-aware authentication and authorization, aggregate-only Super Admin oversight, single-business Tenant Admin/Tenant User experiences, exact-version Admin approval of User campaign/template work, packages and server-side limits, approved WhatsApp onboarding, account and template synchronization, contacts and imports, campaigns and scheduling, asynchronous outbound messaging, webhook status processing, shared inbox, human replies, basic interactive automation and handoff, audit logs, and basic reporting.

Advanced visual automation, WhatsApp Flows, public customer APIs, external integrations, AI, white-labeling, and advanced analytics are post-MVP unless specifically promoted through change control.
