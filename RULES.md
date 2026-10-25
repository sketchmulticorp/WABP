# Development Rules

## General

- Follow `docs/MVP_DELIVERY_PRIORITIES.md` (CLAR-030): prioritize a usable end-to-end MVP, keep the approved stack and existing working implementation, and avoid speculative abstractions, infrastructure or scale optimization. Complete core workflows before advanced features. Preserve layering, security, tenant isolation, approval, consent, idempotency and data-integrity guarantees.
- Separate focused launch-safety verification from extended stress/fault-injection work. Deferred hardening does not block the next core implementation task, does not count as passing coverage, and does not waive launch-critical checks or justify unverified capacity claims.

- Use TypeScript strict mode for web, API, workers, and shared packages.
- Keep functions focused and modules cohesive.
- Reuse existing components, services, DTOs, and utilities.
- Do not duplicate business or provider logic.
- Do not modify unrelated files or silently expand scope.
- Prefer explicit state machines and stable error codes over implicit booleans.
- Write production code at a senior-engineer standard: readable by another developer without relying on hidden context, clever shortcuts, or undocumented conventions.

## Code design and SOLID

- Apply SOLID principles pragmatically to new code and changes to existing code. Do not create abstractions, interfaces, or layers without a real variation point, boundary, or testing need.
- **Single responsibility:** each page, component, hook, controller, service, repository, queue processor, and utility has one clear reason to change.
- **Open/closed:** extend provider behavior, policies, message types, and workflow actions through existing adapters, strategies, registries, or composition instead of growing unrelated conditional branches.
- **Liskov substitution:** implementations must preserve the contracts, error behavior, authorization expectations, and side-effect guarantees of the interface they implement.
- **Interface segregation:** expose small capability-focused contracts; do not make consumers depend on methods or data they do not use.
- **Dependency inversion:** business rules depend on domain/application contracts. Framework, database, queue, storage, and provider details implement those contracts at the boundary.
- Keep dependency flow explicit: presentation/transport -> application/use case -> domain. Infrastructure may implement inward-facing interfaces, but domain code must not import controllers, ORM models, framework request objects, or provider SDK payloads.
- Prefer composition over inheritance. Use inheritance only when the subtype relationship and shared lifecycle are stable and meaningful.
- Refactor when a change would otherwise duplicate logic, mix responsibilities, or create a second source of truth. Do not perform unrelated speculative refactors.

## Repository and feature structure

- Organize code by business capability first, then by technical responsibility inside that capability. Avoid global folders that become unrelated collections of services, hooks, or helpers.
- A new feature must have one obvious ownership location. Do not implement the same workflow independently in frontend pages, API controllers, workers, or shared packages.
- Shared packages contain stable cross-application contracts, configuration, or genuinely reusable UI primitives. Feature-specific code remains with its owning feature.
- Browser-safe packages must never import server-only modules, database clients, provider SDKs, credentials, or Node-only secrets.

### Frontend structure

- `apps/web/app/` owns routing, layouts, route-level metadata, and composition. Route files should be thin and delegate feature behavior rather than containing business logic.
- Keep feature-specific components, hooks, schemas, view models, and API adapters together under an explicit feature boundary as the application grows.
- Put genuinely reusable visual primitives in `packages/ui`; do not move a component there merely because it is used twice inside one feature.
- Keep server and client component boundaries deliberate. Add `"use client"` only where browser state, effects, events, or browser APIs require it.
- Data access goes through typed application/API adapters. UI components must not construct provider payloads, access database concepts, or duplicate backend authorization and policy rules.
- Separate display components from workflow orchestration when that makes state, testing, and reuse clearer.
- Every page and major component must make its purpose understandable through naming and structure. Add a short documentation comment when its role, workflow boundary, or unusual rendering decision is not obvious.

### Backend and worker structure

- Group API and worker code by domain module consistent with `design-doc/MVP_BACKEND_LLD.md`.
- Every backend feature follows strict traditional Controller-Service-Repository layering. Do not collapse layers into a controller, service, shared helper, or single feature file unless the owner explicitly approves and the exception is documented.
- Controllers use `*.controller.ts`. They own HTTP/routing mechanics, transport DTO parsing, headers/parameters, guard/decorator integration, response mapping, and HTTP status selection. They call services immediately and contain no database/ORM/raw SQL, business rules, calculations, transactions, provider calls, or complex workflow orchestration.
- Application services use `*.service.ts`. They are independent of HTTP request/response objects, cookies, and raw headers. They orchestrate use cases, domain rules, calculations, conditional checks, transactions, authorization/policy enforcement, audit/outbox writes, and calls to external provider/storage/queue adapters. They return pure application data or throw typed domain/application errors—never raw HTTP status codes.
- Repositories use `*.repository.ts`; persistence mappings may use `*.entity.ts` or `*.model.ts` where useful. Repositories alone import/use Drizzle, ORM models, database clients, raw SQL, row locks, and persistence queries. They map persistence records and enforce required tenant/soft-delete predicates, but they do not decide business workflow, permissions, approval policy, or why a write occurs.
- Dependency direction is Controller -> Service -> Repository. Use NestJS constructor dependency injection to pass repositories into services and services into controllers. A controller or queue processor must never inject/call a repository directly, and a repository must never call a service or controller.
- Transactions are initiated/orchestrated by the service through an injected transaction boundary; repositories execute persistence operations using the supplied transaction/session without owning cross-repository business decisions.
- External APIs remain behind provider/infrastructure adapters. Services coordinate those adapters; controllers and repositories never call Meta, storage, email, or other third-party APIs directly.
- Queue processors are transport adapters equivalent to controllers: validate the job envelope, resolve context, and call a service. They contain no business rules or direct persistence.
- Domain logic expresses business rules and state transitions without depending directly on NestJS controllers, HTTP objects, BullMQ jobs, Drizzle records, or Meta payloads.
- Provider adapters own Meta-specific request/response types and normalization. Provider payloads do not leak into domain or browser contracts.
- Cross-cutting code belongs in focused common modules only when multiple domain modules genuinely require the same behavior.

### Backend code presentation

- When returning backend code or examples, label and separate Controller, Service, Repository, and Entity/Model blocks or files so layer ownership is visible.
- Include the constructor-injection wiring needed to show Repository -> Service -> Controller composition.
- Add short inline comments only when the layer boundary, transaction handoff, external side effect, or non-obvious data flow needs explanation; do not narrate routine code.

## Naming, functions, and readability

- Choose names that describe business intent and units, not implementation accidents. Avoid vague names such as `data`, `item`, `manager`, `helper`, or `process` when a precise domain name exists.
- Keep functions small enough to understand as one operation, but do not split linear code into meaningless one-line wrappers.
- Prefer explicit input and output types at public boundaries. Keep DTOs, domain types, persistence records, and provider payloads distinct.
- Use early returns to make validation and failure paths clear. Avoid deeply nested control flow.
- Make side effects visible in names and application-service boundaries. Queries must not silently mutate state.
- Replace unexplained literals with named constants or configuration when the value represents a policy, limit, timeout, state, or protocol rule.
- Return or throw stable, typed application errors. Do not expose raw database or provider errors to controllers, jobs, or clients.

## Comments and technical documentation

- Comments explain **why**, intent, constraints, invariants, security decisions, concurrency behavior, provider limitations, or non-obvious tradeoffs. Code and names should explain **what**.
- Do not add comments that restate a function name, narrate each line, preserve dead code, or compensate for unclear design. Improve the code instead.
- Add concise documentation to exported functions, classes, hooks, components, contracts, and route/page modules when their purpose, inputs, side effects, ownership, or failure behavior is not self-evident.
- Document tenant assumptions, transaction boundaries, idempotency keys, retry semantics, locking, rate limits, and external side effects beside the relevant boundary.
- A workaround must state why it exists, what upstream constraint requires it, and what condition allows its removal.
- TODO/FIXME comments must reference a task/issue or state a concrete follow-up condition; never leave anonymous indefinite debt.
- Update documentation in the same change when behavior, public contracts, data models, configuration, operational steps, or architectural decisions change.

## Decision making and review

- State assumptions and evaluate security, tenancy, data integrity, idempotency, failure recovery, observability, performance, accessibility, and rollback impact before implementing a material change.
- Use established, proven engineering patterns before inventing a new approach. For a material feature, defect, or design decision: inspect the existing system and authoritative requirements; define the actual problem and operational constraints; identify relevant failure, security, tenancy, data-integrity, performance, and recovery concerns; compare the realistic options; and recommend the smallest robust solution compatible with the approved architecture. Novelty, personal preference, and unverified assumptions are not requirements. State the recommendation, alternatives, trade-offs, and why it fits this application before requesting approval to implement.
- Do not imagine a problem, requirement, workflow, provider capability, data rule, or acceptance criterion and then implement a solution for it. Separate verified facts, approved decisions, open questions, and temporary hypotheses explicitly.
- Before frontend or backend coding, restate the approved task scope and identify unresolved questions. A direct user instruction to start a named task is approval for its documented scope, not permission to silently decide unspecified product or architecture behavior.
- When implementation, debugging, or an approved design decision reveals necessary work directly related to the active task, record it before implementation. Use a numbered subtask when it is necessary to meet the active task's acceptance criteria; otherwise add a numbered follow-up task immediately after the related task or at the end of the appropriate phase. Keep one implementation task active, preserve traceability, and never use discovered work to introduce speculative scope or bypass material approval.
- Ask a focused clarification question and wait for approval whenever different reasonable answers would materially change user behavior, UI states, API contracts, database design, authorization, tenant isolation, external side effects, dependencies, deployment cost, security, or acceptance coverage.
- Do not ask again when the answer is already explicit in the PRD, architecture, LLD, task acceptance criteria, ADRs, or clarification log. Low-risk mechanical choices inside an approved design may proceed, but must not be presented as user-approved product decisions.
- If a blocking ambiguity is discovered after coding begins, pause only the affected branch, preserve safe completed work, and request a decision before continuing it.
- Prefer the simplest design that satisfies current requirements and preserves the documented extension points. Do not optimize for hypothetical scale without evidence.
- Record an ADR when changing application boundaries, core dependencies, persistence strategy, tenant isolation, provider integration, messaging guarantees, queue semantics, hosting, or another binding architecture decision.
- Record every material clarification in `docs/CLARIFICATION_DECISION_LOG.md`, including the question, available context/options, user decision, approval status, implementation result, and affected documents. Do not record secrets, credentials, or sensitive customer data.
- When a decision does not require an ADR, also update the relevant design/implementation document or `docs/MEMORY.md` when it changes permanent project behavior, so later work does not rediscover it.
- Reviews must check behavior and architecture, not formatting alone: ownership, dependency direction, authorization, tenant scope, validation, error paths, idempotency, tests, and documentation all matter.

## Before coding

- Read the relevant project documentation and current `docs/MEMORY.md`.
- Confirm the active task and acceptance criteria in `TASKS.md`.
- Confirm that the user approved the task and that every material open question is answered. Do not begin the ambiguous part of implementation while a required decision remains pending.
- Inspect the existing implementation before proposing new structure.
- Identify migrations, security impact, tenant impact, queue impact, and rollback needs.
- Plan large changes before editing.

## Architecture

- `apps/web` owns presentation and browser interaction.
- `apps/api` owns authentication, authorization, business rules, persistence, provider integration, and webhook receipt.
- `apps/worker` owns durable and retryable background work.
- PostgreSQL is the source of truth; Redis is queue/cache/lock infrastructure.
- Controllers and queue processors call services only. Services coordinate domain behavior and injected infrastructure contracts. Repositories alone access ORM models, Drizzle, database clients, and raw SQL.
- Provider payload types remain behind the WhatsApp adapter.
- Browser-safe packages must not import server-only code, secrets, database clients, or provider clients.

## Product scope

- Implement Contacts and Groups.
- Do not implement Tags.
- Do not implement Lead CRM.
- All outbound WhatsApp messages pass through common policy, quota, idempotency, and provider services.
- Bulk work must continue independently of the browser.

## UI

- Follow `docs/DESIGN.md`.
- Provide loading, empty, success, error, disabled, and permission-denied states.
- Support keyboard navigation and accessible labels.
- Preserve responsive behavior at mobile, tablet, and desktop widths.
- Never use frontend visibility as authorization enforcement.

## Backend and data

- CLAR-081: `SuperAdminRepository.isEmailReservedIncludingDeleted` is a named boolean-only provisioning safety query allowed to include deleted identities, solely to prevent account promotion/reclaim. It does not permit returning deleted-user details or bypassing ordinary active-only reads; partner creation never restores existing accounts.

- Derive tenant scope from authenticated context, never from an untrusted body field.
- Include tenant predicates in every tenant-owned repository query.
- Treat `apps/api/database/schema/` as the approved logical PostgreSQL schema contract. Every table, column, constraint, index, relationship, and deletion-strategy change must update the contract, Drizzle definitions, migration, and permanent documentation together; record required tests during implementation and write/run them at phase closure. Never invent a table or column only inside application code.
- CLAR-077: retain exactly one table definition per numbered schema SQL file, plus the separate bootstrap, deferred foreign-key and trigger files. Keep `manifest.json`, `TABLE_MANIFEST.md`, and `RELATIONSHIPS.md` synchronized. Future database structure changes require a new reviewed versioned migration in `apps/api/database/migrations/` and matching Drizzle definitions/current per-table SQL updates; never rewrite an applied migration. Do not execute reference schema files against an existing application database. Run `pnpm schema:verify` after every schema-contract change.
- For tables listed as soft-deletable in `SOFT_DELETE_POLICY.md`, ordinary reads, joins, counts, updates, searches, exports, and authorization queries must explicitly enforce `is_deleted = false`. Access to deleted rows requires an explicitly named, authorized restore/audit repository method.
- API delete operations on soft-deletable tables must set `is_deleted = true`, `deleted_at`, and `deleted_by` in an audited transaction. They must not issue SQL `DELETE`, and they must not rely on database cascade deletion.
- CLAR-067 / ADR-026 permits exactly the named first-Super-Admin bootstrap safety query `hasAnyUserIncludingDeleted` to inspect all user rows without the soft-delete predicate. It exposes no user data and exists only to prevent deleted accounts from reopening initialization; it does not authorize ordinary application reads of deleted users.
- Never add `is_deleted` to audit, usage, webhook, outbox, idempotency, session, message, recipient, immutable automation-version, or other operational/history tables without an approved schema and security decision. Those tables use status, revocation, expiry, or retention policies.
- Soft deletion is not backup or legal erasure. Permanent purging requires a separately approved retention/privacy workflow; database recovery still requires backups and point-in-time recovery.
- Validate all request bodies, route parameters, query parameters, and provider payloads.
- Use transactions for aggregate state plus audit/outbox writes.
- Never hold a database transaction open while calling Meta or object storage.
- Use idempotency for campaign starts, outbound sends, webhooks, usage, and automation side effects.
- Add indexes for measured tenant-scoped access patterns.

## Security

- Never expose or log credentials, authorization headers, full tokens, or encryption keys.
- Never commit real environment values.
- Hash passwords with the approved modern algorithm and store refresh-token hashes only.
- Verify Meta webhook signatures over the raw body.
- Validate file type, size, signature, and malware status.
- Audit security-sensitive and cross-tenant platform actions.
- Treat Super Admin as the only platform role. Tenant Admin is the client/business owner and Tenant User is the Admin's employee/assistant; neither role is a platform operator.
- Bind every Tenant Admin and Tenant User to exactly one business tenant in the MVP. They cannot switch into another business. Super Admin creates and activates the initial business Admin; the business Admin manages users inside that tenant.
- Super Admin may access account-management data, billing, operational health, aggregate contact/campaign/message counts, and authorized redacted audit metadata only. Super Admin must not receive contact records or PII, message bodies or conversation history, customer media, raw provider payload content, content-revealing search results, or detailed customer-data exports through application APIs, UI, realtime channels, jobs, or signed URLs.
- Tenant Admin has full authorized access to their own tenant and may publish campaigns and manage templates directly. Tenant Users may manage permitted tenant operations without per-operation approval, but a User-created or materially User-edited campaign or template requires Tenant Admin approval before campaign scheduling/sending or template submission/use.
- A material campaign change to audience, content/template, variables, sending account, or schedule invalidates prior Admin approval. A material template content/configuration change does the same. The actor who requests approval cannot approve their own work, and workers must revalidate the approved version before external side effects.
- Do not implement a platform break-glass customer-content screen in the MVP. Any future exception requires explicit owner approval, a security/privacy decision, least-privilege controls, and immutable audit evidence.
- Direct database operations are an infrastructure responsibility outside application authorization. They require separately restricted credentials and auditing and must never become an application backdoor.

## Testing

- Do not create/update test files or execute automated tests at every task. Defer them until the phase's implementation tasks are complete, unless explicitly requested earlier by the owner.
- Record pending scenarios and regressions during each task in `docs/TEST_PLAN.md` or a linked phase report. Preserve existing tests and historical results.
- Run relevant formatting, lint, type checking, schema validation, and builds during implementation. Reserve `pnpm check`, which includes tests, for phase closure.
- At each phase boundary, ask the owner whether to write/update and run tests now or defer them to a later phase. Test authoring and execution remain optional until all implementation tasks are finished. Wait for the owner's answer before testing; recorded deferral permits continuing implementation in the next phase.
- When testing is approved, write/update focused unit, integration, contract, security, and Playwright coverage for the phase's core acceptance and affected regressions. Cover applicable success, validation, authorization, tenant isolation, retries, concurrency, and failures. Track exhaustive stress/fault-injection separately under TASK-085; preserve launch-critical checks under TASK-084/086 and existing linked test items. Follow `docs/MVP_DELIVERY_PRIORITIES.md` rather than expanding every checkpoint into production-scale certification.
- Run applicable suites, fix defects, rerun affected cases, and update records with case ID, scenario, expected result, actual result/status, execution command/date, defect/task reference, and retest result. Never claim unexecuted cases passed.
- Preserve test-focused backlog items as pending/deferred when the owner postpones testing; do not mark them complete. Record the decision, pending coverage, and intended later checkpoint. When all implementation tasks are finished, revisit every deferred item and obtain the owner's testing direction. Distinguish phase implementation completion from verified completion and production readiness.
- Never weaken an assertion merely to make a failing test pass.

## Git

- Keep commits small and coherent.
- Use descriptive conventional-style messages such as `feat: add contact import preflight`.
- Do not commit generated secrets, local environment files, coverage, build output, or uploaded test data.
- Do not rewrite shared history or use destructive cleanup without explicit approval.

## Definition of done

A task's implementation is complete when its implementation, authorization, tenant isolation, error handling, observability, migrations, documentation, static/build checks, and applicable implementation acceptance criteria are addressed. Phase implementation may complete with owner-approved testing deferral. Verified completion requires applicable tests to be written, executed, corrected, and recorded; deferral must never be reported as passing tests or production readiness.
