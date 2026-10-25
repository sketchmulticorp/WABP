# Clarification and Implementation Decision Log

### CLAR-083 — Unified online/offline tenant billing control

- Date: 2026-10-25. Status: Approved direction; implementation not started.
- Context: The owner wants tenant usage tracking, support for customers who pay online or offline/cash, and Super Admin control for offline-paid tenants. Existing scope already provides tenant-level usage/quota ledgers, plans/subscriptions, manual append-only payment records and audited platform tenant controls. Manual payment recording intentionally does not activate or extend a subscription, and payment-gateway integration remains deferred.
- Recommendation presented: Keep one entitlement system for both payment channels. For an offline payment, Super Admin first records the payment, then separately and explicitly selects the plan/effective period and activates or extends the subscription. Treat payment evidence and entitlement mutation as distinct audited actions. A future online gateway should use an idempotent adapter/webhook and enter the same subscription workflow rather than create a second tenant type or entitlement path.
- Control boundary presented: Super Admin controls tenant-level plan, subscription and billing state and may use separately authorized tenant suspension for payment, policy, security or abuse. Tenant Admin continues ordinary management of the tenant's regular users; Super Admin does not become a routine cross-tenant team administrator. Platform views remain metadata/aggregate/billing only and never expose tenant customer content.
- Access recommendation presented: Subscription expiry or billing suspension preserves tenant data and approved read-only access but blocks new campaigns, outbound messages, imports and other quota-consuming creation/execution at server-side enforcement points. This is distinct from tenant suspension for security, abuse or policy, which may revoke workspace access entirely.
- Owner answer: “yes go with recommendation flow”. This approves the recommended flow and boundary above.
- Resolution: Record implementation as TASK-093. No application code, schema, gateway, deployment or payment operation is authorized or performed by this clarification alone. Existing manual-payment behavior remains unchanged until TASK-093 is explicitly started and its detailed transition/capability contract is approved.
- Still open: Commercial pricing, supported payment methods/currencies, partial-payment allocation, grace periods, renewal start-date calculation, proration, taxes, invoices, refunds and gateway selection. These choices must not be inferred during implementation.

### CLAR-082 — Partner Super Admin local automated checkpoint

2026-10-25: owner explicitly requested “run the automated tests now” after TASK-091.
Approves test authoring/execution, affected regressions and scoped defect repairs using
mock APIs and named disposable local PostgreSQL/Redis only. No Railway or real partner
provisioning/provider sends. T091 evidence must distinguish assertions run from residual
coverage; prior profile/other deferred suites are not automatically complete.
Resolution: focused creation25/auth32, disposable integration15 (including parent) and
mocked Chromium11 checks passed. Repaired real PostgreSQL FOR UPDATE target generation
by locking the user row separately before joined eligibility checks; browser harness timing/
alert selectors corrected. See SUPER_ADMIN_TEST_REPORT.md for residual unverified cases.

### CLAR-081 — Partner Super Admin creation

2026-10-25: owner explicitly approved the proposed Add Super Admin UI/API, available only
to existing Super Admins, with name/email/temporary password, mandatory first-login password
change and audit logging. TASK-091 extends the existing handover to pending platform accounts;
existing owners are not retroactively forced. Reuse existing user.invite, strong password
validation, Argon2id, actor limiter and transaction boundaries; no schema/dependency needed.
Create-only scope excludes listing, editing, deletion, restoration, password resets and emails.
Server derives role from the live authenticated platform role; no tenant or membership is
created. Existing email identities, including deleted ones, must not be reassigned/promoted
by this path; named reserved-email check returns only a boolean. No real account is created
by the agent, no hosted changes or tests authorized. ADR-034 amends handover scope only.
Resolution: implemented dedicated creation layers/contract, shared strict account parser,
partner first-login eligibility and platform-only creation screen. Static builds/lint/typecheck/
schema/diff checks passed. No migration/deployment/real account or automated test execution;
T091 cases remain pending owner checkpoint choice, not certified by prior tenant suites.

### CLAR-080 — Railway development-first branch/environment promotion

- Date: 2026-10-25.
- Context: The owner chose to keep the complete application on Railway and plans a Railway Pro
  subscription. The owner wants full implementation and end-to-end testing on `dev` before any
  production promotion, with `main` unchanged until explicitly approved.
- Owner answer/approval: Use one Railway project with two isolated persistent environments.
  `development` follows `dev`; `production` follows `main`. Work in development until the full
  expected application passes E2E/UAT, then promote through an owner-approved `dev` -> `main`
  review. No separate `PROD` branch.
- Resolution: Development will eventually contain Web, API, Worker, exactly one Scheduler,
  PostgreSQL, Redis, Bucket, private ClamAV and test SMTP, using development-only domains, data,
  queue prefix, secrets, encryption keys, Meta test assets/credentials and webhook destination.
  Production keeps the current preview unchanged until a separate promotion decision and
  production change plan. Environment configuration differs through Railway variables, not
  divergent code branches.
- Gates: Development acceptance does not authorize production. Promotion separately reviews
  migrations, backups/restore, monitoring/alerts, cost controls, production credentials and
  Meta webhooks, remaining security/acceptance coverage and post-deploy smoke checks. Never copy
  production customer data or secrets into development.
- Scope boundary: Documentation only. No branch creation/merge, commit/push, Railway mutation,
  paid-plan action, migration, seed, test execution, provider call or live send is authorized.
  ADR-005 already selects one Railway Pro project and remains unchanged; no new ADR is required.

### CLAR-078 — Reflect migration changes in each table's current SQL

2026-10-23: owner clarified “combine or merge migrations sqls to schema sqls” means reflecting
each migration's changes in its corresponding separate table definition, not combining tables
into one file. Review found0001–0010 follow-up changes already present in the current per-table
contract, including payment/preflight tables, outbox claims, contact consent/index, import
retention/deduplication, campaign lifecycle, initial-password flag and encrypted credentials.
Keep applied migrations unchanged; do not append duplicate ALTER statements to existing CREATE
definitions. TASK-088.1 records review/mapping/static validation, not full live SQL parity testing.

### CLAR-077 — Keep each table in a separate SQL file

2026-10-23: owner clarified repeatedly, with the original per-table file list screenshot,
that combining SQL into one file is not wanted. This supersedes CLAR-076's consolidation
interpretation. Restore all separate SQL files and original manifest/tools; remove the
combined SQL and new reader. ADR-033 is retained as withdrawn evidence, not a binding layout.
Future structure changes still use new versioned migrations and matching Drizzle/per-table
contract updates. No database, application data or applied migration changes authorized/run.

### CLAR-076 — Consolidated schema with migration-first future changes

2026-10-23: owner approved the recommended single schema/schema.sql, removal of the split
SQL after mechanical verification, retained relationship/policy docs, and future structure
changes through new reviewed migrations. Keep typed Drizzle definitions and consolidated
current schema synchronized; never rewrite applied migrations. “New data” here means schema
evolution, not ordinary application records. TASK-088 / ADR-033 amend ADR-010/014 layout only.
No live/local migration execution, data change, runtime test suite or seed/reset authorized.

## Reading this log

This is retained approval/history evidence, not a consolidated current configuration guide.
Later explicit decisions supersede earlier incompatible statements; historical assertions
remain evidence of their checkpoint, not present-day verification. Start with
[Current state and document ownership](CURRENT_STATE.md), then follow the relevant ADR/task.

### CLAR-075 — Documentation reconciliation without evidence deletion

2026-10-23: owner approved correcting the listed stale/duplicate Markdown guidance and
explicitly required keeping ADRs, approvals, test reports and deferred-test records.
TASK-087 is documentation-only: reconcile established decisions, label history in place,
and add a current-state/ownership entry point. No new product/architecture decision,
feature acceptance, runtime changes, tests, data deletion or hosted operations authorized.
Existing uncommitted code/UI work is outside this cleanup and must be preserved.
Resolution: reconciled current guidance and preview capability table, corrected schema counts
and encrypted-storage description, removed one duplicated deployment paragraph, labelled
dated walkthrough/deployment evidence, and added CURRENT_STATE.md. Existing evidence retained
in place; no ADR file/test report/TEST_PLAN edits. Selected local Markdown link targets and
git diff --check passed. Static document checks are not application or launch verification.

### CLAR-074 — Apply pending hosted migration

2026-10-23: owner explicitly asked agent to run migrations on the repaired Railway deployment.
Approved scope: existing runtime migrator against the API-configured database, no seed/reset.
Read10 applied; migrator succeeded; read11 applied and verified encrypted credential column/
constraint. TASK-082.4.8 and MEMORY record evidence. No ongoing pre-deploy configuration or
authenticated/provider test authority inferred from this one-time execution request.

### CLAR-073 — Repair missing public Web domain

2026-10-23: owner asked agent to fix deployment, then explicitly approved generating a
Web-only public domain at action time after the public-exposure consequence was explained.
API/DB/Redis remain private; trial-only budget and no paid upgrade preserved. Actual failure:
three API public-origin references evaluated to https:// because Web had no generated domain.
Generation restored reference resolution; no variable edits needed. API redeploy6964ca35 Active,
all services Online, login rendered and unauthenticated /me safely denied. No authenticated
flow/readiness or customer launch certification. Permanent incident details in MEMORY.md.

### CLAR-072 — Own Profile and ordinary password change

2026-10-22: Owner answered “yes do it” to the recommended shared Profile page for
Super Admin, Tenant Admin and Tenant User. Approved: view own name/email/role/business,
edit own name only, change password with current-password verification, revoke every
session and require fresh sign-in. Email, role and business remain read-only; no avatar,
storage dependency, account impersonation or administrative reset is included.
Reuse the existing password strength, rate limiter, authentication locks, transaction,
cookie and first-login gate. No material clarification remains. TASK-086.8 tracks work;
automated test authoring/execution remains subject to the owner’s checkpoint choice.
Resolution: implemented shared screen, name-only own-actor PATCH, and ordinary password route
using the existing authentication transaction/locks. Static/build/schema checks passed; no
automated/runtime verification claim. Permanent behavior is in PROFILE.md and SECURITY.md.

### CLAR-071 — Configurable agency/client WhatsApp onboarding

Owner selected the recommended direct Tech Provider approach2026-10-21. No agency credit-line
sharing, BSP integration or agency rebilling of Meta usage is introduced. Proceed with direct
business-token onboarding; external registration/subscription/payment activation must remain
explicit and must not claim that preview enables webhooks/messaging. Local tests use mocks.

Resolved follow-up: owner selected direct Meta Tech Provider onboarding rather than an existing
BSP/Solution Partner arrangement. No credit sharing or partner billing obligations introduced.
Connection is implemented; registration/payment/webhook activation remains separate. Combined
local checks passed35 focused,31 smoke/auth,13 SQL/Redis and19 browser tests; see report for
exact scope and remaining acceptance. No live/provider/hosted changes performed.

Owner subsequently answered “sure” to encrypted PostgreSQL tokens with a separate server key.
This approves credential schema/migration source changes without adding a service. ADR-031:
authenticated AES-GCM envelope bound to tenant/account/credential, separate validated keyring,
opaque references, unchanged development fallback, shared API/Worker repository/resolver and
internal audited persistence service. No public token endpoint, key generation, hosted migration
or deployment. Foundation and secure signup testing remain combined, not run separately.

Owner follow-up2026-10-21: combine foundation tests with secure signup testing. This approves
the combined test checkpoint. The separate encrypted-PostgreSQL storage decision was approved
subsequently above; it is no longer unanswered.

2026-10-21: Owner confirmed both agency-managed and client-connected businesses, currently
Meta development/unverified, and approved per-client Tenant Admin operation without changing
Super Admin privacy. Owner will manage Meta approvals/configuration manually and approved
starting a generic server-mode foundation plus subsequent secure completion.
Implemented mode/config-ID validation, safe tenant API projection, API-driven UI and service
denial of manual development mapping outside development. No auto calls or readiness claims.
The reference-only contract was subsequently amended by approved ADR-031. Ciphertext is stored
only in encrypted_token, not secret_ref. ADR-030/031 and WHATSAPP_ONBOARDING.md record scope.

### CLAR-070 — Storage-free preview expansion

2026-10-21: Owner approved the first-step recommendation and local Docker testing: existing
tenant reports/direct CSV, development WhatsApp setup/explicit sync, templates and campaign
drafts/internal review. Campaign services block preflight/delivery commands. Inbox/automation/
webhooks/imports remain absent. Reuse existing paths and validate optional server Meta settings.
No live provider testing, Railway mutation, paid process or hosted migration/deploy authorized.
ADR-029 records the amendment to earlier preview exclusions.

### CLAR-069 — Mandatory first-login password change

Owner answered “sure” to the tenant-scoped provisioning repair and rerun recommendation
on2026-10-19. TASK-082.4.5.3 now approved: new businesses receive tenant-owned Admin/User
roles with existing catalog permissions in the creation transaction; Team resolves only
its own tenant's system User role. Reuse seed persistence/catalog, keep role eligibility,
tenant membership, required-password flags and restore semantics unchanged. No automatic
backfill/global-role relaxation or hosted writes. Local acceptance regression authorized.

Resolution: TenantRoleProvisioningService uses existing SeedRepository and catalog.
PlatformService creates tenant, its two roles/grants, first Admin/membership and audit
in the same transaction; repository methods contain persistence only. Team lookup
requires current tenant, TENANT_USER, is_system=true and is_deleted=false. No auth
eligibility relaxation or edits to existing roles. Actual creation/handover/restore,
foreign-role denial and duplicate-email rollback tests pass.11/11 integration tests
(10 scenarios plus parent),30/30 unit regressions and3/3 mocked UI tests pass; broader
pending coverage remains in the report. No new migration/backfill or cloud writes.

Docker checkpoint2026-10-19: owner confirmed engine ready. Disposable local PG/Redis
tests authorized under existing test approval. Seven integration scenarios,30 unit
regressions and3 mocked UI cases passed; actual first-business/Admin provisioning
regression failed (global system Admin role absent). Source confirms tenant-role lookup
mismatch between platform/Team provisioning and seed/live eligibility. Proposed
TASK-082.4.5.3 uses existing tenant-scoped roles and catalog permissions transactionally,
not global-role authorization relaxation. Await owner approval before runtime changes.

2026-10-19 testing checkpoint: owner asked “can you test it?” and explicitly asked to
start deferred tests. Local test authoring/execution approved; no hosted migrations,
Railway account mutations or live provider calls. Started with password-change and
affected auth regression coverage.30 focused tests passed; mocked service tests do
not establish real transaction rollback or concurrent database safety. Docker engine
unavailable; isolated PG/Redis integration and browser coverage remain pending.

Owner subsequently confirmed “yes do the code changes accordingly”: revoke all sessions and
require fresh login after successful change. No automatic replacement session. Newly created
tenant account INSERTs only; existing users remain false by migration default. Restores of
existing soft-deleted accounts retain their prior flag; no retroactive reset mandate. Review identified a
necessary session race: login/refresh must share user-scoped transaction serialization with
credential change or a concurrent old-credential session could survive revocation. Required
subtask082.4.5.1 recorded before implementation. This does not authorize hosted migrations.

2026-10-19: owner approved mandatory password change for newly created Tenant Admins and
Tenant Users and acknowledged implementation review. Existing accounts must not be forced
to reset; this concerns application credentials, not Meta passwords. Review found existing
login/session/RBAC/creation paths but no persisted mandatory-change state or first-login UI.
Plan: schema contract + Drizzle migration, mark new tenant accounts, restrict server access
until change, use existing Argon2id and transactional audit/session revocation, full/preview UI.
No forgot-password/email/invitation or agency impersonation flow authorized. Tests deferred.
The initial session-choice question was resolved by the approval above. Implemented default-
false schema/Drizzle migration0009; tenant INSERT flags, restricted live authorization and /me,
layered initial-password endpoint, Argon2id verification/different replacement, atomic
hash/flag/version/revoke-all/audit, cookie expiration and dedicated Web completion/sign-in UI.
Login/refresh/change share per-user transaction lock and explicit READ COMMITTED; refresh
owner is resolved before session lock. No new dependency or Meta behavior. Static API/Web/
shared checks and Worker typecheck passed;35-table/Drizzle metadata checks passed. Tests
remain deferred (T082-PC01–07). No hosted migration, deploy or account mutation; approve API
pre-deploy migration before source push/auto-deploy. ADR-028 and INITIAL_PASSWORD_CHANGE.md.

### CLAR-068 — Database-only administration in limited preview

2026-10-19: owner challenged Super Admin preview restriction because account administration
uses PostgreSQL, not a bucket, and explicitly said “do it” to enabling existing DB-only
administration. Original CLAR-065 allowlist was broader than necessary for these operations.
Enable existing platform metadata/dashboard/business/Admin/status/plan/subscription/manual
payment/redacted audit and bounded DB-only platform CSV used by those screens, plus existing
Tenant Admin team controls. Reuse layered implementation and live role/permission/tenant
checks. Super Admin cannot see tenant Contacts, messages or recipient records. Do not invent
additional Super Admin creation/deletion flows. No automatic seeds, plans, payments or cloud
actions. Imports, storage, WhatsApp/provider, messaging, Inbox, automation and tenant reporting
stay disabled. Tests deferred. TASK-082.4.4 / ADR-027 amend the preview boundary explicitly.

Implemented shared DB-only administration registrations and existing platform/Team screens;
removed blanket Super Admin placeholder and corrected preview banner. No business/service/
repository policy changes. API/Web lint/typecheck/build, source format/diff and35-table
schema verification passed; restricted-network Geist download retried successfully. No tests
or cloud/account/payment writes. Source not yet deployed; runtime cases T082-AD01–04 pending.

### CLAR-067 — Protected first-Super-Admin initialization API

Hosted checkpoint2026-10-19: owner explicitly approved node dist/database/migrate.js after
Postgres logs confirmed missing app schema during bootstrap. Executed once in API's Railway
console; success message and read-only counts35 app tables/9 migration records confirmed.
No reset/seed/bootstrap/user mutation, no automated tests. Owner retries POST privately.

2026-10-19: owner requested POST with email/password to create only the first Super Admin
when user count is zero. Approved protected approach: temporary server-configured secret
plus atomic one-time creation; soft-deleted users count so API deletion never reopens it.
Super Admin management is deferred (“will check once this all things done”). Endpoint is
not account management and does not initialize tenant/test users or replace migrations.
Implementation reuses approved role/permission catalog and Argon2id, initial display name
“Super Admin”; disabled when secret is absent. Existing immutable audit records provide a
closure marker without a new schema. Table locking plus existing seed advisory lock prevents
parallel bootstrap/CLI/other user insertion races. Automated tests remain owner-deferred.
TASK-082.4.3 tracks implementation; no live call, credentials or cloud mutation authorized.

Implementation: /api/v1/bootstrap/super-admin in full/preview, optional validated
BOOTSTRAP_SECRET supplied via X-Bootstrap-Secret, fixed-size timing-safe comparison, existing
Redis limiter for valid secret holders, existing Argon2id and shared SeedRepository/catalog.
Pure BootstrapError is translated to existing error envelope in controller. READ COMMITTED
transaction sets5-second lock wait bound, shares CLI advisory lock, locks users, checks
all rows and prior completion marker, writes role/permissions/user/redacted audit atomically.
No migrations/schema/new dependency/account management changes. Pending T082-BS01–06 records
runtime/security/concurrency cases under the owner's existing test deferral.

### CLAR-066 — Same-origin preview proxy without a custom domain

Deployment follow-through2026-10-19: owner approved Web-only public domain and confirmed
replacing auth secrets after the review-panel disclosure. Applied API/Web bundle; both are
Online with PG/Redis unchanged. Web HTTPS login page and unauthenticated /api/v1/me routing
verified read-only; API remains private. No database migration/seed, real sends or automated
tests. Hosted database bootstrap still needs explicit owner authorization and private inputs.

2026-10-19: owner confirmed they do not own a domain and answered “sure” to implementing
the recommended Next.js same-origin API proxy. Separate Railway default domains cannot be
assumed same-site for Strict refresh cookies. Prefer built-in fixed-target rewrites over
cookie weakening, a custom proxy service or duplicated authentication handlers. Browser uses
/api/v1 on the Web HTTPS origin; Web proxies to the configured API over private Railway
networking. API keeps business logic, Origin checks, tenancy and existing secure cookies.
No new dependency, purchased domain, paid upgrade, provider call or schema change. This
approves code/docs only, not public exposure, cloud apply or database mutations. Automated
tests remain owner-deferred; static verification is not hosted login acceptance. ADR-025
records the routing/configuration boundary; TASK-082.4.2.2 tracks implementation.

Implemented fixed rewrite plus paired-variable validation, Docker build args, Turbo cache
inputs and production config packaging. Existing browser adapter already accepts /api/v1;
no second API client/auth handler needed. npm contracts build, Web lint/typecheck and proxy
and default production builds passed; syntax/format/diff clean. pnpm could not open its local
engine-store lock, so installed npm/tool binaries were used. No tests, Docker build, cloud
mutation or hosted login verification. T082-PV07 records pending transport acceptance.

### CLAR-065 — Explicit limited Railway preview

Checkpoint decision2026-10-19: owner declined focused tests (“no we can start with deploy
process”). Defer T082-PV01–06 and proceed with deployment preparation only. This does not
authorize a Git push, secret entry, database mutation, public exposure or production launch
implicitly; ask at the relevant action boundary. Runtime validation remains unverified.

Implementation resolution: reduced API config and module composition, /me mode/UI guidance,
full-only worker loading implemented using existing services. No new dependencies/schema.
Eight production build tasks and25 static lint/typecheck prerequisite tasks passed, plus
schema/format/diff. Tests not authored/executed; ask owner at phase closure (T082-PV01–06).
No cloud deployment, secret entry, local .env modification or live send. ADR-024 records scope.

2026-10-19 owner approved recommended limited preview after asking to host DB/API/frontend
and keep uploads local. Redis retained for login rate limiting: four services total.
Scope: login/session roles and tenant manual Contacts/Groups; no imports/files/provider
operations, messaging/campaigns/inbox/automation or background execution. Existing full local
mode remains default. APP_MODE=preview selects reduced API configuration/module composition;
server excludes unsupported controllers/providers, UI explains limitations using /me mode,
Worker/Scheduler reject preview. Super Admin can sign in but never receives tenant content;
full platform/admin/report UI is outside this minimal preview. No schema/dependency changes,
weakened cookies, paid upgrades, cloud apply or real sends authorized. Configuration/module
composition uses existing services/repos/guards, not second business implementations.

### CLAR-064 — Tenant User deactivate/reactivate/delete controls only

The owner declined the offered automated tests and manual browser/database verification and
requested only the missing Tenant User deactivate/delete UI/API. The preceding recommended
security boundary is approved for this implementation: Tenant Admin may deactivate, reactivate
or soft-delete only a regular Tenant User in the authenticated tenant. No action may target the
actor, Tenant Admin, Super Admin or a foreign tenant. State changes increment token version and
revoke active sessions; soft deletion also soft-deletes the matching membership and retains the
create-or-restore path for later recovery. Repeated delete is idempotent and does not rewrite
original deletion evidence. Material changes use redacted transactional audit actions. No test
files, automated suites or manual database/browser mutations are in this task.

### CLAR-063 — Scoped create-or-restore for users, contacts and groups

The owner approved the recommended entity-specific restore policy instead of a blanket
`is_deleted=false` shortcut. A create with an active natural-key match remains a conflict. A
single deleted User email, tenant Contact phone or tenant Group name restores the same UUID and
clears `is_deleted`, `deleted_at` and `deleted_by` in the create transaction after current
authorization, tenant, uniqueness and parent checks. Users receive the submitted password,
current system Tenant User role and tenant membership, ACTIVE status, token-version increment
and prior-session revocation. Contacts refresh submitted profile fields but preserve consent,
opt-out and suppression history; deleted Group memberships remain deleted. Groups likewise do
not revive former memberships. Each restoration uses a distinct redacted audit action. Multiple
deleted rows with the same natural identity fail safely as ambiguous. Templates, campaigns,
automations, media, tenants and operational/history rows are outside this automatic policy.

### CLAR-062 — Local account-management screens and role boundary

The owner confirmed the three-role model and approved UI implementation for local
development. Super Admin creates a tenant/business together with its first Tenant Admin;
Tenant Admin creates regular Tenant Users only inside the authenticated tenant. Tenant
Admins do not create tenants and Tenant Users cannot manage accounts. The local MVP uses an
admin-entered initial password communicated outside the application; it does not claim email
delivery, an invitation lifecycle, or forced password change. Implementation must reuse the
existing platform tenant endpoint and add one tenant-scoped Team Controller-Service-Repository
path with server-side role, permission and tenancy enforcement. Automated tests remain subject
to the phase-boundary checkpoint.

### CLAR-061 — Reuse existing Meta development configuration for initial Railway test

Owner questioned separate-app requirement and explicitly chose reusing local development
Meta app values to prioritize initial deployment. This supersedes CLAR-060 separate-app
recommendation for the temporary test environment; it does not approve production rollout.
Owner manually added four Meta variable names on API/Worker; name-only verification confirms
all four on each,12 configured variables per service. Values not revealed/compared/validated.
No access token, webhook subscription or send enabled by agent. Twenty-seven staged changes
visible; Redis still New1Setting. Storage/SMTP runtime validation and scanner/scheduler/auth
deployment layout remain unresolved. Do not treat local MinIO/Mailpit URLs as hosted services.

### CLAR-060 — Separate Meta development app for Railway

Owner approved recommended separate development app instead of reusing local Meta app.
Guide updated with isolated Railway-only server configuration and manual secret entry.
No app created by agent, credential accessed, webhook registered or provider call/send made.
API and Worker secret-name inventory confirms three configured application secret names on
each (values not revealed/compared). Worker also has five database/runtime variable names.
Redis remains New/staged; deployment is paused. Current Railway banner shows19 pending
changes, superseding earlier15 count; owner manual actions changed remote state.

### CLAR-059 — Trial-only Railway budget

Owner then approved local build-only verification. All three image builds/exports passed;
final metadata recheck is pending Docker Desktop availability on retry. Evidence and limits
are in RAILWAY_BUILD_CHECK.md. No cloud apply or resource provisioning occurred.

2026-10-18 owner confirmed spending strictly limited to remaining trial credit, no paid upgrade.
Dashboard trial popover confirms $5.00 remaining/30 days, expiry on either condition. No card,
upgrade, purchased credit or paid resource expansion authorized. Current official free-trial
documentation limits projects to five services; existing three apps plus PG/Redis would fill
that limit, leaving prepared scanner/mail/scheduler deployment unmet. Do not silently bypass
upload scanning, runtime validation or strict-cookie security to fit the trial. No new
resources or deployment started. Owner must choose a build-only checkpoint or approve the
specific constrained runtime scope before provisioning; full staging is not feasible under
the currently documented project service layout on this trial.

### CLAR-058 — Public Web/API Railway domains

2026-10-18 owner explicitly approved generating public domains for Web and API only. Generated
Railway domains recorded in MEMORY, matching explicit PORT=8080 after source verification.
Web public API build URL staged from actual generated API domain. Worker stays private.
No paid resource provisioning, live send, migration or launch approval implied. Fifteen
build/runtime variables/settings staged, not deployed; missing backend config remains blocker.

### CLAR-057 — Existing Railway build failure correction

2026-10-18: Owner said “yes fix those” after all three actual deployment logs were inspected
and the Dockerfile build-order correction explained. Approved only correcting existing
API/Web/Worker deployment settings; not paid provisioning, public exposure, live sending or
launch approval. Staged 12 settings using existing root-context Dockerfiles and direct Node
entry points; no application code/dependency changes needed. Applying remains blocked by
missing Web public API URL/domain configuration. No redeploy or secrets entered; tracked
under TASK-082.4.1. Ask before introducing public endpoints or infrastructure choices.

### CLAR-056 — Templates and WhatsApp UI mocked checkpoint

Date: 2026-10-18. Owner explicitly selected “Run mocked UI tests now (recommended)” after
both approved UI slices were implemented. Write/run focused browser acceptance and affected
regressions, fix demonstrated defects and retest. Provider/API interactions in tests are
intercepted fixtures only: no live sync/messages, credentials, database or production changes.
Resolution: 12/12 setup browser cases, affected 36/36 combined run and shared client 10/10
passed. Two test-selector issues corrected and rerun; no backend changes. Exact coverage and
remaining unverified cases are in SETUP_UI_TEST_REPORT.md.

### CLAR-055 — WhatsApp development setup UI

Date: 2026-10-18. Owner approved existing development workflow UI: Meta test WABA/phone asset
IDs, fixed env://META_DEVELOPMENT_ACCESS_TOKEN reference, account status/health list and
confirmed sync/local disconnect. No provider token input, Embedded Signup, live sends or
automatic provider calls. Existing backend/permissions unchanged; manual mapping is not a
verified OAuth/onboarding flow. No agent-triggered external sync or live message authorized.

### CLAR-054 — Templates-first implementation scope

Date: 2026-10-18. Owner chose recommended flow, then explicitly approved Marketing/Utility
text-first editor (optional text header/body/footer), media/buttons/auth templates view-only,
and separately approved keeping synchronized Meta templates read-only pending backend review.
Use existing list/preview/local draft/internal review/sync APIs and permissions. No Submit to
Meta endpoint/button, new dependencies/schema/provider requests executed by agent. Current
design tokens retained. Local draft create still needs a connected account per existing API.
Sync remains an explicit permitted, confirmed user action that may replace provider content;
the editor does not silently flatten unknown components. Owner answers resolve authoring
scope, not backend/provider production onboarding or authorization changes.

### CLAR-053 — Campaign UX automated checkpoint

Date: 2026-10-18. Owner replied “sure” after the choice to update/run Campaigns automated
tests now or defer. Interpreted explicitly as approval to run now; stated that interpretation.
TASK-086.7.2 updates existing Playwright fixtures/assertions for the guided UI and adds focused
wizard/preview/discard/schedule/role regressions using mocked APIs only. No real Meta sends,
production/customer data writes, new dependencies or broader feature scope authorized.

Resolution: final focused browser26/26 and shared client10/10 passed. Corrected obsolete
browser fixtures (mobile drawer/alert scope, Groups envelopes and role object), not production
behavior. Case-level evidence/residual scope in CAMPAIGN_UX_TEST_REPORT.md; no real sends.

### CLAR-052 — Guided Campaigns UX

Date: 2026-10-18. Owner approved the tutorial-inspired Campaigns-first proposal, followed
by separately scoped Templates UI. TASK-086.7 reuses current APIs and all authorization,
draft/version/preflight/send semantics; keeps Geist/yellow compact system. No new send-rate,
cost/sheet/submission APIs, database/dependency changes or real sends. Use an explicitly UTC
date/time picker to avoid inventing IANA/DST conversion; untouched existing schedules retain
their exact instant/timezone, edited schedules explicitly save UTC. Template preview is sample
text only, unsupported components explained. Automated coverage remains checkpoint-optional.

Implemented using existing frontend API adapters, with focused workspace dirty-state callback.
Owner signed into a Tenant User tab for visual review; no agent credential entry or account/
template seeding. List, wizard steps and truthful prerequisite states inspected at responsive
widths; no saves or sends performed. Populated template preview/approval/delivery requires
fixtures and a separate approved checkpoint. Templates UI remains the next scoped proposal.

### CLAR-051 — Railway-derived compact application scale

Date: 2026-10-17. Owner likes the current UI and black/off-white/yellow palette but finds the
type too large, and requested Railway's current font sizing, shape and element gaps across the
application. Live computed-style inspection of `railway.com` found an Inter-like sans system with
14 px/20 px compact controls, 40 px desktop buttons, 12 px horizontal button padding, 6 px button
corners, commonly 8 px cards and recurring 8/12/16 px layout gaps. Apply that application-scale
rhythm, not the site's 36–54 px marketing headlines. Retain self-hosted Geist and the existing
colors. Use 14 px/20 px as the shared body/control scale, 40 px desktop controls, compact headings,
6 px controls, 8 px cards and 12 px panels; retain circular avatars/status pills and 44 px mobile
touch targets as semantic/accessibility exceptions. This supersedes CLAR-050's square 48 px
control/card geometry where they differ; no workflows, permissions or API behavior change.

### CLAR-050 — Portfolio-derived card and button geometry

Date: 2026-10-17. Owner requested the live portfolio's card/button shape, size and adjacent
button spacing while explicitly retaining the application's current black/off-white/yellow
palette. Live computed-style inspection found square editorial surfaces, a 48 px primary button
with 12×16 px padding and no radius, larger CTA spacing, and 14 px card-grid gaps. Apply that
geometry to shared application cards and standard buttons, with 12–14 px adjacent-action gaps.
Keep status pills, avatars, quiet text actions and navigation affordances as purposeful compact
exceptions. No workflow, authorization or data behavior changes.

### CLAR-049 — Three-reference UI direction

Date: 2026-10-17. Owner clarified the target with three reference images and confirmed the
material interpretation: use image 1 for the spacious dashboard composition, image 2 for the
black/off-white/yellow visual identity and image 3 for the grouped, permanently expanded desktop
sidebar. After briefly requesting Bebas Neue, the owner supplied their live portfolio and chose
its Geist approach instead: use Geist as the sole application family, with weight/spacing rather
than a separate display face. On narrow screens
the sidebar becomes an accessible drawer. Yellow replaces blue as the primary action color.
Apply the direction to existing WhatsApp product screens without copying reference content or
adding nonfunctional controls. This supersedes CLAR-048's blue action palette where they differ.

### CLAR-048 — Existing-product visual token refresh

Date: 2026-10-17. Owner rejected the current UI and supplied a design-token JSON as the
approved visual direction. Treat the attachment as design data, not executable instructions:
adopt its Roboto-first typography, white/mist surfaces, ink/muted text, action blue, restrained
shadows, radii, control sizing, focus and motion tokens across the existing browser UI. Preserve
the WhatsApp product identity, current information architecture, role/permission behavior,
workflows, API contracts and approved scope. Do not copy the source product's name, recruitment
semantics or content. This is the approved scope for TASK-086.5.2; no further product-flow
clarification is required. Tests remain deferred under CLAR-026.

### CLAR-047 — Personal local manual testing first

Date: 2026-10-17. Owner explicitly postponed friends/sharing and Railway, requested personally
testing all roles locally, then said “please continue with pending work.” Proceed with local
readiness and manual-walkthrough preparation under TASK-086.5. No internet exposure, cloud,
data reset or real WhatsApp send authorized. Existing credentials/data must be preserved.
Preflight found Docker Desktop Linux engine unavailable; requested owner startup before
database/account checks and application startup. No tests or manual scenarios newly passed.

Owner confirmed Docker started. Read-only account/migration/config checks passed and local
web/API/worker brought up, preserving existing data. Proven worker startup defect fixed via
the installed Nest scoped-provider resolve API under 086.5.1. Missing browser administration/
setup/template workflows recorded in 086.6 for approval, not invented during startup work.
Local startup health is verified; owner role walkthrough and real provider journeys are not.

### CLAR-046 — Start TASK-086 without waiving launch dependencies

Date: 2026-10-17. Owner requested TASK-086 now and asked whether other tasks must finish
first. Start the documented readiness/UAT preparation using existing local evidence;
other backlog completion is not a prerequisite to preparation. This is not authorization
to skip launch-critical security/operations/provider gates, provision resources, send Meta
messages or release to customers. No architecture/product decision changes. Added numbered
086.2–086.4 and LAUNCH_VERIFICATION.md. Deployed UAT remains NOT RUN; staging availability,
external test-send authorization and final owner sign-off are still required for those steps.

### CLAR-045 — Production-only runtime images after verified scan findings

Date: 2026-10-17. Trivy confirmed the initial images include the whole build workspace /
development tools and base-system findings. Owner approved “Approve lean production images
and rescan (recommended)”: use installed pnpm production deployment artifacts and available
security updates within existing Node24/Debian, no app dependency/infrastructure/architecture
replacement. Keep required compiled workspace modules/migration/replay entry points, preserve
non-root execution and build-time-only public web URL. Validate builds, resolution and image
scans. No blanket ignore list, automatic dependency upgrades or clean security claim; unresolved
vulnerabilities need remediation/owner review before release. Record exact artifact evidence.

Implemented: production deployment bundles, package file allowlists, available Debian updates,
all three successful Linux builds/non-root artifact checks and web injected-PORT HTTP smoke.
Rescans remain 1 critical / 60 high occurrences per image; no findings suppressed. Full
registered checkpoint and combined SQL/HTTP passed. Remaining findings are TASK-084.2.3;
see PHASE_8_LOCAL_REPORT.md. No cloud/live Meta/commit or launch approval implied.

### CLAR-044 — Local container scanner selection

Date: 2026-10-17. Docker Scout required account login. Owner selected “Use local Trivy
scanner (recommended)” instead. Download a versioned scanner/vulnerability database; scan
exported local images read-only without mounting Docker socket, publishing images, sending
customer data or adding an application dependency. Keep generated archives/scanner cache
outside Git; record unresolved findings and exact image digests, not a clean-security claim.

### CLAR-043 — Phase 8 coordinated local completion checkpoint

Date: 2026-10-17. Owner approved “yes start” to the proposed local batch: operational docs/
safe restore tooling, real container builds/scans, deferred reporting/export/deployment test
authoring/execution against disposable data, confirmed-defect fixes/retests and one remaining
deployment/launch checklist. This supersedes test deferral for this local checkpoint only.
Work tasks sequentially; keep per-task evidence and remote prerequisites separate. No paid
resources, cloud login/provisioning, live Meta sends, real customer/production data mutation,
Git commit or launch authority. Remote TASK-082/083/085/086 acceptance remains pending.
Existing security defects may be fixed within approved scope; new dependencies/material
policy changes still need approval. RPO/RTO/retention/notification destinations remain owner
choices, not invented commercial commitments. First Docker build attempt found Linux daemon
stopped; requested owner to start it while independent work proceeds.

### CLAR-042 — TASK-082 repository-only staging preparation

Date: 2026-10-16. Owner answered “sure start” after the recommended repository preparation /
manual deployment guide plan. No Railway account/project/domain/budget values were supplied.
Proceed only with repository files and guide; do not create paid resources or deploy. Leave
domain, monthly cap/alert thresholds and project selection pending, not implicitly approved.
Prepare root-context Docker builds and explicit dashboard service settings, independent
scheduler entry point, private health checks, variables and cost-control checklist. Preserve
combined local worker behavior, existing API/readiness/auth/messaging policy and private data
boundaries. Dedicated scheduler runs existing due-campaign service; existing idempotent outbox
relays/automation recovery/import retention stay with consumers, without moving their behavior.
Health checks contain status only and never send messages. Use existing dependencies, no
provisioning SDK, legacy Railway config or infrastructure-as-code apply. NODE_ENV=production
is required on staging for secure cookies; do not relax it to bypass missing Meta config.
No live Meta testing, migration/seed execution, cloud operation or automated tests authorized.
Record pending T082 cases; lint/type/build/schema/format only. Account/domain/budget decisions
and remote validation must be completed before TASK-082 can be marked complete.

Repository resolution: three root-context Dockerfiles, secret-free manual service/variable
manifests and RAILWAY_STAGING_GUIDE.md; separate existing-runtime scheduler and consumer entry
points, private status-only health layers, retained local combined entry point. Web public
URL is part of build cache identity. All 30 static/build tasks, schema35/format/diff and three
Docker --check commands pass after installed-library typing corrections. No full Linux image
builds, runtime/tests, cloud changes, migrations/seeds, live Meta calls or commit. T082-01–08
and 082.4 remain pending, with account/domain/budget/remote activation explicitly unapproved.

### CLAR-041 — TASK-081 bounded MVP exports

Date: 2026-10-16. Owner answered “approved” to the recommended bounded CSV approach.
Compared bounded direct downloads with durable export jobs/private storage/expiry and
reauthorization. Implement at most 10,000 data rows and 10 MiB; reject oversized results
without truncation. Campaign summary and recipients; dashboard, usage, payments (no notes,
including platform), and existing filtered safe audit summaries. Recipient downloads require
campaign.read/export and contact.read/export. Platform exports remain metadata/aggregates
only, never campaign recipients or tenant content. Every request uses live authorization;
protect CSV cells against formula injection, omit content/variables/raw provider data, and
persist redacted preparation audit before response. No stored files/public links/dependencies/
schema/queue infrastructure. Large async exports are deferred, not silently supported.
Reuse reporting projections and browser auth/refresh. Tests remain deferred to the phase
checkpoint; record pending cases and perform static/build checks only. ADR-023 records the
scoped delivery decision; REPORT_EXPORTS.md records implementation.

Implemented: separate tenant/platform export services, bounded allowlisted CSV preparation,
audited raw-response controllers, tenant recipient repository and shared browser auth/download
controls. TASK-081.4 keeps platform audit ownership independent of arbitrary business filters.
Final lint/typecheck/build passed all 30 tasks; schema35/format/diff checks passed. No test
files/tests/runtime exports/live provider/deployment/commit. T081-01–10 remain deferred.

### CLAR-040 — TASK-080 essential reporting and billing views

Date: 2026-10-16. Owner approved all seven recommendations with “sure”. Implement tenant
dashboard, quota/plan/subscription and read-only payment history; platform aggregates,
business selection and existing manual-payment recording; paginated safe audit summaries.
Reuse permissions: report.read, plan.read, billing.read, audit.read and existing platform
permissions. Do not grant Users new rights. Payment notes are platform-only; tenant payments
show amount/currency/date/reference. Payment does not activate/extend subscriptions. Current
UTC month for dashboards/reservations; audit defaults to 30 days and rejects >90 days.
Keep currencies separate, do not infer money owed/Meta costs. Reuse tables/direct SQL and
strict layers; no new dependencies/infrastructure planned. Exports are TASK-081; advanced
charts, gateway/invoices/refunds and full plan-management UI are excluded. Static/build
checks during implementation; automated tests deferred to the owner-approved phase checkpoint.

Implemented: tenant/platform read models and screens, existing payment form integration,
soft-delete/role boundaries and safe audit/payment projections. Related 080.2.1 adds selected-
business validation/locking inside the existing payment transaction. All 30 static/build
tasks and unchanged 35-table schema contract pass; T080-01–10 await the phase testing choice.
No new dependency, schema, gateway, billing policy, external send or production-readiness claim.

### TASK-075 local testing approval — 2026-10-16

Owner requested “start TASK-075 local testing now”. This authorizes Phase 7 test
creation, local execution and directly related defect fixes. It does not authorize
live Meta calls, real sends, deployment, customer-data cleanup or Git commits.
Results and remaining cases are tracked in PHASE_7_TEST_REPORT.md.

Owner subsequently approved continuing TASK-075.2/075.3 (“okay go with it”). Implemented local
independent-connection runtime, provider-double, relay/Redis and browser tests. No new product
decision, dependency, schema or live-send authority is introduced. TASK-075.4 records remaining
approved acceptance cases; do not mark the parent complete from partial coverage.

TASK-075.4 continuation approved explicitly (“can you start that TASK-075”). Authenticated
large-graph HTTP, database replay/rollback and representative publication/dispatch races
now pass locally. Verified defect TASK-075.4.1: Express oversized-body errors incorrectly
fell through the shared mapper to 500. Corrected within the already-approved 413/error-envelope
contract, with narrow shape recognition and no parser/body disclosure. Unit and full HTTP
retests pass. No new product policy, schema, dependency, hosting or provider decision; no ADR
required. Full local gate passed, including 29 Chromium cases. TASK-075 is complete for the
approved local checkpoint; live Meta/deployment authorization remains absent. Broader launch/
stress acceptance stays under existing TASK-084/085/086, not implicitly marked verified.

### CLAR-038 - Phase 7 coordinated Basic Automation implementation

- Date: 2026-10-16. Status: TASK-070–074 implementation complete; local testing awaits the phase-boundary owner choice.
- Owner answered “okay approved” to the full Phase 7 recommendation, including all nine
  decision rows. Scope and concrete behavior are maintained in BASIC_AUTOMATION.md.
- Approval covers sequential TASK-070–074 in one coordinated run, including numbered UI
  subtasks under 071/074. Keep one task active at a time. Reuse the existing schema, common
  messaging pipeline, official provider boundary and worker runtime reuse pattern.
- Approved decisions: form editor/simulator; Admin-only publication; account-bound exact
  keywords; correlated choices and unexpected-text handoff; window-bound waiting expiry;
  literal name/email/company/address updates; explicit takeover; new-run-only reactivation;
  live publishing-Admin authorization without requiring their login session.
- TASK-075 test authoring/execution needs a separate phase-boundary owner answer. Live Meta
  testing/sends remain separately authorized. No new infrastructure or workflow dependency;
  CLAR-039 explicitly supplements this with the existing Express version/type declarations.
- Outcome: API/repositories, immutable authoring/simulator/UI, durable triggers/execution,
  interactive common delivery and explicit ownership controls implemented. Static/build gate
  passed 30 tasks, schema contract remains 35 tables, formatting and diff checks passed.
  No test files changed, automated tests run, migration applied, live send or commit performed.

### CLAR-039 - Automation authoring request-body size

- Date: 2026-10-16. Status: Implemented; HTTP/HMAC regression remains pending TASK-075.
- Discovery: Nest's existing Express JSON parser uses its default 100 KB limit. A valid
  30-node graph with long messages can exceed that envelope despite meeting node limits.
- Recommendation: Scope a 2 MB JSON parser to `/api/v1/automations`, retaining the existing
  default parser and exact raw-body signature verification for Meta webhooks and other routes.
  Declare Express directly using the same version already installed through Nest; no second
  server/framework or new infrastructure. Ordinary type declarations are included.
- Owner answer: “Approve scoped 2 MB automation authoring limit (recommended)”. The rejected
  alternative was a smaller total-draft cap with UI guidance. This supplements CLAR-038's
  dependency restriction only for the explicitly approved parser integration.
- Verification required at TASK-075: >100 KB valid graph accepted, >2 MB rejected, unrelated
  route default limit retained, and raw webhook HMAC regression. Static checks are not proof
  of HTTP/parser behavior. No live provider calls are authorized.
- Implementation: Direct Express 5.2.1 and @types/express 5.0.6 were already present transitively;
  offline install changed only their API importer declarations in the lockfile. The named
  automationGraphJson wrapper avoids Nest suppressing its default parser by function-name
  detection. No credentials were accessed or committed.

### CLAR-037 - TASK-065.3 local Inbox test follow-up

- Date: 2026-10-16. Status: Implemented local test expansion; final gate/results maintained in `PHASE_6_TEST_REPORT.md`.
- User decision: “yes start TASK-065.3 — finish the remaining Shared Inbox tests, including concurrency and polling/error-recovery checks. Live Meta testing remains a separate, explicitly authorized step.” This authorizes local test creation/execution; no provider send or architecture change.
- Implementation: Independent PostgreSQL transaction races and private replay, SQL failure injection/approval/pagination boundaries, real child API authorization checks, browser polling/error/reconnect/stale-state/pagination tests and isolated shared-authentication-client checks. Reuse installed tools; no new dependency or production implementation change.
- Isolation: Fresh local test-owned databases permit real commits and are dropped by their validated generated names after closing connections. Ordinary fixtures roll back. No customer database is a cleanup target and no live delivery worker starts.
- Verification boundary: Local tests are not deployed full-stack/provider or capacity certification. Cross-tab authentication review and broader launch/scale scenarios retain TASK-084/085/086 ownership; live Meta work still requires explicit authorization.

### CLAR-036 - TASK-066 minimal Shared Inbox UI

- Date: 2026-10-16. Status: Implemented; owner answered “approved” to the UI/assignee recommendations and requested TASK-065 testing after UI implementation.
- Layout recommendation: Add Inbox to the existing tenant workspace navigation for conversation.read. Reuse design tokens; desktop list/detail panes, mobile drill-in/back navigation. Include name/phone search, status/unread filters, paginated history/notes, explicit read/unread and close/reopen, TEXT/eligible TEMPLATE composer, assignment and notes. No redesign of existing Contacts/Campaigns or new media/automation capability.
- Missing backend capability/recommendation: Add bounded cursor-paginated GET /conversations/assignees with conversation.read/assign, returning only active same-tenant Admin/User IDs and display names. Reuse existing member-validation rules and strict Controller-Service-Repository layering; no email/phone/credential fields, schema or new permission. Without it a meaningful picker is unavailable; raw UUID entry is not recommended.
- Client behavior recommendation: Mount one approved keyed polling hook, preserve per-conversation draft text in memory while Inbox stays mounted, retain stable reply keys/note UUIDs for retry, show pending/delivery/error/window/account states, and keep older history pages separate from latest polling. Use the existing template.read API for the picker only when authorized; otherwise show template-permission guidance rather than bypassing that permission. Mark-read remains explicit, not automatic on open. Plain-text note rendering; no localStorage of tenant content.
- Implementation outcome: Mounted the responsive Inbox with the approved controls, in-memory drafts, explicit read actions, existing polling and eligible templates. Added the minimal assignee endpoint through Controller-Service-Repository layers. No new schema, dependency, media or automation capability.
- Verification: TASK-065 local SQL/browser checks found and fixed READ progression and dynamic form-label defects. See `PHASE_6_TEST_REPORT.md` for exact results and remaining acceptance coverage; no live Meta sends.

## Purpose

This log preserves material frontend and backend questions, user-approved answers, and the way each answer was implemented. It prevents future tasks from inventing requirements, repeating resolved questions, or treating an engineering assumption as a product decision.

Binding architecture changes still require an ADR in [Architecture decisions](DECISIONS.md). Product requirements, security rules, API contracts, data design, and operational behavior must also be updated in their canonical documents when a clarification changes them.

## Operating rules

- Create an entry when two or more reasonable answers would materially change behavior, UX, API contracts, data, authorization, tenant isolation, provider interaction, dependencies, cost, deployment, or acceptance coverage.
- Mark an unanswered question as `Pending` and do not implement the affected branch.
- Record the user's answer and change the status to `Approved` before implementation.
- After implementation, record the outcome and verification evidence, then mark the entry `Implemented`.
- An explicit instruction such as `start TASK-014` approves the task scope already documented in `TASKS.md`; it does not answer unspecified product or architecture questions.
- If implementation, debugging, or an approved design decision discovers necessary directly related work, record it in `TASKS.md` before implementation as either a numbered subtask required for the active task's acceptance criteria or a separately numbered follow-up task. This does not bypass clarification or approval requirements.
- Do not create entries for formatting, naming, or reversible mechanical details that are already governed by repository rules.
- Never record passwords, tokens, credentials, encryption keys, customer data, or other secrets.

## Entry template

```markdown
### CLAR-XXX - Short title

- Date: YYYY-MM-DD
- Task: TASK-XXX or repository policy
- Status: Pending | Approved | Implemented | Superseded
- Context/evidence: Documents, code, or external constraint that created the question
- Question: The exact decision required
- Options/tradeoffs: The realistic choices and their effects
- User decision: The approved answer, or `Pending`
- Implementation outcome: What changed, or `Not started`
- Verification: Tests, review, or documentation evidence
- Affected documents: Canonical files updated by the decision
```

## Decisions

### CLAR-018 - Evidence-based solution design and Contacts/Groups slice decisions

- Date: 2026-10-11
- Task: Proposed combined TASK-041 through TASK-045 vertical slice
- Status: Approved design decisions; combined implementation active under TASK-041
- Context/evidence: The owner requested that solution design reflect established industry practice rather than unnecessary invention, and approved every recommendation proposed for the Contacts, Groups, consent, and import slice. The current MVP already defines tenant isolation, soft deletion, asynchronous imports, local-number normalization, and strict clarification/approval gates.
- Question: What problem-solving standard and outstanding product decisions govern the combined Contacts and Groups vertical slice?
- Options/tradeoffs: A feature could be designed from untested assumptions, copied without adapting to this system, or derived from proven patterns after evaluating this product's actual architecture, scale, security, tenancy, failure, and operating constraints. For Groups, imports, consent, STOP handling, scanning, and frontend prerequisites, the recommendations balance predictable behavior, data integrity, privacy, recoverability, and MVP scope.
- User decision: Use established, proven solutions as the starting point; inspect the repository and authoritative requirements; define the real problem and constraints; compare practical options and trade-offs; then recommend the smallest robust architecture-compatible solution before code approval. Approved slice decisions: (1) Groups are static manual lists only, with create/rename/soft-delete and explicit Contact add/remove; no dynamic groups. (2) An import row matching an active Contact is reported and skipped; it never updates the existing Contact. (3) The first valid occurrence of a phone in one file is imported and later occurrences are row errors. (4) Imports require an explicit default country when local numbers exist, with India preselected. (5) Mapping supports required phone, profile fields, custom fields, consent evidence, and optional assignment to an existing Group. (6) Imports create `UNKNOWN` consent unless explicit opt-in evidence is mapped. (7) a whole-message, case-insensitive `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, or `QUIT` opts the Contact out across the tenant's WhatsApp accounts; `START` does not automatically re-opt-in in this MVP. (8) Secure import includes ClamAV-backed scanning in local Docker and the production design. (9) The slice includes the minimal authenticated browser client and tenant workspace shell/navigation needed for a usable Contacts/Groups UI.
- Implementation outcome: The owner approved the combined plan. TASK-041 is the active coordinator task with ordered, traceable TASK-041.1 through TASK-041.5 subtasks; TASK-042 through TASK-045 remain the corresponding completion records. Implementation, verification, and canonical-document updates are in progress.
- Verification: Decisions reviewed against the existing MVP scope, approved tenant boundary, manual-contact behavior, import tables, and security requirements.
- Affected documents: `AGENTS.md`, `RULES.md`, `TASKS.md` (when the combined plan is approved), `docs/MEMORY.md`, relevant feature/design/security/API documents (when the combined plan is approved), and this log.

### CLAR-017 - Traceable discovered-work policy

- Date: 2026-10-11
- Task: Repository engineering policy
- Status: Implemented
- Context/evidence: The owner wants development to remain sequential and traceable while allowing genuine implementation, debugging, or approved-design discoveries to be addressed without losing them between tasks.
- Question: How should newly discovered necessary work be recorded and scheduled without allowing speculative scope expansion or approval bypass?
- Options/tradeoffs: Ignoring discoveries creates undocumented debt; silently implementing them obscures scope and may bypass approval. Recording every discovery as a subtask can blur acceptance boundaries. A required acceptance item belongs under the active task, while independent follow-up work needs its own ordered task.
- User decision: Record directly related discovered work before implementation. Use a numbered subtask when it is required for the active task's acceptance criteria; otherwise add a separately numbered follow-up task immediately after the related task or at the end of the relevant phase. This applies only to discoveries from implementation, debugging, or approved design work and does not authorize speculative scope or bypass material clarification/approval.
- Implementation outcome: Added the discovery, subtask, and follow-up policy to agent instructions, engineering rules, and the task backlog; added this permanent decision record.
- Verification: Reviewed for consistency with the one-active-task, clarification, approval, and ADR rules.
- Affected documents: `AGENTS.md`, `RULES.md`, `TASKS.md`, `docs/MEMORY.md`, and this log.

### CLAR-016 - TASK-040 manual Contact normalization and ownership policy

- Date: 2026-10-11
- Task: TASK-040
- Status: Implemented
- Context/evidence: The approved Contacts API requires manual CRUD, phone normalization,
  tenant isolation, and soft deletion. The schema supports consent and assignee fields, but
  did not define a default calling code, duplicate behavior, initial consent behavior, or
  same-tenant assignee rule for this first CRUD slice.
- Question: Should manual Contacts require E.164 only or support a default country; should
  duplicate phones merge or conflict; should CRUD mutate consent now; and what assignee
  validation is required?
- User decision: Support local number normalization using default country calling code
  `+91`; return `CONTACT_PHONE_EXISTS` on duplicate active phones; create manual Contacts
  with `UNKNOWN` consent and defer consent mutations to TASK-043; support
  `assigned_user_id` only for an active Admin/User in the same tenant.
- Implementation outcome: Added tenant-only Contact list/create/read/update/soft-delete
  endpoints. The service normalizes E.164/Indian local phones before the active uniqueness
  check, rejects invalid or duplicate phones, validates the assignee inside the write
  transaction, writes no consent lifecycle fields, and appends redacted audit evidence.
  Migration `0003_contacts_cursor_listing` adds the active tenant cursor index without
  changing any Contact fields.
- Verification: API lint, strict typecheck, unit tests, and PostgreSQL integration tests
  pass. The integration test proves cross-tenant list/read denial, assignee rejection, and
  audited soft deletion.
- Affected documents: `TASKS.md`, `apps/api/database/schema/120_contacts.sql`,
  `apps/api/src/database/schema/app-schema.entity.ts`, `docs/01-functional-requirements.md`,
  `docs/06-api-contracts.md`, `docs/DATABASE_SCHEMA.md`, `docs/TEST_PLAN.md`,
  `docs/MEMORY.md`, and this log.

### CLAR-015 - Initial webhook message/status processing and replay policy

- Date: 2026-10-11
- Task: TASK-036
- Status: Implemented
- Context/evidence: TASK-036 requires durable dispatch and replay. The owner explicitly
  expanded its scope to include the first inbound-message and delivery-status processor
  before the later Contacts, Inbox, and Messaging task sequence. `docs/09-inbox-and-automation.md`
  already requires create-or-find Contact and Conversation behavior; the current schema
  has no `DELETED` message status.
- Question: Should the foundation only queue events, or create the initial inbound and
  status effects now? What is the retry/replay policy and how should Meta `deleted`
  statuses behave before a schema extension exists?
- User decision: Implement the initial message/status processor now. Retry a failed
  webhook job five times with exponential 1/2/4/8/16-second delays, then mark it `DEAD`;
  replay is private server-side operations tooling. Retain a verified Meta `deleted`
  status but do not regress an existing message state until a reviewed `DELETED` schema
  status is approved.
- Implementation outcome: A transactional webhook outbox is created with every newly
  verified delivery. A BullMQ worker claims the outbox with a stale-lock timeout, queues
  only the stored event ID, processes the initial inbound-message and delivery-status
  effects idempotently, and marks exhausted jobs `DEAD`. The private replay CLI atomically
  returns only `FAILED`/`DEAD` records to durable dispatch. Meta `deleted` remains only in
  the protected raw record and never regresses Message state.
- Verification: Worker lint, strict typecheck, build, and three processor unit tests pass;
  API lint, strict typecheck, unit tests, and PostgreSQL migration/integration tests pass.
- Affected documents: `TASKS.md`, `docs/06-api-contracts.md`,
  `docs/08-messaging-campaigns-and-webhooks.md`, `docs/09-inbox-and-automation.md`,
  `docs/TEST_PLAN.md`, `docs/MEMORY.md`, and this log.

### CLAR-014 - Development-safe account synchronization and disconnect

- Date: 2026-10-11
- Task: TASK-033
- Status: Implemented; Meta token configuration intentionally deferred by owner
- Context/evidence: TASK-033 required health, phone synchronization, and disconnect.
  The development test WABA/phone mapping exists, but the owner does not want to add the
  development access-token value until frontend testing is ready. The production Meta
  partner arrangement and upstream credential ownership are still unresolved.
- Question: Should the application perform upstream destructive disconnect operations
  now, or provide a bounded development-safe synchronization and local disconnect flow?
- User decision: Approved the recommended scope: verify the saved test WABA/phone via
  the official Meta API when a server-side token is configured; locally disable and
  revoke the reference on disconnect; do not unsubscribe webhooks or revoke Meta tokens
  upstream. The owner will add the development token later for frontend testing.
- Implementation outcome: Added tenant-scoped account listing, sync, and disconnect
  endpoints; a provider-neutral service and official Meta phone-list adapter; an
  `env://META_DEVELOPMENT_ACCESS_TOKEN` resolver that never returns/logs the token; safe
  health/error transitions; local credential-reference revocation; default-account
  reassignment; and append-only audit events. Provider calls occur before, never inside,
  the database transaction that persists their safe outcome.
- Verification: Focused credential-reference and sync-orchestration tests plus the full
  workspace lint, typecheck, test, and production build gates pass.
- Affected documents: `.env.example`, `TASKS.md`, `docs/06-api-contracts.md`,
  `docs/07-whatsapp-provider-integration.md`, `docs/META_DEVELOPMENT_APP_SETUP.md`,
  `docs/TEST_PLAN.md`, `docs/MEMORY.md`, and this log.

### CLAR-013 - Development-only tenant WhatsApp connection before Embedded Signup

- Date: 2026-10-11
- Task: TASK-032
- Status: Implemented
- Context/evidence: The owner created the Meta development app and confirmed that Meta
  created its test WABA and test phone assets. The production Meta Tech Provider/Solution
  Partner arrangement and exact Embedded Signup credential exchange are still unresolved.
- Question: Should TASK-032 implement production Embedded Signup now, or a bounded way
  to persist the owner-provided development test assets without exposing Meta tokens?
- Options/tradeoffs: Implementing production signup without a confirmed partner model
  risks inventing an unsupported OAuth/credential exchange. Waiting entirely blocks
  local provider integration. A Tenant Admin-only manual development mapping enables
  development while preserving a clear production boundary.
- User decision: Use the recommended development-only manual tenant connection now.
  The Tenant Admin supplies the test WABA ID, phone-number ID, display metadata, and a
  server-side credential reference; no raw credential is sent to or returned by the API.
- Implementation outcome: Added `POST /whatsapp/connect` behind `whatsapp.connect` and
  tenant-content guards. The Controller-Service-Repository slice atomically creates the
  tenant-owned WhatsApp account and credential reference and appends redacted audit
  evidence. The persisted connection is marked as development-manual; no Meta token is
  logged, returned, or stored in plaintext. Full client Embedded Signup is explicitly
  deferred pending the confirmed production provider arrangement.
- Verification: Unit tests cover reference-only input and transactional account/audit
  orchestration; lint, strict type checking, API tests, and production build are run as
  TASK-032 completion gates.
- Affected documents: `TASKS.md`, `docs/06-api-contracts.md`,
  `docs/07-whatsapp-provider-integration.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`,
  and this log.

### CLAR-012 - Platform manual payments and Tenant Admin credentials

- Date: 2026-10-10
- Task: TASK-026
- Status: Implemented
- Context/evidence: Platform administration needs to manage plans, subscriptions, urgent payments, and initial Tenant Admin access before a payment gateway or email invitation flow exists.
- Question: May Super Admin record manual payments, suspend/reactivate tenants, and create a Tenant Admin with a temporary password?
- User decision: Super Admin may manage plans/subscriptions, suspend/reactivate tenants, and record payment amount, currency, paid date, reference, and note. A future MVP payment gateway will be added. For now, Super Admin supplies a temporary password, shares it out of band, and the API never returns it; email invitations are deferred.
- Implementation outcome: Added the append-only `payment_records` ledger, platform-only metadata routes, transactional audit records, and server-side Argon2id hashing of supplied temporary passwords. No payment gateway/provider payload or customer content access was added.
- Verification: API lint, typecheck, build, controlled migration, and PostgreSQL integration tests passed.
- Affected documents: `docs/06-api-contracts.md`, `docs/11-plans-usage-and-billing.md`, `docs/DATABASE_SCHEMA.md`, `docs/DECISIONS.md`, and this log.

### CLAR-001 - Mandatory clarification and approval before speculative implementation

- Date: 2026-10-09
- Task: Repository engineering policy
- Status: Implemented
- Context/evidence: The user required frontend and backend work to avoid imagined problems, ask questions when requirements are unclear, receive approval before implementing ambiguous behavior, and preserve the resulting decisions.
- Question: How should future implementation handle missing or ambiguous requirements and retain the answer?
- Options/tradeoffs: Silently assume and move quickly; ask about every mechanical detail; or require focused approval for material ambiguity while reusing decisions already documented.
- User decision: Require focused clarification and approval instead of speculative implementation, and keep a permanent record of the question and resolution.
- Implementation outcome: `AGENTS.md` and `RULES.md` now enforce the clarification gate. This log records material questions, approvals, implementation outcomes, and affected permanent documentation. Existing ADR rules remain authoritative for binding architecture changes.
- Verification: Repository rules and documentation index reviewed after the change.
- Affected documents: `AGENTS.md`, `RULES.md`, `docs/README.md`, and `docs/MEMORY.md`.

### CLAR-002 - TASK-014 observability and health contracts

- Date: 2026-10-09
- Task: TASK-014
- Status: Implemented
- Context/evidence: The LLD requires structured logs, request/correlation IDs, health checks, and safe error envelopes, but it does not select the logging implementation, define trusted inbound request-ID rules, or fix public health paths and dependency readiness behavior.
- Question: Which logger, request-ID policy, and health/readiness contract should the first backend foundation implement?
- Options/tradeoffs: Pino provides mature structured logging and redaction but adds dependencies; a custom NestJS logger adds less dependency weight but more maintenance. Reusing validated inbound IDs preserves upstream tracing, while always generating IDs maximizes isolation. Versionless health routes are stable for Railway, while `/api/v1` routes align with the public API namespace. Dependency-aware readiness is valuable but database/Redis/storage clients do not exist yet.
- User decision: Approved all recommendations: Pino with `nestjs-pino` and sensitive-field redaction; strictly validate a supplied `x-request-id` and generate a UUID when it is missing or invalid; return the ID in the response header and body; expose `/health/live` and `/health/ready` outside the versioned API prefix; and keep readiness limited to application/configuration state until database, Redis, and storage clients exist.
- Implementation outcome: Added the shared Pino observability package; API and worker structured logging; strict inbound request-ID validation with UUID fallback; response-header and envelope correlation; versionless liveness/readiness endpoints; safe success/error envelopes; exception normalization; and sensitive-field/request serialization controls. Readiness currently reports validated configuration only, as approved.
- Verification: `pnpm.cmd check` passed formatting, zero-warning lint, strict type checking, all tests, and production builds across all seven workspaces. The API integration test verified valid and invalid request IDs, both health endpoints, success and error envelopes, absence of stack traces, and authorization/query-value log redaction.
- Affected documents: `docs/06-api-contracts.md`, `docs/12-devops-reliability-and-observability.md`, `design-doc/MVP_BACKEND_LLD.md`, and this log.

### CLAR-003 - TASK-015 CI platform and security gates

- Date: 2026-10-09
- Task: TASK-015
- Status: Superseded
- Context/evidence: The repository remote is GitHub and TASK-015 requires install, lint, typecheck, unit tests, integration tests, build, and security scanning. The approved documents do not select the CI platform, security scanners, trigger schedule, or blocking severity.
- Question: Which GitHub CI and security checks should be required for the MVP foundation?
- Options/tradeoffs: A quality-only workflow is fastest but does not satisfy meaningful security scanning. Dependency audit plus CodeQL gives first-party dependency and JavaScript/TypeScript static analysis with moderate runtime. Adding third-party secret and container scanners increases coverage and maintenance; container scanning is premature because deployable application images do not exist yet.
- User decision: Approved the recommended baseline: GitHub Actions on pull requests and pushes to `main`; Node.js 24 and pnpm 11.25.0; frozen-lockfile installation; explicit formatting, lint, typecheck, test/integration, and build checks; `pnpm audit` blocking high/critical findings; GitHub CodeQL for JavaScript/TypeScript on pull requests, `main`, and weekly; least-privilege permissions; cancellation of superseded runs; container scanning deferred until deployable images exist; and no third-party secret scanner at this stage.
- Implementation outcome: GitHub Actions workflow implementation was started but removed before commit after the owner changed the rollout sequence. GitHub remains source control/storage only, and quality/security checks remain local until CI is explicitly enabled.
- Verification: Confirmed no GitHub Actions workflow remains in the working tree. Local `pnpm check` passes. The production-only high/critical audit passes; the full development audit reports the separately tracked `braces` toolchain advisory.
- Affected documents: `.github/workflows/`, `docs/12-devops-reliability-and-observability.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`, `TASKS.md`, and this log.

### CLAR-004 - Local-first verification before GitHub CI

- Date: 2026-10-09
- Task: TASK-015
- Status: Approved
- Context/evidence: After approving the proposed GitHub Actions baseline, the owner requested that checks start and run locally and that GitHub be used only to track and store code for now.
- Question: Should repository quality and security checks remain local before enabling GitHub CI?
- Options/tradeoffs: Local-only checks avoid GitHub automation setup and usage now but cannot enforce checks on every push. GitHub Actions would provide centralized enforcement and CodeQL but is intentionally deferred.
- User decision: Run checks locally first. Use GitHub only for tracking changes and storing the updated repository until CI is approved later.
- Implementation outcome: Removed the uncommitted GitHub Actions workflows. Preserved `pnpm check` as the complete local quality gate and added explicit production and all-dependency audit commands. TASK-015 remains unfinished because CI is deferred.
- Verification: `pnpm.cmd check` passed formatting, lint, strict type checking, tests (including the API integration test), and production builds across all seven workspaces. `pnpm.cmd security:audit` found no production dependency vulnerabilities. `pnpm.cmd security:audit:all` reports the known high-severity `GHSA-vfj7-8cjw-p6xm` development-tooling path, for which the advisory currently lists no patched release.
- Affected documents: `package.json`, `docs/12-devops-reliability-and-observability.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`, `TASKS.md`, and this log.

### CLAR-005 - Canonical per-table SQL schema and soft-delete policy

- Date: 2026-10-09
- Task: Pre-TASK-020 database schema baseline
- Status: Implemented
- Context/evidence: The owner requested a backend schema folder containing one understandable SQL file per MVP table, a complete table count and relationship map, and a repository rule requiring `is_deleted boolean NOT NULL DEFAULT false` with active-query filtering. The approved LLD currently defines 33 tables, uses selected `deleted_at` fields, includes hard-cascade foreign keys, and classifies audit, usage, webhook, outbox, idempotency, session, and version records as operational/history data. Drizzle/drizzle-kit remains the approved data-access and migration stack.
- Question: What authority should the modular SQL files have, and which table classes should support soft deletion, uniqueness reuse, and aggregate delete propagation?
- Options/tradeoffs: Treating modular SQL as executable canonical DDL improves reviewability but requires Drizzle parity enforcement to avoid two sources of truth; treating it as reference-only can drift. Universal `is_deleted` on immutable/history/queue tables can hide evidence or break processors, while applying it to user-managed business entities preserves recoverability without changing append-only semantics. Active-only partial unique indexes permit reuse after deletion but require explicit restore-conflict handling. Database cascades physically delete rows and conflict with recoverable aggregate deletion; explicit service-layer soft-delete transactions preserve control and auditability.
- User decision: Approved all recommendations: keep one SQL file per table in `apps/api/database/schema/` as the canonical logical schema contract; require Drizzle/migration parity; apply audited soft deletion only to approved API-deletable business entities; use `is_deleted`, `deleted_at`, and `deleted_by`; use active-only partial uniqueness; prohibit ordinary API hard deletes and hard-delete cascades; reserve physical deletion for an approved retention/privacy purge; and continue using backups/PITR because soft deletion is not backup.
- Implementation outcome: Added bootstrap and post-definition SQL plus 33 ordered one-table files, a machine-readable manifest, table inventory, relationship map, soft-delete policy, updated-at triggers, structural verification, a complete `docs/DATABASE_SCHEMA.md` guide, and a cross-platform validation runner. Tenant-owned child relationships use composite tenant foreign keys where applicable. Eleven approved business tables use the soft-delete contract; operational, append-only, immutable-version, and history tables retain status/retention semantics. Repository rules, architecture/data/security documentation, the LLD, ADR index, memory, and task backlog now reference the contract.
- Verification: `pnpm check` passed schema verification, formatting, zero-warning lint, strict type checking, tests, and production builds across all seven workspaces. `pnpm schema:validate:db` executed all 36 SQL files against PostgreSQL 16 and asserted exactly 33 `app` tables, 11 soft-delete tables, and zero cascading foreign keys; the validation transaction rolled back without changing local data.
- Affected documents: `RULES.md`, `docs/ARCHITECTURE.md`, `docs/05-domain-and-data-model.md`, `docs/10-security-privacy-and-compliance.md`, `design-doc/MVP_BACKEND_LLD.md`, `docs/DECISIONS.md`, `docs/MEMORY.md`, `TASKS.md`, and the new backend schema folder.

### CLAR-006 - Platform administration privacy boundary

- Date: 2026-10-09
- Task: Pre-TASK-020 authorization and privacy baseline
- Status: Superseded in part by CLAR-007 and ADR-012; Super Admin privacy restrictions remain binding
- Context/evidence: The owner specified that Super Admin manages Admins, Admin manages users in the Admin's department, and Super Admin may view Admin/user account details plus aggregate contact/message activity and audit history, but must not view personal contact details or message content through the application. Existing documents currently grant Super Admin and Admin broad or audited oversight of Contacts and the shared inbox. The current data model has assigned tenant/user scopes but no department entity, and `posts` is not a defined product object.
- Question: Does `department` mean the existing assigned tenant/user scope or a new department entity, and does `posts` mean campaigns/messages for aggregate reporting?
- Options/tradeoffs: Reusing assigned scope preserves the approved 33-table MVP and lets Admin manage only explicitly assigned users/tenants. Adding departments requires new schema, membership, authorization, UI, migration, and tests. Aggregate-only platform reporting can expose counts and operational/audit metadata while denying contact names, phone numbers, message bodies, media, conversation history, exports, search results, and raw provider payloads. A break-glass content-access path would increase support capability but materially weaken the stated privacy boundary.
- User decision: Approved all eight recommendations. Reuse explicit assigned scope as the MVP department boundary; interpret posts as campaign/message/send activity for aggregate reporting; allow Super Admin to manage Admins and view Admin/user account details plus operational health, aggregate metrics, and audit metadata; limit Admin to assigned users/scopes and the same scoped projections; deny both platform roles contact PII, message/conversation content, media, raw provider content, content search, and detailed exports; reserve detailed access for authorized tenant users; provide no MVP break-glass content screen; and keep direct DB administration outside application RBAC with restricted credentials and auditing.
- Implementation outcome: Replaced broad platform contact/inbox oversight with a metadata-and-aggregate-only contract across product, role, UX, API, security, LLD, schema, testing, task, decision, and memory documentation. Added ADR-011. No database table or column changed because `user_tenant_scopes` implements the approved department boundary.
- Verification: Documentation search confirmed that the former `Audited oversight`, broad contact `Assigned scope`, and inbox-monitoring grants were removed or narrowed. `pnpm check` passed schema verification, formatting, zero-warning lint, strict type checking, tests, and production builds across all seven workspaces.
- Affected documents: `RULES.md`, `TASKS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/01-functional-requirements.md`, `docs/02-roles-permissions-and-tenancy.md`, `docs/03-user-experience-and-screen-map.md`, `docs/06-api-contracts.md`, `docs/10-security-privacy-and-compliance.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/13-testing-and-acceptance.md`, `docs/DATABASE_SCHEMA.md`, `design-doc/MVP_BACKEND_LLD.md`, `docs/DECISIONS.md`, and `docs/MEMORY.md`.

### CLAR-007 - Client Admin hierarchy and User campaign/template approval

- Date: 2026-10-09
- Task: Pre-TASK-020 authorization, tenancy, and approval baseline
- Status: Implemented in schema contract and documentation; application enforcement remains assigned to the relevant Phase 2, 3, and 5 tasks
- Context/evidence: The owner clarified that the application creator and trusted partners are Super Admins; a doctor, car dealer, or other business owner is the Tenant Admin/client; and employees/assistants are Tenant Users under that one business. This conflicts with the earlier interpretation of Admin as a scoped platform operator. Users may manage granted routine business operations without approval, while campaign/post publication and templates require Admin approval.
- Questions: Does post mean a bulk WhatsApp campaign to Contacts/Groups; which operations require approval; and does a material change after approval require reapproval?
- Options/tradeoffs: Treating Admin as platform staff would deny the business owner required content access. Requiring approval for every User operation would add unnecessary workflow overhead. Approval without version binding would allow content or audience to change after review. A separate approval-history table would preserve every transition structurally but adds an extra MVP table and workflow complexity; current state plus append-only audit logs provides the required first-level evidence.
- User decision: Post means a bulk WhatsApp campaign sent to Contacts or Groups, and User-created/edited templates also require Admin approval. Contact/Group CRUD, inbox replies, tracking, and other permitted routine operations do not require approval. A material campaign change to audience/content/schedule or a material template change after approval automatically cancels approval and requires reapproval.
- Implementation outcome: Defined Super Admin as the only platform role, Tenant Admin as the single-business client owner, and Tenant User as the Admin-managed employee/assistant. Added one-active-membership enforcement for Tenant Admin/User. Added exact-version internal approval state and requester/reviewer evidence to `templates` and `campaigns`, separate from Meta template status. Added server/worker revalidation, self/cross-tenant/stale-approval denial, UI/API flows, test coverage requirements, ADR-012, and task acceptance updates. No table was added; the contract remains 33 tables.
- Verification: `pnpm schema:verify` passed the strengthened structural assertions. The complete schema executed successfully against PostgreSQL 16 with 33 tables, 11 soft-delete tables, zero cascading foreign keys, and a rolled-back validation transaction. `pnpm check` passed formatting, zero-warning lint, strict type checking, tests, and production builds across all seven workspaces.
- Affected documents: `RULES.md`, `TASKS.md`, `docs/00-product-vision-and-scope.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/01-functional-requirements.md`, `docs/02-roles-permissions-and-tenancy.md`, `docs/03-user-experience-and-screen-map.md`, `docs/05-domain-and-data-model.md`, `docs/06-api-contracts.md`, `docs/08-messaging-campaigns-and-webhooks.md`, `docs/10-security-privacy-and-compliance.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/13-testing-and-acceptance.md`, `docs/DATABASE_SCHEMA.md`, `design-doc/MVP_BACKEND_LLD.md`, `docs/DECISIONS.md`, `docs/MEMORY.md`, and `apps/api/database/schema/`.

### CLAR-008 - Strict backend Controller-Service-Repository rule

- Date: 2026-10-09
- Task: Repository engineering policy
- Status: Implemented
- Context/evidence: The owner required every future backend feature and code change to follow traditional Controller-Service-Repository layering, use dependency injection, keep database access out of controllers/services, keep HTTP concerns out of services, avoid business rules in repositories, and present generated backend code in clearly separated layer blocks/files.
- Question: What permanent backend dependency direction and layer ownership must all future implementation follow?
- Options/tradeoffs: Collapsing small features reduces initial files but mixes transport, business, and persistence concerns and becomes inconsistent as features grow. Strict layering creates more files but gives predictable ownership, isolated tests, centralized persistence rules, and clear dependency direction. Provider adapters and transaction boundaries must integrate without weakening the three-layer business flow.
- User decision: Require strict Controller-Service-Repository architecture for every backend task. Controllers handle HTTP only, services own business logic/workflows/transactions/external coordination without HTTP coupling, repositories/entities own database/ORM/raw queries without business decisions, constructor dependency injection connects the layers, and code output must remain visibly separated by layer.
- Implementation outcome: Added the rule to `AGENTS.md` and `RULES.md`, defined transaction, queue-processor, and provider-adapter placement, updated the architecture summary and backend LLD, and recorded ADR-013. No application code changed in this policy-only update.
- Verification: Repository instructions and architecture documents were searched for contradictory controller/repository ownership rules. The webhook ingestion design was corrected to delegate validation/orchestration to a service and persistence to a repository. `pnpm format:check` passed.
- Affected documents: `AGENTS.md`, `RULES.md`, `docs/ARCHITECTURE.md`, `design-doc/MVP_BACKEND_LLD.md`, `docs/DECISIONS.md`, `docs/MEMORY.md`, and this log.

### CLAR-009 - Safe initial identity, permission, and plan seed

- Date: 2026-10-10
- Task: TASK-022
- Status: Implemented
- Context/evidence: TASK-022 required initial Super Admin, Tenant Admin, Tenant User,
  system permissions, and plans, while the maintained documents intentionally left exact
  commercial limits unresolved. Hard-coded credentials or invented customer pricing would
  violate the security and clarification rules.
- Question: Should bootstrap identities come only from validated environment values, and
  should the unresolved plan catalog use a non-commercial internal plan until commercial
  packages are approved?
- Options/tradeoffs: Committed development credentials are convenient but unsafe and easy
  to reuse. Automatically overwriting existing accounts makes reruns convergent but can
  reset production access. Inventing customer plans would prematurely bind pricing. A
  single internal plan permits development while keeping commercial decisions open.
- User decision: Approved environment-only identity/display-name/temporary-password and
  tenant inputs; Argon2id password hashing; `SUPER_ADMIN`, `TENANT_ADMIN`, and
  `TENANT_USER`; the documented permission catalog with least-privilege User exclusions;
  one zero-price, non-commercial `MVP_INTERNAL` plan with generous configurable limits;
  and a transactional, repeatable seed that fails on missing input and never overwrites an
  existing password automatically.
- Implementation outcome: Added the explicit `schema:seed` command, validated seed-only
  configuration, Argon2id PHC hashing, strict SeedService/SeedRepository separation,
  advisory-lock serialization, conflict checks, exact role-permission reconciliation,
  single-tenant memberships, active internal subscription, and deduplicated redacted
  audit evidence. Added ADR-016 and the permanent bootstrap operations guide.
- Verification: Configuration tests cover missing, invalid, duplicate, and default inputs;
  the password test verifies salted Argon2id PHC output; and PostgreSQL integration runs
  the workflow twice, verifies stable users/memberships/audit/password hashes, and rolls
  the enclosing transaction back.
- Affected documents: `.env.example`, `TASKS.md`, `docs/ARCHITECTURE.md`,
  `docs/BOOTSTRAP_SEED.md`, `docs/DATABASE_OPERATIONS.md`, `docs/LOCAL_DEVELOPMENT.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/02-roles-permissions-and-tenancy.md`,
  `docs/11-plans-usage-and-billing.md`, `design-doc/MVP_BACKEND_LLD.md`,
  `docs/DECISIONS.md`, `docs/MEMORY.md`, and this log.

### CLAR-010 - TASK-023 browser authentication and session lifecycle

- Date: 2026-10-10
- Task: TASK-023
- Status: Implemented
- Context/evidence: The approved LLD required Argon2id verification, short-lived access
  tokens, opaque rotating refresh sessions, reuse detection, logout, and revocation, but
  exact browser transport, expiry, throttling, CSRF/origin policy, and the behavior of an
  already-2FA-enabled account needed binding decisions.
- Question: Which token transport/lifetimes, rate limits, replay response, browser request
  protections, and TASK-023/TASK-024 session boundary should the MVP use?
- User decision: Approved a 15-minute JSON access token; an opaque refresh token only in
  an HttpOnly, production-Secure, SameSite=Strict cookie scoped to `/api/v1/auth`; an
  absolute configurable 30-day refresh-family lifetime that rotation does not extend;
  Redis fixed-window login limits per client IP and normalized email; one generic 401 for
  rejected credentials; family revocation plus security audit on reuse; origin validation
  on login/refresh/logout; current-session logout in TASK-023; session listing/remote
  revocation in TASK-024; and `TWO_FACTOR_REQUIRED` denial without inventing a 2FA flow.
- Implementation outcome: Added strict AuthController -> AuthService -> AuthRepository
  layering; Argon2id verification with dummy work for unknown accounts; minimal HS256
  access tokens; HMAC-digested opaque refresh sessions; transactional absolute-expiry
  rotation and family replay containment; idempotent logout; Redis rate limiting; exact
  origin checks; secure cookie helpers; authentication audit events; Redis readiness; and
  required runtime secrets.
- Verification: Strict API typecheck and zero-warning lint passed. Unit tests cover token
  signing/tamper rejection, refresh hashing/cookies, password verification, rotation,
  fixed absolute expiry, reuse-family revocation, and dependency readiness. The API
  integration test passed against local PostgreSQL and Redis, and the database integration
  suite passed all migration/outbox/seed tests.
- Affected documents: `.env.example`, `TASKS.md`, `docs/ARCHITECTURE.md`,
  `docs/06-api-contracts.md`, `docs/LOCAL_DEVELOPMENT.md`, `docs/SECURITY.md`,
  `docs/TEST_PLAN.md`, `design-doc/MVP_BACKEND_LLD.md`, `docs/DECISIONS.md`,
  `docs/MEMORY.md`, and this log.

### CLAR-011 - TASK-024 identity projection, session control, and tenant guard contract

- Date: 2026-10-10
- Task: TASK-024
- Status: Implemented
- Context/evidence: The approved authorization model required live session context,
  single-business tenant scope, permissions, and absolute Super Admin tenant-content
  denial, but the exact session routes, `/me` projection, permission semantics, and the
  foundation to use before tenant domain repositories exist were not yet specified.
- Question: Which session API and fields should be exposed, what should `/me` return, and
  how should permission and tenant-content enforcement be made reusable for future domain
  repositories?
- User decision: Approved `GET /me/sessions` plus
  `DELETE /me/sessions/{sessionId}`; active owned sessions with current flag, user agent,
  IP, creation, and expiry; revocation of owned current or remote sessions; `/me` identity,
  role, safe tenant metadata, sorted permissions, and active plan entitlements; all-of
  permission semantics; unconditional Super Admin denial on tenant-content routes; and a
  non-null scoped-repository context that every future tenant repository combines with an
  explicit tenant predicate.
- Implementation outcome: Added live bearer authentication, PostgreSQL session/account/
  membership/permission resolution, reusable authentication/permission/tenant-content
  decorators and guards, `TenantScopeService`, the branded `TenantRepositoryContext`, and
  strict MeController -> MeService -> MeRepository endpoints. Session revocation selects
  by actor plus session ID, revokes the family, and records audit evidence atomically.
  Added ADR-018.
- Verification: Unit tests cover live context, revoked sessions, tenant-claim mismatch,
  all-of permissions, Super Admin tenant denial, `/me`, session listing, ownership, family
  revocation, and audit coordination. PostgreSQL integration exercises a seeded Tenant
  Admin through authorization, `/me` repositories, active-session listing, family
  revocation, and audit persistence inside a rolled-back test transaction. The broader
  adversarial leakage matrix remains TASK-025.
- Affected documents: `TASKS.md`, `docs/ARCHITECTURE.md`, `docs/06-api-contracts.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `design-doc/MVP_BACKEND_LLD.md`,
  `docs/DECISIONS.md`, `docs/MEMORY.md`, and this log.

### CLAR-019 - TASK-046 browser E2E runner

- Date: 2026-10-11
- Task: TASK-046
- Status: Implemented
- Context/evidence: Contacts, Groups, consent, and import behavior already has Node-based
  service/worker coverage, but the repository had no browser E2E runner or browser test
  harness. TASK-046 explicitly requires E2E coverage of the authenticated workspace.
- Question: Which browser test runner should verify the approved workspace flows?
- User decision: Approved Playwright with Chromium.
- Implementation outcome: Added Playwright Chromium as a root development dependency,
  `tests/e2e/` workspace tests, and a production-mode `next start` test server. Browser
  requests are intercepted with deterministic API doubles so the suite covers the
  authenticated Contact creation/opt-in and Groups/import-start flows without a live API,
  database, Meta account, real credentials, or customer data. Real service and PostgreSQL
  integration suites continue to cover persistence, authorization, and tenant boundaries.
- Verification: `pnpm test:e2e` passes both Chromium workspace flows. The full local gate
  runs the production build before the browser tests, ensuring `next start` has a current
  build artifact.
- Affected documents: `TASKS.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`, and this log.

### CLAR-020 - TASK-050 outbound policy and quota contract

- Date: 2026-10-12
- Task: TASK-050
- Status: Implemented
- Context/evidence: The approved architecture requires every campaign, inbox, and
  automation send path to use one server-side messaging boundary. Exact commercial
  pricing remains open, but the internal plan already supplies a configurable monthly
  message limit and the schema contains durable Messages and an append-only usage ledger.
- Question: Which message types, consent/window rules, subscription states, quota
  accounting point, and delivery boundary should TASK-050 establish?
- User decision: Approved a backend-only `MessagingService.createOutboundMessage()` with
  no public endpoint or UI yet; initial `TEXT` and `TEMPLATE` composition; free-form text
  only inside the customer-service window; internally and Meta-approved templates;
  universal blocks for opted-out/suppressed/deleted Contacts; opt-in for business-initiated
  templates; connected account enforcement; sending only for `TRIAL`/`ACTIVE`
  subscriptions; atomic quota reservation and append-only usage at `CREATED`; no duplicate
  quota consumption; no automatic provider-failure refund; and durable Message creation
  in TASK-050 while outbox/BullMQ delivery remains TASK-051.
- Implementation outcome: Added strict MessagingService -> MessagingRepository layering,
  tenant-safe policy snapshots, atomic tenant-period quota serialization, durable
  idempotency through `client_message_key`, a stored safe policy decision, usage evidence,
  and redacted audit evidence. Valid tenant policy denials persist as safe `FAILED`
  Messages without usage; malformed, unauthorized, and cross-tenant attempts do not.
  Stable client-key locking precedes monthly quota locking, and replay reads the immutable
  composition decision rather than mutable delivery errors. No public send endpoint,
  provider call, or queue publication was introduced.
- Verification: Unit tests cover allowed text, closed-window blocks, template consent and
  variables, quota exhaustion, same-input replay, changed-input conflicts, and later
  delivery-error replay. PostgreSQL integration verifies tenant isolation, one durable
  reservation, idempotent replay, and a persisted quota block in a rolled-back fixture.
- Affected documents: `TASKS.md`, `docs/ARCHITECTURE.md`,
  `docs/08-messaging-campaigns-and-webhooks.md`, `docs/11-plans-usage-and-billing.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`, and this log.

### CLAR-023 - TASK-053 campaign drafts

- Date: 2026-10-13

- User approved the recommended Contacts and static Groups audience scope, backend plus
  draft UI, literal/Contact-field variables, stale-edit rejection and approval invalidation.
- Saved segments are deferred to TASK-058 for future design approval. TASK-054 owns preflight/snapshot/recipient validation;
  TASK-055 owns approval submission/review, scheduling, sending and reports.
- Implementation uses the existing campaigns table and JSON definition columns;
  no provider calls, message creation, quota reservation or recipient expansion occur.
- Resolution: row-locked material version plus content-derived revision reject stale
  saves; material edits atomically clear prior review, while name/description edits
  preserve approval. Admin material work uses NOT_REQUIRED and User work uses DRAFT.
- Connected fixes: include Campaign feature files in frontend lint (TASK-053.4) and
  remount the editor on explicit reload even for an unchanged server version (TASK-053.5).
- Verification: pnpm check passed, including 50 API tests and five Playwright tests;
  three additional rollback-only Campaign PostgreSQL tests passed. No real sends,
  schema changes, external writes or commits occurred.
- Permanent record: CAMPAIGN_DRAFTS.md, API/architecture/security/test documentation,
  backend LLD, TASKS and MEMORY.
- Status: Implemented and verified.

### CLAR-022 - TASK-052 delivery and recovery

- Date: 2026-10-13
- Status: Implemented within the verified provider boundary (TASK-057 numeric-code follow-up).
- User answer: approved the complete recommended TASK-052 plan.
- Resolution: shared server-only provider, TEXT/TEMPLATE sends, five total attempts,
  exponential jitter and longer Retry-After, permanent nonretryable errors, durable
  SENDING/SENT/provider-ID acceptance, FAILED terminal state, restricted audited private
  replay and consumer activation. Required TASK-056 delivery tests belong to TASK-052.
- Unknown acceptance is excluded from replay. Crash or failed acceptance persistence
  retains SENDING for operational review; no external exactly-once guarantee is assumed.
- Connected defects: remove nonexistent messages.is_deleted query; replace reserved
  colon job IDs with stable message/event IDs, preserving duplicate relay dedupe while
  allowing new explicit replay generations. Replay commands disable all consumers.
- Runtime verification also required the existing TASK-047 metadata-compatible Nest CLI
  approach in worker development and compiled private replay commands (TASK-052.5).
- Text HEADER/BODY parameters are supported; unsupported media/buttons fail closed.
  Campaign dispatch awaits TASK-053–055 approval/recipient workflows.
- Permanent record: ADR-019, OUTBOUND_DELIVERY_OPERATIONS.md, architecture, provider/
  messaging docs, TEST_PLAN, MEMORY and backend LLD.
- Verification: pnpm check, ten API PostgreSQL tests and three worker PostgreSQL/Redis/
  BullMQ tests passed; fake-response tests sent no real WhatsApp messages.
  The final gate also passed after TASK-052.5; compiled replay initialized dependencies
  and rejected a nonexistent message as expected, without writes or sends.

### CLAR-021 - TASK-051 safe queue transport boundary

- Date: 2026-10-12
- Task: TASK-051
- Status: Approved, implementation in progress
- Context/evidence: TASK-050 creates durable outbound Messages, but the Meta adapter's send
  operation and the required response/retry/dead-letter semantics remain TASK-052. Enabling
  provider delivery before those guarantees exist could duplicate sends or strand Messages
  in `SENDING`.
- Question: Should TASK-051 remain safe queue plumbing or combine provider delivery with
  TASK-052?
- User decision: Approved the recommended transport-only boundary: atomically create a
  `message.outbound.created` outbox event; relay only the Message UUID to BullMQ with a
  deterministic job ID; atomically publish the outbox row and advance the Message to
  `QUEUED`; add thin processor/service/repository boundaries; keep actual consumption
  disabled until TASK-052; add relay polling, stale-lock recovery, queue concurrency, and
  duplicate/restart tests; and never place phone numbers, content, credentials, or provider
  payloads in Redis.
- Implementation plan: Extend typed runtime configuration, create the outbox event inside
  TASK-050's transaction, implement strict queue adapter -> service -> repository worker
  flow, fail closed if delivery is accidentally enabled before TASK-052, and document the
  operational boundary.
- Affected documents: `.env.example`, `TASKS.md`, `docs/ARCHITECTURE.md`,
  `docs/08-messaging-campaigns-and-webhooks.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`,
  `docs/MEMORY.md`, and this log.
### CLAR-024 - TASK-054 durable campaign preflight contract

- Date: 2026-10-13
- Status: Approved
- Question: Should large campaign preflight run synchronously or durably in the background; may it run before internal approval; and should insufficient quota truncate the audience or block the campaign?
- Context/options: A synchronous request is simpler but can block API capacity while resolving the documented 100,000-recipient load target. Requiring approval before any preflight prevents Users/Admins from diagnosing audience problems during review. Partial quota sending can silently change the business-selected audience.
- Owner decision: Use a durable asynchronous BullMQ preflight with polling. Permit diagnostic preflight before Admin approval, then require TASK-055 to rerun/finalize it against the exact approved version before scheduling or sending. Persist every deduplicated resolved Contact as `PENDING` or `SKIPPED` with an explicit reason. Report quota without reserving it, and block rather than silently truncate when eligible recipients exceed the remaining quota.
- Implementation boundary: TASK-054 owns durable run state, audience resolution, recipient replacement, validation/estimates and UI reporting. TASK-055 owns exact-version finalization, approval, scheduling and dispatch.
- Affected documents: `TASKS.md`, `docs/08-messaging-campaigns-and-webhooks.md`, `docs/CAMPAIGN_PREFLIGHT.md`, `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`.

### CLAR-025 - Phase-end testing cadence

- Date: 2026-10-13
- Status: Approved by direct owner instruction.
- Owner request: Complete phase implementation before writing test files or executing tests. At phase closure, cover all applicable cases, fix failures, and update test-case records.
- Resolution: Defer automated tests and test-file changes to phase closure; record pending cases during tasks and retain static/build checks. Preserve existing tests and historical results. Distinguish implementation completion from phase verification. Explicit owner requests may authorize earlier testing.
- Affected documents: `AGENTS.md`, `RULES.md`, `TASKS.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`.

### CLAR-026 - Optional phase testing with owner checkpoint

- Date: 2026-10-13
- Status: Approved by direct owner instruction; supersedes CLAR-025's mandatory phase-end test gate.
- Owner request: Ask at each phase whether test files should be created and tests run now or skipped until a later phase. Keep test authoring/execution optional until all tasks finish.
- Resolution: Ask at phase boundaries and wait before testing. Record the choice and deferred coverage; keep test tasks pending while allowing next-phase implementation. Revisit all deferred cases after all implementation tasks finish. When approved, write/run tests, fix failures, retest, and update records. Preserve static/build checks and existing tests. Deferred coverage never counts as verified completion or production readiness.
- Affected documents: `AGENTS.md`, `RULES.md`, `TASKS.md`, `docs/TEST_PLAN.md`, `docs/MEMORY.md`.

### CLAR-027 - TASK-055 approval and delivery lifecycle

- Date: 2026-10-15
- Status: Approved; owner answered “approve” to all four recommendations.
- Decisions: Store schedule UTC/timezone in the draft before approval; changing it invalidates approval. Bind approval to the exact template version; subsequent template edits block sending pending a new review. Pause prevents new provider claims, while an already-started submission may finish; resume rechecks approval/policy, and cancel permanently stops remaining unsent work. Recheck full remaining quota before dispatch and pause remaining work if quota becomes insufficient after delivery starts.
- Implementation: Reuse the existing MessagingService and message outbox/delivery path. Persist lifecycle request identity, active preflight/template evidence, and operational reason; expose tenant-scoped reports. Tests remain deferred per CLAR-026.
- Outcome: Implemented API/UI, durable worker scheduling, final preflight, 25-recipient composition batches, provider-claim checks, quota pause, controls and reports. Static/build/schema gates passed and migration 0008 applied locally. Runtime acceptance tests remain pending as T055-01–16. ADR-020 records the server-only workspace runtime export. Required preflight audit and preflight/webhook job-ID corrections are TASK-055.5–7; the separate import correction is TASK-059.

### CLAR-028 - TASK-059 Contact-import queue compatibility

- Date: 2026-10-15
- Status: Approved by the owner's instruction to proceed with the recommended TASK-059.
- Evidence: The installed BullMQ job validator rejects `contact-import:{importId}` because it contains a colon and has two segments.
- Resolution: Use `contact-import-{importId}`, preserving deterministic identity, identifier-only payload, retry settings and outbox recovery. No clarification or architecture change is required. Automated transport coverage is deferred as T059-01–04 under CLAR-026.

### CLAR-029 - Phase 5 testing before Shared Inbox

- Date: 2026-10-15.
- Status: Approved by the owner's explicit request to test Phase 5 before TASK-060.
- Scope: Create/update tests and run the local unit, PostgreSQL, Redis/BullMQ, browser and static/build gates for messaging/campaigns. No further clarification is required for this already-documented test scope.
- Resolution: Use fake provider responses, rollback database fixtures, an isolated generated database for concurrency and unique Redis prefixes. Fix discovered necessary issues under TASK-056 subtasks without changing approved product behavior.
- Findings: Fixed invalid campaign-composition locking SQL (TASK-056.1), updated the stale migration/table assertion (TASK-056.2), and aligned existing draft/browser fixtures with current contracts.
- Record: `docs/PHASE_5_TEST_REPORT.md` distinguishes local passing scenarios from unverified process-kill/race/full-dispatch/month-rollover coverage. TASK-056.3 remains pending; this is not owner approval to defer it permanently or a claim of production readiness. TASK-060 is not started.

### CLAR-030 - Prioritize the usable MVP over deeper-than-needed engineering

- Date: 2026-10-15.
- Context: After the Phase 5 checkpoint, the owner asked whether delivery was still appropriate for an MVP. Recommendation: keep the approved architecture, finish essential workflows, defer saved segments/advanced features, track extended stress/outage checks separately, preserve launch-critical safety, and validate end-to-end with Meta test assets before customer use.
- Owner answer/approval: “yes, think we are working in deeper than necessary; make those recommendation correction in md.” Approved documentation and priority correction; not an instruction to start another feature or send messages.
- Resolution: Added `docs/MVP_DELIVERY_PRIORITIES.md`. TASK-060 is the next core task; inspect/reuse TASK-036 first. Basic automation remains in the MVP; TASK-058 is post-MVP. TASK-056 is pending, with local checkpoint completed and its test results preserved. Link critical remaining safety/user-flow checks to TASK-084/086 and exhaustive stress to TASK-085. Keep TASK-057 before production delivery. Validate initial workload before launch and the 1,200-user target before scaling to it.
- Guardrails: No architecture/schema/code changes, removed safeguards, deleted tests, weakened assertions, falsely completed tasks or speculative new features. Phase-boundary test approval remains unchanged. No ADR is required because no binding architecture decision is replaced.
- Updated records: PRD, architecture/LLD delivery notes, RULES, TASKS, TEST_PLAN, Phase 5 report, MEMORY and delivery-priority guide.

### CLAR-031 - TASK-060 inbound resolution edge cases

- Date: 2026-10-16.
- Status: Approved and implemented; owner answered “go with recommendation” on 2026-10-16.
- Inspection: TASK-036 already normalizes inbound messages, upserts active Contacts, creates/reuses the account/Contact Conversation, stores provider IDs once and updates unread/activity/window state. Reuse that path. The current active-only Contact upsert can create a new identity when the same phone has a soft-deleted Contact; an invalid/missing provider timestamp falls back to processing time for the reply window. Neither edge policy is explicitly settled by CLAR-015.
- Questions: When only a soft-deleted Contact matches the sender, should processing preserve the event for review without automatically restoring/recreating the Contact (recommended), restore the Contact, or create a new active Contact? For a missing/invalid timestamp, should processing fail safely through existing failure/replay tooling without opening a reply window (recommended), or store the message without extending the window?
- Required scope regardless of answers: Preserve tenant/account ownership, message idempotency, existing consent/STOP rules and the single webhook pipeline. No new UI, reply endpoint, media-download system, realtime or automation engine belongs to TASK-060. Record Phase 6 test cases; automated test authoring/execution remains deferred under the existing cadence.
- Resolution: Hold deleted-only sender events through existing FAILED/DEAD and safe code INBOUND_CONTACT_REVIEW_REQUIRED, without automatic restoration/recreation. Reject invalid inbound timestamps with INBOUND_TIMESTAMP_INVALID; never use processing time to open a reply window. The whole event rolls back on either condition; raw verified payload stays retained. Retries remain bounded; private replay requires legitimate recovery and does not repair malformed payloads automatically.
- Implementation: Service owns transactional orchestration and policy; repository owns SQL. Revalidate stored account/phone metadata, scope outbound status effects to tenant/account, serialize provider-key/phone resolution, and skip duplicate inbound effects before profile/unread/STOP writes. Reuse existing Contact/Conversation/message schema; no architecture replacement or ADR required.
- Verification: Formatting, worker lint/typecheck/build passed (10 tasks including dependencies). No automated tests or live Meta calls. T060-01–09 and existing webhook service-double updates are pending under TASK-065; prior passing tests do not verify this change. See `docs/INBOX_INBOUND_RESOLUTION.md`.

### CLAR-032 - TASK-061 read state and conversation controls

- Date: 2026-10-16. Status: Approved; owner answered “approved” to all three recommendations. Implementation follows this contract.
- Existing scope: Conversation list/detail/history with cursor pagination; search Contact name/phone and tenant/account/status/unread filters. No message-body search, media retrieval, UI, replies, assignment/notes or realtime implementation here. Use existing conversation.read and conversation.close permissions and strict tenant scope; Super Admin remains denied.
- Recommendation 1: Keep the schema's shared per-Conversation unread count, not per-agent tracking. GET remains read-only. An explicit mark-read command acknowledges through the newest message actually displayed (server-validated message ID); later arrivals stay unread. Mark-unread flags the conversation with at least one unread when inbound history exists, not a fabricated unread count per agent. This is local inbox state, not a Meta read receipt.
- Recommendation 2: conversation.read permits list/history/search and local mark-read/unread; conversation.close permits close/reopen. No new permission/catalog migration for this MVP. Alternative: introduce a separate read-state write permission, which requires seed/authorization changes.
- Recommendation 3: Close/reopen changes conversation status and records redacted audit only. It does not clear unread, cancel messages, modify consent, change the service window, or pause/resume automation. Those side effects require separately approved workflows.
- Owner approval: All three recommendations approved. No repeated approval was required for already documented Contact-name/phone search or tenant isolation.
- Implemented resolution: Controller-Service-Repository module registered with the existing authorization module; typed browser-safe projections and strict input parsing. List uses activity/UUID cursors; history uses stored timestamp/UUID cursors without timestamp rounding. Read validates a message boundary and caps remaining unread at the current count under the Conversation lock; unread is a shared attention flag. Close/reopen are status-only. Mutations and redacted audit commit together; no-op requests do not add duplicate audit.
- Verification: Formatting plus API/contracts lint/typecheck/build passed all 11 tasks including dependencies; git diff checks passed. No automated tests, live provider calls, schema changes, migration or new dependency. T061-01–09 remain pending under TASK-065. See `docs/INBOX_API.md`; no ADR required because the approved architecture is unchanged.

### CLAR-033 - TASK-062 agent reply state boundaries

- Date: 2026-10-16. Status: Approved; owner answered “approved” to both recommendations.
- Existing approved scope: POST /conversations/{id}/messages, active tenant conversation.read/reply permissions, server-resolved account/Contact, strict input and actor-scoped idempotency, existing MessagingService/outbox/worker path. Reuse supported TEXT and approved TEMPLATE text-parameter messages only; no UI, new media pipeline, read receipt or per-reply Admin review. Existing policy enforces consent, window, template approval, plan/quota and account health.
- Question 1/recommendation: Require explicit reopen before accepting a new reply on CLOSED/ARCHIVED threads; allow OPEN/PENDING. Alternative: automatically reopen on reply, which introduces an additional audited status side effect beyond TASK-061's explicit controls.
- Question 2/recommendation: Block a new human reply while automation_state=ACTIVE until explicit handoff/pause in TASK-074. Do not silently pause/resume the bot or allow simultaneous bot/human ownership. Existing NONE/PAUSED/HANDED_OFF states permit the reply subject to normal policy.
- Approved resolution: New replies require OPEN/PENDING and NONE/PAUSED/HANDED_OFF. The common composer checks these under a Conversation lock after its established message-key/quota locks. CLOSED/ARCHIVED returns CONVERSATION_REOPEN_REQUIRED; ACTIVE/unknown automation returns CONVERSATION_HANDOFF_REQUIRED. These are stable common policy blocks with FAILED/audit evidence and no usage/outbox. Existing accepted idempotent requests are resolved before new-reply guards; close does not cancel accepted messages. TASK-074 still owns handoff/automation ownership, including coordination with pending/in-flight messages.
- Implementation: Added a thin POST reply controller route, dedicated DI reply service and strict parser; derive tenant/account/Contact server-side, actor-namespace client keys and delegate to MessagingService. Accepted new replies update last activity in the same transaction without changing unread/window/status/automation. Reuse existing outbox/worker and provider types; safe response fields only. No new dependency, schema, permission or parallel delivery path.
- Verification: Formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies); git diff checks passed. No test files changed, tests executed or live Meta calls. T062-01–09 and existing common INBOX composer-double updates remain pending under TASK-065. See `docs/INBOX_REPLIES.md`. No ADR needed; approved architecture is unchanged.

### CLAR-034 - TASK-063 assignment and internal note semantics

- Date: 2026-10-16. Status: Approved; owner answered “approved” to all three recommendations.
- Existing evidence: Conversation has assigned_user_id; conversation_notes stores tenant/conversation/author/text/time and has no edit/delete fields. Existing permissions are conversation.read/reply/assign/close, with no dedicated note permission. Internal notes must never be provider messages; assignment does not currently restrict authorized shared inbox reads.
- Recommendation 1: Require conversation.read/assign to assign an active same-tenant Admin/User or null to unassign. No queue assignment in this slice. Change only the Conversation assignee, not Contact assignment, status, unread, automation or access rights; no implicit handoff.
- Recommendation 2: conversation.read permits note listing; conversation.read/reply permits note creation. Keep plain-text, append-only notes bounded to 1–4000 trimmed characters. No edit/delete or new permission/migration in this task. Ordinary tenant members only; no Super Admin content access.
- Recommendation 3: Permit these internal operations on all existing conversation statuses without reopening/sending. Use a client-generated note UUID in the existing primary key for safe create retries; exact author/conversation/content replay returns the existing note, incompatible ID reuse conflicts. Transactional audit omits note text; list notes separately with cursor pagination. No Meta call, outbound Message or outbox event.
- Owner approval: All three recommendations approved. Implemented the active same-tenant assignee/null contract, read/reply note permissions, append-only 1–4000 plain-text notes and all-status internal operations with UUID-based retry semantics.
- Resolution: Dedicated collaboration controller/service and note repository reuse existing schema, Conversation repository/locks and Contact member validator. Note conflicts are scoped and generic; exact replay returns the existing note, with no duplicate audit. Audit includes only note/assignee IDs, never text. No messaging/provider/outbox dependency, new schema, permission or ADR required.
- Verification: Formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies); git diff checks passed. No test files changed, tests executed or live sends. T063-01–08 remain pending under TASK-065. See `docs/INBOX_COLLABORATION.md`.
- Discovered follow-up: TASK-066 records the missing Shared Inbox frontend in Phase 6. Existing workspace code has no Inbox screen and TASK-061–063 deliver APIs only. UI design/implementation still requires the owner's task-specific approval; it is not included in TASK-063.

### CLAR-035 - TASK-064 MVP refresh transport

- Date: 2026-10-16. Status: Approved; owner answered “approved” to polling and the stated refresh policy.
- Context: Transport remains open in MEMORY/LLD. Existing REST APIs already enforce tenant access; no Shared Inbox UI or push infrastructure exists. The owner approved prioritizing a usable MVP and deferring speculative infrastructure (CLAR-030).
- Options: Bounded polling reuses ordinary authenticated GETs without a connection gateway, with refresh latency/request overhead. SSE provides one-way push but requires authenticated long-lived connection lifecycle/reconnect/event authorization. WebSocket adds bidirectional connection management not needed for these read updates. No option is a measured capacity guarantee.
- Recommendation: Poll via existing GET APIs every 15 seconds while the Inbox is mounted, visible and online; refresh immediately on return/focus/reconnect and after successful local actions. One refresh in flight per mounted Inbox; coalesce triggers, stop/cancel on unmount/context change, avoid stale responses, back off transient errors to 30/60 seconds, stop automatic retries for terminal authorization failures, retain last good data and support manual refresh. No provider read receipts or new backend endpoint.
- Scope: Implement a typed Inbox API adapter and reusable refresh foundation now; TASK-066 integrates it with actual screens. Add same-runtime single-flight access-token refresh to the existing client, since concurrent polling requests can otherwise rotate the refresh token concurrently. New frontend files and the changed client must be linted. No new dependency, schema or provider behavior.
- Owner resolution: Approved. Implemented typed Inbox API access and a keyed refresh hook: visible/online cycles, coalesced triggers, transient 30/60-second backoff, cancellation/stale-data guards and non-retryable 4xx stop. Protected data clears on 401/403. TASK-066 must invoke refresh after local actions and mount the hook; no actual Inbox freshness is claimed yet.
- Auth/lint resolution: Same-runtime single-flight refresh, reuse of newer tokens for late 401s, failed-refresh token clearing and generation checks for obsolete protected responses/token writes. Login/logout wait for rotation; logout reuses the existing cookie-authenticated route. Normalize HeadersInit with Headers; broader lint exposed the prior unsafe spread. Cross-tab/auth-cookie race coordination remains outside this fix and must be reviewed under TASK-065/084.
- Verification: Formatting and web lint/typecheck/production build passed (4 tasks including dependency build), git diff checks passed. No tests/test-file changes, provider calls, dependencies or schema changes. ADR-021 records transport approval; T064-01–10 remain pending. See `docs/INBOX_REFRESH.md`.

### CLAR-060 — Research-led 2020s application visual refresh

- Date: 2026-10-23.
- Context: The owner said the current application UI feels dated and explicitly asked for current internet design research followed by a full UI refresh. Black and white or closely related neutrals are acceptable. Product behavior, permissions and backend contracts were not requested to change.
- Research: Current first-party guidance and product examples were reviewed from Linear's 2026 design refresh, Vercel's Geist design system and Atlassian's spacing/elevation foundations. The recurring patterns are receding navigation, restrained color, hierarchy created by spacing and typography instead of heavy borders, compact controls, flat default surfaces and elevation reserved for overlays.
- Owner answer/approval: The owner's request is explicit approval for the visual refresh. No material product or architecture ambiguity remains, so no additional clarification is required.
- Resolution: Retain Geist as the sole application font. Use a warm-neutral canvas, white work surfaces, a soft-gray sidebar, near-black primary actions, subtle active navigation and restrained green only for operational/live/success meaning. Use compact 14/20 px body text, dashboard headings no larger than 32 px, an 8 px spacing rhythm, 8 px controls, 12 px cards and 16 px overlays. Remove dominant yellow tiles/actions, decorative gradients, heavy shadows and uppercase display shouting. Preserve accessibility, 44 px mobile touch targets, the fixed desktop sidebar/responsive drawer and all existing workflows.
- Scope boundary: This decision changes shared Web presentation and limited presentational markup only. It does not authorize new flows, content changes, API/provider behavior, dependency changes, schema changes, deployment or live sends. Automated tests remain deferred under CLAR-026; focused static/build and visual checks are required.

### CLAR-079 — Shared large page container and alignment rhythm

- Date: 2026-10-23.
- Context: After approving the CLAR-060 visual refresh, the owner asked for a large container and consistent alignment/gaps among headers, buttons and sections on every page.
- Owner answer/approval: The request explicitly approves a shared layout refinement. No workflow, content, permission or backend behavior was requested, so no further clarification is required.
- Resolution: Use one 1,200 px maximum workspace content container with fluid 20–36 px gutters. Align the sticky topbar, page headings, action rows and feature roots to the same edges. Use 24 px page/section separation, 16 px action wrapping gaps and existing compact 8/12/16 px internal component spacing. Retain 44 px mobile targets and reduce mobile section spacing without introducing horizontal overflow.
- Scope boundary: Shared CSS and token/documentation changes only. No API, schema, dependency, product flow, copy, deployment or test-scope change.
