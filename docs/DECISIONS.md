# Architecture Decision Record Index

TASK-091 / CLAR-081: [ADR-034](adr-034-partner-super-admin-handover.md) adds restricted
partner creation and extends existing password handover to new pending platform accounts,
without changing bootstrap/existing owners or tenant privacy.

TASK-088 / CLAR-077: [ADR-033](adr-033-consolidated-schema-snapshot.md) is withdrawn after
the owner clarified that each table must remain in its own SQL file. ADR-010/014 split layout
remains binding. Future executable structure changes still use new versioned migrations;
applied migration history stays immutable.

The summaries below point to binding decisions and their amendments. Original ADR text is
retained as decision evidence; numbers and implementation status in historical decisions
describe that checkpoint. Current implementation/hosting state: [CURRENT_STATE.md](CURRENT_STATE.md).

TASK-032.2: [ADR-032](adr-032-direct-meta-embedded-signup.md) records approved direct
Tech Provider code flow, bound Redis attempts and atomic encrypted connection without activation.

TASK-032.2.1: [ADR-031](adr-031-encrypted-provider-credentials.md) records owner-approved
encrypted PostgreSQL tokens, separate versioned keys and shared API/Worker resolution.

TASK-032.1: [ADR-030](adr-030-configurable-whatsapp-onboarding.md) records server-selected
onboarding mode with fail-closed readiness; ADR-031 adds encrypted persistence and ADR-032
implements direct signup. Live provider acceptance remains separate.

TASK-082.4.6: [ADR-029](adr-029-storage-free-authoring-preview.md) expands preview
authoring/reporting while retaining server-side background-operation denial (CLAR-070).

TASK-082.4.5: [ADR-028](adr-028-initial-password-change.md) records restricted first-login
sessions, persisted mandatory change, all-session revocation and fresh-login handover.

TASK-082.4.4: [ADR-027](adr-027-preview-db-administration.md) enables approved existing
DB-only platform and Tenant Admin administration in preview (CLAR-068), amending ADR-024.

TASK-082.4.3: [ADR-026](adr-026-first-super-admin-bootstrap.md) adds owner-approved protected
first-Super-Admin initialization without tenant seeding or a new schema (CLAR-067).

TASK-082.4.2.2: [ADR-025](adr-025-same-origin-preview-proxy.md) adds the owner-approved
fixed-target Next.js preview proxy without custom domains or cookie weakening (CLAR-066).

TASK-082.4.2: [ADR-024](adr-024-limited-preview.md) adds the owner-approved explicit
four-service limited preview, without replacing the full MVP architecture.

TASK-081: [ADR-023](adr-023-bounded-report-exports.md) selects owner-approved bounded direct
CSV downloads and defers large asynchronous exports (CLAR-041).

Phase 7: [ADR-022](adr-022-basic-automation-runtime.md) extends the existing server-only runtime
reuse and common messaging/provider boundaries for owner-approved basic automation (CLAR-038).

TASK-064: [ADR-021](adr-021-inbox-polling.md) selects the owner-approved REST polling fallback
for the first Inbox. TASK-066 integrated it into the UI; local coverage is recorded in
PHASE_6_TEST_REPORT.md. No SSE/WebSocket infrastructure or hosted capacity certification is implied.

TASK-055: see [ADR-020](adr-020-campaign-runtime.md) for the server-only workspace export that
lets the worker execute the existing campaign/messaging services without HTTP calls or a second
composition path.

Decisions are stable until explicitly superseded. Each material replacement requires a new ADR rather than silently rewriting history.

TASK-052: see [ADR-019](adr-019-outbound-delivery.md) for the approved shared provider,
durable delivery claims, FAILED terminal state and restricted replay semantics.

## ADR-001 - Separate frontend, API, and workers

Decision: use a Next.js frontend, dedicated NestJS REST API, and separate NestJS/BullMQ workers.

Reason: webhook handling, campaigns, imports, scheduling, retries, and automation require durable backend processes independent of frontend requests.

## ADR-002 - Modular monolith first

Decision: keep one modular backend codebase with clean domain boundaries and independently deployable workers.

Reason: the first 1,200-user target does not justify microservice operational overhead.

## ADR-003 - PostgreSQL is authoritative

Decision: PostgreSQL stores business state; Redis provides queues, cache, locks, and rate control.

Reason: durable transactional state and recoverable queue handoff are required.

## ADR-004 - Official Meta integration only

Decision: use Meta WhatsApp Cloud API, Business Management API, Embedded Signup, and verified webhooks behind a provider adapter.

Reason: compliance, reliability, account safety, and controlled API version changes.

## ADR-005 - Railway Pro MVP deployment

Decision: deploy web, API, worker, singleton scheduler, PostgreSQL, Redis, and Bucket within one Railway Pro project.

Reason: one economical ecosystem matches the required long-running services and reduces first-stage operational complexity.

## ADR-006 - Product scope exclusions

Decision: Contacts and Groups are included. Tags and Lead CRM are excluded from the MVP and current product documentation.

Reason: keep the first release focused on compliant messaging, campaigns, inbox, and basic automation.

## ADR-007 - Asynchronous bulk work

Decision: campaigns, imports, webhook business processing, automation delays, and exports use durable background jobs.

Reason: work must survive browser closure, process restart, traffic spikes, and retryable provider failure.

## ADR-008 - Tenant isolation defense in depth

Decision: enforce tenant scope through authenticated context, permission checks, repository predicates, tenant-scoped infrastructure keys, and automated tests; evaluate PostgreSQL RLS as an additional production layer.

Reason: cross-tenant leakage is the highest-impact application risk.

## ADR-009 - Drizzle for PostgreSQL data access

Decision: use Drizzle ORM with drizzle-kit and PostgreSQL. Commit generated/reviewed SQL migrations to source and use parameterized SQL through Drizzle or its underlying PostgreSQL driver for database features that need direct SQL control.

Reason: the backend LLD is SQL-first and requires explicit control over constraints, partial indexes, transactions, locking, outbox queries, and tenant-scoped access while retaining strong TypeScript types.

## ADR-010 - Modular schema contract and scoped soft deletion

Current clarification: CLAR-077 retains this one-file-per-table layout; ADR-033 was withdrawn.

Decision: maintain the approved logical PostgreSQL design in
`apps/api/database/schema/`, with one SQL file per MVP table, a machine-readable table
manifest, relationship documentation, and structural verification. Drizzle definitions
and migrations must match the contract. API-deletable business entities use audited
`is_deleted`, `deleted_at`, and `deleted_by` soft deletion with active-only queries and
partial uniqueness; append-only and operational/history tables use lifecycle or retention
semantics instead. Ordinary API operations never depend on hard-delete cascades.

Reason: a visible, verified 33-table contract prevents speculative schema changes and
cross-tenant relationship mistakes while preserving audit, replay, delivery, session, and
automation history. Scoped soft deletion supports accidental-deletion recovery without
misrepresenting it as backup or permanent privacy erasure.

## ADR-011 - Platform administration is metadata and aggregate only

Status: Superseded by ADR-012. The Super Admin privacy boundary remains valid, but Admin
is now correctly defined as the tenant business owner rather than a scoped platform role.

Decision: treat explicit `user_tenant_scopes` as the MVP Admin department boundary and do
not add a department entity. Super Admin manages Admin accounts globally; Admin manages
users only inside assigned scope. Platform administration uses purpose-built projections
for account identity/role/status/scope, operational health, subscription/usage, aggregate
contact/campaign/message/send metrics, and redacted audit metadata. Super Admin and Admin
must not access tenant contact PII, communication content, recipient-level delivery data,
customer media, raw provider payload content, content search, signed content downloads,
detailed customer-data exports, or tenant-content realtime channels through the
application. The MVP has no break-glass customer-content path. Direct database operations
remain separately restricted and audited infrastructure work outside application RBAC.

Reason: platform operations require enough visibility to administer accounts and diagnose
service health, but platform roles do not need customer identity or conversation content.
Separating administration projections from tenant-content paths minimizes privacy exposure,
prevents Super Admin from becoming an implicit content bypass, and preserves the approved
33-table schema.

## ADR-012 - Super Admin, single-business tenant roles, and exact-version approval

Decision: Super Admin is the only platform role and is limited to business/Admin account
management, plans, billing, operational health, aggregate activity, and redacted audit
metadata. Tenant Admin is the client/business owner with full authorized access to exactly
one tenant. Tenant User is an employee/assistant with Admin-granted permissions in exactly
one tenant. Super Admin creates/activates the initial Admin; Tenant Admin manages its
Users. Super Admin has no application path to tenant contact PII or communication content.

User-created or materially User-edited campaigns and templates require a different active
Tenant Admin of the same tenant to approve the exact current `content_version`. Campaign
material changes include audience, content/template, variables, sending account, and
schedule. Template material changes include send-relevant content/configuration. A
material User edit invalidates prior approval. Admin-authored/materially Admin-edited work
uses `NOT_REQUIRED`. Template internal approval is separate from Meta approval, and API
plus worker paths revalidate both before external side effects. Routine granted User
operations such as Contact/Group CRUD, inbox replies, and tracking need no approval.

Keep the existing 33 tables: enforce one active tenant membership per Tenant Admin/User in
`user_tenant_scopes`, and store internal approval/version fields directly on `templates`
and `campaigns`. Approval decisions and invalidations also generate append-only audit
records.

Reason: this matches the commercial model—platform owners oversee accounts while each
client owns one isolated workspace—and prevents cross-business switching. Binding approval
to a material version closes stale-approval and post-review edit bypasses without adding a
premature workflow subsystem or another table.

## ADR-013 - Strict Controller-Service-Repository backend layering

Decision: every backend feature uses the traditional Controller-Service-Repository flow.
`*.controller.ts` files own HTTP/transport mechanics and delegate immediately to
`*.service.ts`. Services own use-case orchestration, business/domain rules, calculations,
authorization and policy checks, transaction coordination, audit/outbox coordination, and
calls to injected external adapters without depending on HTTP objects or status codes.
`*.repository.ts` files alone access Drizzle, database clients, ORM records, raw SQL,
locks, and persistence mapping; optional `*.entity.ts`/`*.model.ts` files hold mappings.
Repositories do not decide business workflow. NestJS constructor dependency injection
wires Repository -> Service -> Controller. Queue processors follow the controller rule and
call services rather than repositories. External services remain behind adapters
coordinated by services.

Layers must not be collapsed or bypassed unless the owner explicitly approves a recorded
exception. Backend code shown in implementation responses must be separated by layer and
include the dependency-injection wiring needed to make ownership clear.

Reason: a strict and visible dependency direction prevents HTTP, business, and persistence
concerns from becoming coupled; keeps tenant/soft-delete queries centralized; makes domain
behavior independently testable; and gives all contributors a predictable feature
structure as the application grows.

## ADR-014 - Canonical SQL and Drizzle migration parity

Current clarification: CLAR-077 retains the split SQL layout and Drizzle/migration parity; ADR-033 was withdrawn.

Decision: retain the one-table-per-file SQL under `apps/api/database/schema/` as the
approved human-readable contract and maintain one matching typed Drizzle persistence model
under `apps/api/src/database/schema/`. The typed model is intentionally consolidated to
avoid runtime import cycles across the schema's circular foreign keys. drizzle-kit owns
the versioned snapshot and generates the forward SQL migration; PostgreSQL-only objects
that drizzle-kit cannot model—`pgcrypto`, deferred circular foreign keys, the shared
`set_updated_at` function, and its triggers—are reviewed into that migration explicitly.
The API uses the supported `pg` driver beneath Drizzle.

Every schema change must update both representations and pass static verification plus a
clean PostgreSQL execution/parity review. Composite key column order is binding because it
enforces tenant-safe relationships; generated output must never be accepted without review.

Reason: Drizzle supplies strongly typed repository access and repeatable migrations, while
the SQL-first contract preserves precise PostgreSQL semantics and reviewability. Explicit
parity checks prevent introspection or generation defects from silently changing tenant
keys, indexes, constraints, or lifecycle triggers.

## ADR-015 - Explicit database transactions and controlled migrations

Decision: the API owns a bounded node-postgres pool and typed Drizzle client through a
global NestJS database module. Application services inject a transaction manager and pass
its transaction explicitly to repositories. Outbox creation requires that transaction and
cannot use the root client, so business state and its durable event commit atomically.
Queue publication and all external calls occur only after commit.

Migrations are forward-only and run once through an explicit release command; API and
worker startup never apply schema changes. Normal runtime identities should not require DDL
permissions. Failed releases use compatible code rollback, a reviewed forward corrective
migration, or backup/PITR recovery rather than destructive automatic down migrations.

Reason: explicit transaction ownership preserves Controller-Service-Repository boundaries
and makes atomicity visible at every call site. A controlled migration job avoids races
between replicas, limits DDL authority, and provides a reviewable recovery point.

## ADR-016 - Explicit and conflict-safe database bootstrap

Decision: initialize a newly migrated environment through an explicit `schema:seed`
maintenance command, never API or application startup. Require environment-supplied
identities and strong temporary passwords for one Super Admin, one tenant Admin, one
tenant User, and their initial tenant. Hash passwords with Argon2id before opening one
transaction protected by a PostgreSQL advisory lock. Within that transaction, seed the
stable permission catalog, exact system-role assignments, single-business memberships,
one non-commercial `MVP_INTERNAL` plan/subscription, and one redacted audit record.

Reruns may reconcile owned permission descriptions and exact system-role mappings, but
must not overwrite passwords, account status, or user names. An incompatible email, role,
tenant, membership, plan, or subscription causes the full operation to roll back. The
internal plan's environment-configurable limits are development/bootstrap entitlements,
not approved commercial pricing.

Reason: first-environment setup needs repeatability without committed credentials,
duplicate principals, partial authorization state, silent entitlement changes, or a
startup-time mutation path. Conflict failure protects existing accounts, while exact
system-role assignments keep the security baseline deterministic.

## ADR-017 - Browser authentication and refresh-family lifecycle

Decision: issue a 15-minute HS256 access token in the JSON response with only minimal
identity/session claims. Keep a 256-bit opaque refresh token exclusively in an HttpOnly,
SameSite=Strict cookie scoped to `/api/v1/auth` and mark it Secure in production. Store
only its HMAC-SHA256 digest in PostgreSQL. Refresh rotation creates a replacement session,
revokes the prior row, retains the family's original absolute 30-day expiry, and revokes
the entire family with redacted audit evidence if an old token is reused. Logout is
idempotent and revokes the presented family. Validate browser origins and enforce
Redis-backed fixed-window login limits by normalized email and client IP; fail login
closed if rate control is unavailable. Do not invent a 2FA challenge: deny an account
already marked 2FA-enabled with `TWO_FACTOR_REQUIRED` until that flow is approved.

Reason: a browser-inaccessible rotating credential limits token theft, absolute expiry
prevents indefinite session extension, durable family state supports deterministic
revocation, and reuse detection contains replay. Dual-key throttling reduces distributed
and account-targeted guessing without leaking account existence.

## ADR-018 - Live authorization context and non-bypassable tenant scope

Decision: every protected request verifies the minimal access token and then resolves its
exact live PostgreSQL session, active account, system role, single-business membership,
active tenant, and current role-permission assignments. Authorization is not derived from
browser-provided role, permission, or tenant values. Permission decorators use all-of
semantics. Tenant-content routes additionally require a non-platform Tenant Admin/User
and convert the authenticated context into a non-null `TenantRepositoryContext`; future
tenant repositories require that context and an explicit `tenant_id` predicate. Super
Admin can use only separately designed platform metadata/aggregate routes and can never
obtain tenant-content context.

The identity API exposes a safe `/me` projection, active owned-session listing, and owned
session-family revocation. Session selection includes both actor ID and session ID;
revocation and redacted audit evidence commit atomically. Current-session revocation is
allowed and immediately invalidates its access token because guards verify session state.

Reason: short token lifetime alone does not promptly enforce logout, role changes,
account suspension, or tenant changes. Server-side resolution makes those changes
effective on the next request, while the branded tenant context and repository predicate
create explicit, reviewable barriers against cross-tenant and platform-content bypasses.
