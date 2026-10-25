# Project Memory

## Partner Super Admin local checkpoint — 2026-10-25

CLAR-083 / TASK-093: owner approved the recommended unified tenant billing-control direction.
Online and offline payments share one entitlement model. Offline payment is recorded first as
append-only evidence; a separate explicit audited command later assigns/extends plan, period and
subscription status. Payment insertion never grants entitlement by itself. Subscription expiry
or billing suspension preserves data and approved read-only access while quota-consuming creation/
execution is blocked server-side; security/abuse/policy tenant suspension remains a distinct
stronger control. Super Admin manages tenant-level billing/subscription, while Tenant Admin keeps
ordinary Tenant User management. Implementation has not started. Gateway choice, pricing,
currencies, partial payments, grace, renewal dates, proration, tax/invoice/refund rules remain open.

TASK-091.1 / CLAR-082: owner explicitly authorized automated tests. Creation25/auth32,
disposable PostgreSQL-Redis integration15 (parent included), mocked Chromium11 passed.
Real SQL caught invalid Drizzle schema-qualified FOR UPDATE OF; repository now locks the
creator row separately before joined eligibility recheck, same transaction/auth lock order.
Full/preview creation, duplicate concurrency, audit rollback, partner handover and tenant
privacy passed. Mobile harness hydration/alert scoping repaired. No hosted data, deployment,
real account or provider calls. See SUPER_ADMIN_TEST_REPORT.md for exact evidence and
remaining combinations/UAT; earlier deferred suites remain deferred.

## Partner Super Admin creation — 2026-10-25

TASK-091 / CLAR-081 / ADR-034: owner explicitly approved Add Super Admin UI/API for existing
Super Admins. New POST platform/super-admins uses existing user.invite, shared account DTO,
actor limiter, Argon2id and strict Controller-Service-Repository transaction boundaries.
Authentication lock then actor-row/session recheck; server-owned existing system role/null
tenant/no memberships; reserved-email including deleted guard denies promotion/reclaim.
Active account/must_change_password=true and redacted audit commit together. Full/preview
reuse same layers. Existing initial-password service now permits pending platform accounts,
retaining principal/credential/session checks and revoke-all/version/audit/cookie/fresh login.
Bootstrap/existing owners unchanged. UI warns/confirms platform privileges, supports dirty
guards and clear-on-success; creation only, no list/edit/delete/reset or email flow.
No migration/new dependency, real account, DB/cloud/provider operation or deployment.
Runtime/automated acceptance awaits owner checkpoint choice; see T091 in TEST_PLAN.md.
Static verification passed: contracts/API/Web production builds, API/Web registered lint,
Web typecheck,35-table schema verifier and git diff --check. No automated tests were authored
or executed. Existing unrelated uncommitted code/test/operations work remains untouched.

## Railway development-first promotion workflow — 2026-10-25

CLAR-080 / TASK-090: owner approved one Railway Pro project with two isolated persistent
environments. `development` deploys `dev` and is the current target for the complete Web/API/
Worker/singleton-Scheduler/PG/Redis/Bucket/ClamAV/test-SMTP stack, Meta test-asset E2E and owner
UAT. `production` deploys `main`; the existing restricted preview remains unchanged until
development acceptance and a separate explicit owner-approved `dev` -> `main` promotion. Do not
create a divergent `PROD` branch. Data, Redis/queue prefix, storage, keys, secrets, Meta assets/
credentials/webhooks and domains remain environment-isolated; never copy production customer
data into development. Production promotion separately gates migrations, backup/restore,
monitoring/cost controls, security/acceptance evidence and smoke checks. Documentation only:
no Git, Railway, billing, migration, test, provider or send action performed.

## Migration-to-table reconciliation — 2026-10-23

CLAR-078 / TASK-088.1: owner's intended merge is the resulting migration changes inside
each separate current table SQL, not one combined SQL. Reviewed0001–0010: effects already
present in the corresponding table files; no SQL mutation/duplicate ALTER needed. Added
schema/README.md migration-to-table map for traceability. Applied migrations remain untouched;
no live/local migration, seed or SQL execution. This is structural review/static verification,
not exhaustive catalog-equivalence or runtime acceptance.

## Separate SQL files retained — 2026-10-23

CLAR-077 supersedes CLAR-076's consolidation interpretation. Owner explicitly rejected a
combined file and requested the original per-table layout. TASK-088 restored all38 original
SQL bodies (35 tables plus bootstrap/deferred keys/triggers), original manifest and both
schema tools; removed combined schema.sql/new reader. ADR-033 remains as withdrawn history.
Future structure changes need new reviewed versioned migrations plus matching per-table
contract/Drizzle updates; applied migrations unchanged. No DB operations/tests were run.
Static schema verification passed35 tables;38 separate SQL files confirmed, combined SQL/reader
absent and original manifest/tools/migrations show no diff. git diff --check passed.

## Current-state entry point and history boundary

Start with [CURRENT_STATE.md](CURRENT_STATE.md) for the consolidated reading guide and
document ownership. This file retains dated work/evidence; older “pending”, migration counts,
URLs and process states describe their checkpoint, not current configuration. Later explicit
approvals/verification entries supersede earlier incompatible status. No history is deleted.

## Documentation reconciliation — 2026-10-23

TASK-087 / CLAR-075: owner approved Markdown cleanup while retaining ADRs, approvals, test
reports and deferred cases. Correct current35-table counts, polling and implemented encrypted
signup guidance; separate trial preview from full Railway Pro rollout; label local/hosted
historical checkpoints and remove one exact duplicated deployment paragraph. Add CURRENT_STATE
as a navigation/ownership entry point without moving evidence or rewriting ADR decisions.
No application/UI changes, tests, DB/cloud operations or acceptance/launch approvals performed.
Verification: selected Markdown link targets exist; git diff --check passed; ADR files,
test reports and TEST_PLAN.md unchanged. Approval history retained with a new clarification
and reading note only. Unrelated in-progress UI/code and existing design edits preserved.

## Hosted migration checkpoint — 2026-10-23

Owner explicitly requested “run migration file too” (CLAR-074 / TASK-082.4.8). Read-only
drizzle.__drizzle_migrations count was10, matching pending0010_encrypted_provider_credentials.
Ran existing node dist/database/migrate.js in the active API console under /app/apps/api;
output Database migrations applied successfully. Verified11 applied migrations and metadata
presence of app.provider_credentials.encrypted_token and provider_credentials_storage_check.
All four services still Online. No seed/reset/deletion, customer-row inspection, secret edits,
new deployment or persistent pre-deploy setting changes. This supersedes the older9-migration
hosted checkpoint. Automated/authenticated feature verification remains separate.

## Railway missing Web domain repaired — 2026-10-23

TASK-082.4.7 / CLAR-073: API startup failed because WEB_PUBLIC_URL/API_PUBLIC_URL/
CORS_ALLOWED_ORIGINS resolved to only https://. Web had no public domain. Owner explicitly
approved generating Web-only domain and redeploying. Generated web-production-92be3.up.railway.app
target8080; existing references automatically resolved to that HTTPS origin without variable edits.
Web retains NEXT_PUBLIC_API_URL=/api/v1 and API_PROXY_URL=http://api.railway.internal:8080/api/v1;
API PORT8080 unchanged. Redeploy6964ca35-669b-4433-8d1f-6e7840bcb97a Active, Nest startup
confirmed, Web/API/Postgres/Redis Online. Public login renders; GET /api/v1/me returns expected
UNAUTHENTICATED. /api/v1/health/ready returned404 because health routes intentionally exclude
the API prefix; private /health/ready dependency acceptance was not performed. No credentials,
schema/data, source code, paid plan or public API endpoint changed; no authenticated UAT claim.

## Own Profile — 2026-10-22

TASK-086.8 / CLAR-072: approved shared Profile for all roles/full/preview. Name-only PATCH /me
with own-actor/tenant/active/non-deleted predicates and atomic redacted audit; email/role/business
stay read-only. POST auth/change-password reuses initial-handover strength/rate/hash/lock/session
workflow, supports platform null tenant, revokes all sessions/increments version/audits atomically,
expires cookie and returns to fresh sign-in. Pending first-login gate preserved. No migration,
S3/dependency/provider/Railway changes or data mutations by agent. See PROFILE.md and TEST_PLAN.md.
Automated test checkpoint requires owner choice; no Profile runtime acceptance claimed.
Verification: API build/lint, web typecheck/registered lint (now includes profile), web production
build, 35-table schema contract and git diff check passed. Initial web build failed fetching
existing Geist under sandbox network restrictions; network-authorized rebuild passed. No tests
were authored or executed. TASK-086.8 implementation complete, runtime/UI acceptance pending.

## Direct Embedded Signup connection — 2026-10-21

TASK-032.2 / CLAR-071: owner chose direct Tech Provider, no agency credit sharing. Connection
implemented full/preview: configured mode -> explicit Prepare/Continue SDK -> one-use10-minute
actor/session/tenant/nonce/config Redis attempt -> fixed-host code/token/app/scope/expiry/WABA/
phone verification -> tenant-locked account upsert + encrypted credential/audit one transaction.
Stable same-tenant reconnect; foreign reassignment denied. Missing config/key fails closed;
READY_TO_CONNECT is configuration readiness only, not Meta approval. Browser IDs are hints.
No auto registration/subscription/payment, sends, webhooks or worker activation. Shared keys
and encrypted resolver retained; same per-client Tenant Admin boundary, no impersonation.

Combined local checkpoint:35/35 config/provider/signup/template/account,31/31 auth/password/
me + isolated full API smoke,13/13 actual PG/Redis (12 scenarios plus parent),19/19 Chromium
mocked SDK/API (includes existing setup/template/responsive/password gate). New signup SQL
checks concurrent completion, foreign session/tenant, expiry, encrypted storage, reconnect,
storage constraint/revocation and audit-trigger rollback. Migration0010 applied ONLY to fresh
disposable test database (11 total/35 tables), not ordinary local/hosted DB. Previous source-only
notes are historical. See WHATSAPP_ONBOARDING_TEST_REPORT.md for exact bounds/pending cases.

TASK-032.2.2 fixed smoke test cwd assumption and added guarded APP_SMOKE_DATABASE_URL/
APP_SMOKE_REDIS_URL overrides for disposable targets. Early400 strict DTO fixture corrected.
Config/contracts/provider/API/observability/Web builds, registered lint, Worker typecheck,
schema/Drizzle metadata and format checks pass. No live Meta/account/billing mutation,
main DB/queues, Railway, commit/push/deploy or real key generation. Tests used synthetic keys.
TASK-032.3 real provider acceptance and032.4 extended matrices/pagination are pending, not
customer launch approval. Keep development mode unless owner manually configures approved
Meta app/domain and protected shared keyring; hosted migration/release still separately gated.

## Encrypted credential foundation — 2026-10-21

Owner approved encrypted PostgreSQL tokens/separate server key. TASK-032.2.1 / ADR-031:
canonical provider_credentials encrypted_token/storage CHECK, generated migration0010 (11th,
35 tables) and snapshot. No migration applied, key generated or record changed. Shared
ProviderCredentialCipher uses AES256GCM, random12-byte IV,16-byte tag, versioned key ID and
tenant/account/credential AAD. Validated optional server JSON keyring + active key ID; no default.
Ciphertext stays out of secret_ref; legacy references preserved. API/Worker share resolver
and API-exported SQL repository with existing pools, no new service/dependency/pool.
Internal persistence service authorizes Tenant Admin, locks account and writes encrypted
credential/audit atomically; signup may pass transaction for account+credential atomicity.
No public token upload endpoint or actual OAuth/Meta verification implemented yet.

Config/provider/API builds, Worker typecheck, schema35 and drizzle metadata checks pass.
Registered config/provider/API/Worker/observability lint and source format/diff checks pass;
no new tests authored/executed under owner's
combined foundation+secure signup checkpoint. Update migration-count fixtures there (11 now).
No local application/hosted DB, Railway, live Meta, Git commit/push or deployment changes.

TASK-032.2 signup remains pending partner-model clarification. Official Meta fbsamples
business-messaging-sample-tech-provider-app is accessible and demonstrates Tech Provider
business-token exchange; direct implementation/partner docs still429. Do not adopt sample's
framework/auth/logging/storage or optional registration/subscription/credit sharing blindly.
Recommend standard Tech Provider onboarding without agency credit-line sharing, ask owner
before wiring partner-specific flows or payment obligations. Agency identity decision remains
per-client Tenant Admin; Super Admin privacy unchanged. See WHATSAPP_ONBOARDING.md/ADR031.

Owner follow-up2026-10-21: TASK-032.1 foundation tests deferred to the combined secure signup
TASK-032.2 checkpoint. No separate tests now. Encrypted PG credential storage proposal still
requires explicit owner approval; this test-cadence answer does not approve schema changes.

## Configurable WhatsApp onboarding foundation — 2026-10-21

CLAR-071 / ADR-030 / TASK-032.1 implementation complete. Owner approved agency + client
onboarding with per-client Tenant Admin identities and unchanged Super Admin privacy.
WHATSAPP_ONBOARDING_MODE defaults development, accepts embedded_signup; optional numeric
META_EMBEDDED_SIGNUP_CONFIG_ID validated full/preview. GET /whatsapp/onboarding uses existing
tenant guards and returns only mode/availability/status. WhatsAppOnboardingService owns
policy; WhatsAppService denies manual connect outside development before writes. UI reads
API state, retains development form only when allowed; config missing/failure or pending
completion hides form. No SDK launch/callback, per-business storage or live Meta calls.

Config/contracts/API/Web builds and registered lint pass; Worker typecheck, schema35 and diff
checks pass. No automated tests created/run; pending foundation cases and fixture updates
recorded in TEST_PLAN, ask owner to run now or combine with completion. Previous test report
is historical evidence, not verification of this new behavior. No DB/container/Railway changes.

TASK-032.2 secure completion is awaiting credential persistence decision: existing canonical
provider_credentials is reference-only and shared resolver only accepts development env token.
Recommend encrypted PG credentials with separately held/versioned key, versus external vault;
owner approval/ADR/schema/migration required before implementation. Do not store ciphertext in
secret_ref or pretend env mode activates production. Meta direct implementation docs returned
429; official Postman accessible but contains partner-specific billing examples, not authority
to implement credit sharing or pick partner/token flow. See WHATSAPP_ONBOARDING.md.

## Storage-free preview expansion — 2026-10-21

TASK-082.4.6 / CLAR-070 / ADR-029: owner approved first-step authoring/reporting expansion
and local Docker testing. Existing preview now reuses tenant reports/bounded direct CSV,
development WhatsApp mapping/sync/disconnect, templates and campaign drafts/internal review.
Optional Meta settings validated; missing credentials fail on explicit sync. No S3/SMTP/scanner,
new dependencies/schema or new Railway processes. Campaign services block preflight and all
non-review commands before queued writes. Inbox/automation/imports/webhooks remain absent;
full mode unchanged. UI banner/navigation/controls reflect these boundaries.

Config10/10, focused feature unit29/29, disposable PG/Redis12/12 and mocked Chromium4/4 pass.
Config/API/Web builds and35-table schema check pass. Web needed network-enabled retry for
existing Geist font. See STORAGE_FREE_PREVIEW_TEST_REPORT.md for historical fixture failures,
expanded ad-hoc lint limitations and pending wider acceptance. No application DB/queues,
hosted migration, provider request, Railway write, commit/push/deployment performed.
Earlier0009 first-password release migration ordering still applies before hosted deployment.

## Desktop sidebar viewport anchoring fix — 2026-10-19

Owner screenshot showed the desktop sidebar scrolling upward and its white surface ending midway
through the viewport on the long platform audit page. TASK-086.5.8 reproduced the deployed pre-fix
behavior directly: at document scrollY 535 px the sticky sidebar rect moved from top 0 to -535 px
and ended at 438 px in a 974 px viewport. Desktop widths above 1024 px now use an explicit fixed
260 px sidebar bounded to the viewport with 100dvh height, independent vertical overflow and
contained overscroll; workspace content is pinned to grid column two. Existing <=1024 px drawer
positioning/transform behavior is unchanged. Prettier, web lint/typecheck and production build
pass, and the built CSS contains the scoped fixed/100dvh/grid-column rule. Railway still serves
the pre-fix bundle and the local browser had no authenticated session, so post-deploy/runtime
scroll confirmation remains pending. Automated suites remain deferred under CLAR-026.

## Tenant-role provisioning blocker repaired and verified — 2026-10-19

Owner approved TASK-082.4.5.3. PlatformService now orchestrates tenant creation,
TenantRoleProvisioningService (existing SeedRepository/catalog) to create tenant-owned
Admin/User roles/grants, then Admin/membership and audit in a single transaction.
PlatformRepository split into persistence-only createTenant/createTenantAdmin methods.
Team create/restore resolves its current tenant's active is_system TENANT_USER role.
No auth eligibility relaxation, new permissions, schema changes or existing role repairs.

Final runs:30/30 unit/auth regressions;11/11 real PG/Redis integration tests (10 scenarios
plus parent), including actual Admin/User provisioning-to-handover, exact catalog grants,
restore preserving false flag, foreign-role/current-token denial, missing-tenant lookup
denial and duplicate-email rollback of tenant/roles/grants;3/3 mocked Chromium tests.
API production compilation/full lint,35-table verifier and Drizzle metadata check pass.
Insights integration constructor fixture updated for new required DI; that separate
suite was not executed. TASK-082.4.5.2 retains wider deferred variants, not universal
coverage or launch approval. INITIAL_PASSWORD_TEST_REPORT.md is current evidence.
No Railway migration/deploy, local application DB changes or automatic account backfill.
The prior red suite and proposed approval entries below are historical checkpoints.

## Docker-backed password tests; provisioning blocker found — 2026-10-19

TASK-082.4.5.2 continued after owner started Docker. Dedicated PG16/Redis7 containers
on55439/56439, no existing application volumes.30 unit/auth regressions and3 mocked
Playwright cases pass. Seven real integration scenarios pass:9-to10 migration with
existing false flag/35 tables/idempotence; password hash/version/all-session revocation;
audit-failure rollback; overlapping login/refresh/change with three real advisory-lock
waiters; duplicate change; preview and full Nest HTTP guards/me/cookie/relogin.
The added eighth scenario FAILS: PlatformRepository.createTenantWithAdmin cannot find
global TENANT_ADMIN on fresh bootstrap state. Parent fails too (Node9 total/7pass/2fail).
Source inspection shows Team also resolves a global tenant role while existing login/
authorization demand tenant-scoped roles. Do not fabricate a global role as a workaround.
TASK-082.4.5.3 proposed for approval: provision tenant-scoped catalog roles/permissions
atomically and resolve Team role within current tenant; preserve isolation/eligibility.
No runtime fix or hosted migration performed. See INITIAL_PASSWORD_TEST_REPORT.md.
Earlier entries below describe prior checkpoints, not the latest test status.

## Password-change local tests started — 2026-10-19

Owner authorized deferred testing. TASK-082.4.5.2 in progress: new strict DTO and
service unit coverage, live-principal authorization gate coverage, existing auth
mock updated for shared lock/refresh-owner methods. Focused30/30 passed; API
compilation passed. No runtime source fixes required by these tests. Dedicated
`npm run test:password-change --prefix apps/api` retains the repeatable checkpoint.
Docker CLI reports missing engine pipe; no existing local/hosted database touched.
Real migration, rollback, PG/Redis concurrency, HTTP wiring and browser tests remain
pending, alongside earlier deferred bootstrap/preview/account/Templates acceptance.
Unit mocks are not evidence of atomicity, runtime wiring or production readiness.

## Initial-password handover implemented; migration rollout pending — 2026-10-19

CLAR-069 owner approved mandatory change plus revoke all sessions/fresh login. TASK-082.4.5
and required concurrency subtask. users.must_change_password default false added to canonical
070_users.sql, Drizzle schema and generated0009_initial_password_change migration/snapshot/
journal (10th migration,35 tables unchanged). New platform/Admin, Team User and tenant CLI
seed INSERTs true; Super Admin false; existing users and restored rows retain prior state.

AuthorizationRepository loads live flag; AuthorizationService blocks ordinary protected
requests with PASSWORD_CHANGE_REQUIRED, except explicit handler metadata for restricted
GET /me and new POST /auth/change-initial-password. /me pending returns empty permissions,
null tenant/subscription and own identity only. Refresh/logout allowed but never clear gate.
New auth/password-change Controller-Service-Repository verifies temporary password and
different strong replacement, rate limits, rechecks live principal/role/tenant/active owned
session and locked credentials, updates hash/flag/version, revokes all sessions and audits
atomically. Expire existing auth cookie, no replacement tokens; safe domain error mapping.
Passwords/hashes never in audit/error/response; logger new-password redaction keys added.

AuthRepository per-user advisory lock and explicit READ COMMITTED coordinate login, refresh
and password update; refresh resolves immutable session owner before acquiring lock/row
lock. This prevents stale old-credential session creation/rotation escaping revocation by
design; runtime race verification remains deferred. Web dedicated initial-password form
mounts before any workspace, uses existing API client, clears fields/token on success and
requires explicit fresh sign-in. Full/preview share behavior. ADR-028/guide and T082-PC01–07.

Static checks passed: API/Web lint/typecheck/production builds, contracts lint/build,
observability lint/typecheck/build, Worker typecheck, source/metadata format/diff,35-table
verifier and drizzle-kit check. Web build used approved network for existing Geist font.
No tests created/changed/run; old auth mocks/seed E2E fixtures need updates at test checkpoint.
Existing unrelated documentation edits preserved. No git commit/push, hosted migration,
deployment or account mutation. MUST arrange API pre-deploy node dist/database/migrate.js
before source push triggers Railway auto-deploy; new API authorization reads the new column.
Existing earlier approval applied9 migrations only, not this new migration. Ask owner to
authorize pre-deploy setup, then guide push/release. Do not rollback to a flag-ignoring API
with active pending users. Existing-account password reset/recovery and Meta flow not added.

## First-login password change reviewed; session handover choice pending — 2026-10-19

Owner approved mandatory change for newly created Tenant Admin/User accounts; existing
accounts unchanged. TASK-082.4.5 / CLAR-069. Read auth login/refresh/session, live authorization,
me response and platform/team account creation. No existing first-login state/change endpoint.
Need approved users schema flag (default false preserves existing users), new-account markers,
server-side restricted access and dedicated frontend password form. Reuse current hashing,
session handling, tenant guards and layered architecture. No implementation/schema/cloud
changes yet. Ask owner post-change policy: recommend revoke all sessions and sign in again;
alternative issue fresh session while revoking older ones. Tests remain deferred.

## DB-only preview administration enabled in source — 2026-10-19 / CLAR-068

Owner explicitly approved “do it” after screenshot showed Super Admin blocked despite DB-only
administration. TASK-082.4.4 / ADR-027 amends preview allowlist: existing PlatformController,
PlatformInsightsController, PlatformReportExportController and UserController plus only their
DB/auth providers shared across full and preview. No duplicate workflows or new infrastructure/
schema/dependency. PlatformService's existing insights dependency and bounded DB-only platform
CSV providers included; no tenant insights/exports/provider/storage/queue services enabled.

Super Admin now uses existing PlatformWorkspace with database-only banner: business/Admin
creation, status, existing plan/subscription APIs, manual billing, aggregate/metadata/audit and
bounded platform CSV. No new Super Admin creation/deletion features. Existing Tenant Admin
Team navigation and screen enabled outside full-only feature gate. Tenant Users still denied
management; current services/guards preserve tenant isolation, soft deletion, audits and
password rules. Platform remains metadata/aggregates only, never tenant Contacts/messages.
Imports/files, WhatsApp/templates/provider, campaigns/sending, Inbox, automation, webhooks,
workers and tenant reporting remain disabled. Full-mode registration set unchanged.

API/Web lint/typecheck/production builds passed, source formatting/diff clean and35-table
contract verified. First Web build failed fetching pre-existing Geist font under restricted
network; approved network retry passed without source/dependency change. No tests authored/
executed, cloud deploy, account/plan/payment mutation or seed. T082-AD01–04 remain pending.
Earlier working-tree documentation edits were preserved. Owner must commit/push implementation
before Railway can show these controls; no live UI acceptance claimed.

## Hosted migrations applied after bootstrap diagnosis — 2026-10-19

Owner reported BOOTSTRAP_UNAVAILABLE. Read-only PostgreSQL deploy logs confirmed
schema app does not exist on LOCK TABLE app.users. Owner explicitly approved existing
runtime migrations on this exact Railway test database. Connected through API service's
Railway Console, verified pwd=/app/apps/api, ran node dist/database/migrate.js once.
Console returned “Database migrations applied successfully.” Follow-up read-only pg metadata
queries confirmed35 app base tables and9 drizzle.__drizzle_migrations records. No reset,
seed, user creation, bootstrap POST, credential reading/entry, provider sends or tests.
Web/API/PG/Redis remain Online. Owner should retry their bootstrap privately, then remove
BOOTSTRAP_SECRET after success. Successful first-user creation/login is not yet verified.

## First-Super-Admin bootstrap implemented — 2026-10-19 / CLAR-067

Owner approved protected email/password POST only; account management deferred. New
apps/api/src/bootstrap controller/service/repository/types/DTO/domain error compose into
AuthModule core in full/preview. POST /api/v1/bootstrap/super-admin requires API-only optional
BOOTSTRAP_SECRET (minimum32), X-Bootstrap-Secret and existing Origin guard. Absent secret
disables calls. Existing logging omits body/headers, with explicit bootstrap redaction added.
Default display name Super Admin; response201 user_id/role only, no tokens/password/hash.

Service compares fixed-size secret digests timing-safely, applies existing Redis limiter with
isolated global bootstrap keys for secret holders and hashes via existing Argon2id before
transaction. Reuses SeedRepository/catalog: READ COMMITTED,5s local lock timeout, shared CLI
seed advisory lock, users SHARE ROW EXCLUSIVE barrier, existence including deleted users and
completion marker, exact platform-role permissions, one ACTIVE global user and atomic redacted
FIRST_SUPER_ADMIN_BOOTSTRAPPED audit. No tenant/membership/plan/test users. No schema/dependency
change. Dedicated domain errors map in HTTP controller; unknown persistence failures normalize
without credential-hash SQL/cause logs. RULES records the narrow all-user safety-query exception.

TASK-082.4.3 implementation complete; TASK-082.4.4 management revisit pending owner scope.
ADR-026/FIRST_SUPER_ADMIN_BOOTSTRAP guide and deferred T082-BS01–06 documented. npm API
lint/typecheck/build and config/observability lint/typecheck/build passed, source format/diff
clean, schema35-table contract verified. No tests written/run, no remote POST, cloud secret
entry/deploy/migration/seed or identity mutation. Changes are not committed/pushed. Hosted
preview remains previous541ef6d; bootstrap needs source push, migrations and temporary secret.

## Railway limited preview online; database bootstrap pending — 2026-10-19

Owner confirmed replacing both auth secrets. Applied31 prepared API/Web changes without
opening review secret values. Both Docker builds and deployments completed; Railway shows
Web/API/Postgres/Redis Online. Source is proxy commit541ef6d; API build deployment
83e94df6-bc83-41f5-b844-6374775ae4f5 and Web cbb9668d-0cd1-49a3-ac9e-67763f8d62ca.
Public Web URL: https://web-production-f2eee.up.railway.app. API remains unexposed/private;
Web private upstream and API public-origin references resolved. No PG/Redis settings changed.

Browser read-only smoke: public login page renders; unauthenticated GET /api/v1/me through
Web returns existing UNAUTHENTICATED envelope with request_id. Confirms private proxy routing
and unauthenticated denial, not logged-in roles/cookie rotation or complete auth acceptance.
No credentials read/entered, no migrations/seed/provider sends, no automated tests. Images
built on Railway using production packaging. Owner still needs to authorize migrations on
this exact test Postgres and supply bootstrap identities/passwords directly in Railway.
No existing data removed. Trial-only budget retained; no paid upgrade or capacity claim.

## Web public domain requested; apply paused for secret replacement — 2026-10-19

Owner approved Web-only public HTTPS domain. Clicked Generate Domain; Railway staged it as
“Public domain will be generated”, not an actual hostname yet. Added API WEB_PUBLIC_URL,
API_PUBLIC_URL and CORS_ALLOWED_ORIGINS using https plus web.RAILWAY_PUBLIC_DOMAIN references.
31 staged changes now: API13 variables/6 settings, Web4 variables/6 settings. Reviewed bundle
contains API/Web only; no PG/Redis changes. No Deploy Changes, migration or seed executed.

The Details panel unexpectedly expanded stored API secret values in tool output. Values
are not copied into docs or responses. Collapsed both sections and left masked API Variables
open. Owner must replace JWT_ACCESS_SECRET and REFRESH_TOKEN_PEPPER directly in Railway
before applying. Never expand API Details or emit raw review snapshots; filter observations
to non-sensitive headings/status. Domain request/origin configuration remain staged, not live.

## Railway Web staged, awaiting public-domain confirmation — 2026-10-19

Owner reports proxy code pushed; local clean HEAD541ef6d. In strong-spirit/production,
created staged Web service64a3b21a-78b3-4427-b824-50b242ede65b from existing repository main.
Renamed web, root stays repository root, Dockerfile builder uses infra/railway/Dockerfile.web,
Docker CMD retained (no custom start), health path /. Added only non-secret Web variables:
NODE_ENV=production, PORT=8080, NEXT_PUBLIC_API_URL=/api/v1, and API_PROXY_URL using Railway
references to api.RAILWAY_PRIVATE_DOMAIN and api.PORT. UI shows Web-to-API edge. No secrets
read/entered.27 changes staged: Web4 variables/5 settings plus API10 variables/6 settings;
PG/Redis Online, no bucket. No Deploy/apply/public-domain/migration/seed operation.
Next: action-time approval for Web-only public HTTPS domain, exact API origin settings,
review/apply and controlled migration/seed gates. API remains private. No tests run.

## Same-origin preview proxy implemented — 2026-10-19 / CLAR-066

Owner confirmed no custom domain and approved the proxy. TASK-082.4.2.2 / ADR-025 uses
built-in Next.js rewrites only for /api/v1 with fixed API_PROXY_URL, validated HTTPS/private
Railway HTTP target without URL credentials/query/fragment. Web NEXT_PUBLIC_API_URL=/api/v1;
both settings are build inputs and must also be present at startup. Config ships in lean
runtime package; Turbo cache keys include both values. No new dependencies/schema/backend
business logic or cookie weakening. API Origin/bearer/live tenancy checks remain unchanged.
Local/direct default routing remains unchanged with API_PROXY_URL unset. Keep trust-proxy 0
pending ingress validation; proxy IP rate-limit aggregation is still a hosting constraint.

Owner committed preceding preview as d6c4358. Read-only Railway check showed cleanup done:
PG/Redis Online, no bucket, only API10 variables/6 settings staged (17 changes total).
This proxy implementation made no cloud changes and is not yet committed/pushed/deployed.
Web service/domain and exact origin variables still need setup; migrations/seed and public
exposure need the appropriate authorization. Use trial credit only, no paid upgrade.

Static verification: npm contracts build, Web lint/typecheck, production build with proxy
settings and default/direct production build passed; config syntax, changed source/JSON
format and git diff checks passed. pnpm runner hit engine-store lock permission error;
used npm and installed binaries without dependency installation. No tests written/run.
T082-PV07 and Docker/runtime/hosted cookie/Origin/transport checks remain pending; prior
passing builds do not prove actual login, private DNS, packaging or production readiness.

## Preview tests deferred; deployment preparation requested — 2026-10-19

Owner explicitly declined focused preview tests and requested deploy process. T082-PV01–06
remain pending; no tests run. Begin read-only source/deployed settings checks, then guide
exact source push/runtime configuration and separately controlled migration/seed/domain gates.
No full launch/capacity/security readiness implied. Do not mistake previous static pass for
actual preview login/HTTP enforcement acceptance.

## Limited preview implemented — 2026-10-19 / TASK-082.4.2 / CLAR-065

Owner explicitly approved PG/Redis/API/Web preview with storage/mail/worker features disabled.
APP_MODE=preview API loader validates only actual core settings; full loader remains strict,
defaults to full and rejects preview (all Worker/Scheduler/replay entry points use it).
App/Auth module preview composes existing auth/me/Contacts/Groups guards/services/repos only;
no provider/storage/import/campaign/inbox/automation/report/admin/webhook feature services or
controllers. No schema/dependency change or stub/fake endpoints. /me optional deployment_mode
drives restricted browser nav/banner; Super Admin gets a limited notice/sign-out, never tenant
data. Full local .env unchanged. Auth cookies/origin/rate limits/tenancy remain existing logic.

Static verification: API/Web8 dependency builds passed; affected API/Web/Worker+shared packages
lint/typecheck25 tasks passed;35-table schema contract, changed-file formatting and diff checks
passed. No tests written/run; required owner phase-checkpoint question next, cases T082-PV01–06
in TEST_PLAN and task082.4.2.1. No runtime/database/cloud changes or provider calls. No commit
or push. New documentation RAILWAY_LIMITED_PREVIEW.md, ADR-024, preview variable template.
RAILWAY_CLEAN_SETUP.md and this memory had pre-existing owner-task edits preserved.
Hosting still needs exact pushed commit, core vars/migration/seed and same-site HTTPS auth
topology or separately approved proxy; cannot claim login/deployment verified from static checks.

## Owner reports full Railway deletion — 2026-10-19

Owner says all Railway resources deleted; prior project/service/bucket/domain state and
pending-change counts are historical, not current. No deletion performed by agent. Requested
complete manual re-add guide: RAILWAY_CLEAN_SETUP.md now sequences infrastructure first and
bucket apply before staging apps, all server/Web variables, build/start, auth-domain gate,
controlled migration/seed and separate worker/scheduler activation. Trial-only/no-upgrade
constraint unchanged. Full prepared layout exceeds trial5-service project limit; SMTP/scanner/
scheduler topology unresolved, not silently bypassed. No cloud provisioning or code changes.

## Tenant User account controls approved — CLAR-064 / TASK-086.6.8

Owner requested only deactivate/reactivate/soft-delete UI/API and explicitly deferred offered
automated and manual verification. Tenant Admin may target only a regular user in the current
tenant, never self/Admin/platform/foreign identities. State changes increment token version and
revoke sessions; delete also soft-deletes the membership, is repeat-idempotent without rewriting
evidence, and remains compatible with create-or-restore. Redacted transactional audit required.
Static/build verification only.

Implementation complete with `PATCH /api/v1/users/:userId/status` and
`DELETE /api/v1/users/:userId`. Both lock and resolve only a same-tenant system Tenant User and
derive authorization from the authenticated Tenant Admin. Status no-ops return without token,
session or audit mutation. Material status changes increment token version, revoke sessions and
audit. Delete disables/soft-deletes the user and active membership atomically, revokes sessions
and audits; a fully deleted repeat returns success without rewriting evidence. Team UI shows
permission-gated actions only on Tenant User rows, confirms destructive changes and prevents
duplicate clicks. Format, scoped lint, API/Web typecheck, schema verification, diff check and API/
Web production builds passed. Per owner direction, no automated test or manual browser/database
verification ran; T086-USR06–09 remain pending.

## Scoped create-or-restore approved — CLAR-063 / TASK-086.6.7

Owner approved automatic restoration only for User email, tenant Contact phone and tenant Group
name on their existing create commands. Active identity stays a conflict; one deleted match
restores the same UUID and clears all three deletion fields; ambiguous deleted matches fail.
User restore applies the new password, system Tenant User/current membership, ACTIVE status,
token-version increment and session revocation. Contact restore preserves all consent/opt-out/
suppression evidence and no deleted membership is revived. Group restore also leaves memberships
deleted. Distinct redacted restore audit required. No automatic restore for versioned, provider,
storage, tenant or operational/history entities. Tests are deferred to the phase checkpoint.

Implementation complete in the existing create services/repositories. Deleted natural-key rows
are selected explicitly with row locks and a two-row ambiguity bound. Restoration reuses the UUID,
clears all deletion evidence and records `TENANT_USER_RESTORED`, `CONTACT_RESTORED` or
`CONTACT_GROUP_RESTORED` in the same transaction. Contact restore preserves source and all consent/
history fields; neither Contact nor Group restore touches memberships. User restore rejects a
foreign home tenant, derives the system role, validates membership state, replaces the password,
increments token version and revokes active sessions. Bounded Drizzle cause inspection now keeps
Contact restore/create races on the stable duplicate conflict path. Format, scoped lint, API/
contracts typecheck, schema verification, diff check and API production build passed. No test files
changed, automated tests or database mutations run; T086-RST01–05 remain pending.

## Local account management approved — CLAR-062 / TASK-086.6.6

Owner confirmed Super Admin creates a business plus its initial Tenant Admin, while Tenant
Admin creates regular Tenant Users only inside that authenticated tenant. Approved local UI
and the missing tenant Team API. Initial passwords are entered by the creating admin and
shared outside the app; no email invitation or forced-reset lifecycle is claimed. Reuse the
existing atomic platform tenant endpoint and enforce Tenant Admin role, `user.read` /
`user.invite`, one-tenant membership, system Tenant User role and redacted audit server-side.
Automated coverage is pending the required phase checkpoint; static/build checks are allowed.

Implementation completed with `GET/POST /api/v1/users` for Tenant Admin and the existing
`GET/POST /api/v1/platform/tenants` for Super Admin. The new repository always selects the
system Tenant User role, derives tenant scope from authentication, creates user + membership +
redacted audit in one transaction, rejects duplicate active email safely and never returns a
hash. The platform parser now applies the same strong initial-password shape, rejects unknown
fields and validates IANA timezone input. Browser navigation adds **Businesses and admins** for
Super Admin and **Team** only for Tenant Admin. API/Web typecheck, scoped lint, schema verification,
format/diff checks and both production builds passed on 2026-10-18. Automated T086-USR01–05
remain pending; no tests or database mutations were run.

## Existing Meta app reuse confirmed — CLAR-061

Owner superseded separate-app recommendation: reuse existing local Meta development values
for initial Railway deployment. Name-only UI checks confirm META_APP_ID/SECRET/API_VERSION/
WEBHOOK_VERIFY_TOKEN on API and Worker (12 variable names each). No secret read/validation.
27 staged changes visible; RedisNew1Setting. S3/SMTP values still absent; these are required
by existing runtime validator even before uploads/email are exercised. No placeholder/local
service endpoints should be invented. No deploy, token, webhook or sending by agent.

## Railway manual configuration progress / CLAR-060 — 2026-10-18

Owner manually added PG/Redis and API/Worker database/runtime variables plus three distinct
application secrets shared correspondingly between server services. Name-only UI checks:
API/Worker each8 variable names present; values never revealed or validated. PGOnline,
RedisNew1Setting;19 pending changes at latest observation. Original15-staged snapshot is
historical, not current deployment state. No agent deployment executed. Owner chose separate
Meta development app for Railway; manual guide in META_DEVELOPMENT_APP_SETUP.md now records
isolation, server-only keys and no token/webhook/send activation. More runtime/storage/trial
topology prerequisites remain; do not claim configured-variable names prove valid credentials.

## Build-only checkpoint closed — 2026-10-18

Owner started Docker Desktop. Final image metadata inspection exit0 for Web/API/Worker:
all user=node, /app/apps/<app> workdirs, Web direct Next start bound0.0.0.0, API main.js,
Worker consumer.js. TASK-082.4.1.1 complete; supersedes earlier pending metadata status.
No application containers/cloud actions. Fifteen Railway changes remain unapplied and
backend prerequisites/trial layout/auth topology remain unresolved. Full staging not ready.

## Docker builds passed; final metadata check pending — 2026-10-18

All three local root-context Docker images built successfully, including production
packaging/export exit0. Web2/2, API7/7, Worker8/8 dependency tasks; original missing-module
failures absent. API/Worker image metadata verified non-root/direct Node entry points. Final
Web metadata/docs call was not executed due temporary approval-review usage failure. Owner
asked retry; permission review now succeeds, but Docker Desktop Linux engine is unavailable.
Docs saved now; final metadata recheck requires owner to start Docker Desktop. See
RAILWAY_BUILD_CHECK.md. No source/dependency fix, runtime processes, cloud apply or spend.
Web uses build-only invalid placeholder API URL. Railway15 changes remain staged/unapplied.

## Trial budget and provisioning gate — 2026-10-18 / CLAR-059

Owner confirmed remaining trial credit only/no paid upgrade. Verified dashboard Trial Plan
$5.00/30 days; no upgrade clicked. Official Railway free-trial docs state max5 services/project:
three current apps plus PG+Redis consume all slots, prepared scanner/mail/scheduler cannot
all fit current layout. Need scope decision before provisioning; don't disable safety gates
or invent service URLs. Fifteen staged deployment changes remain unapplied. Recommend close
Docker build-only verification first; local environment stays full functional test setup.

## Railway read-only prerequisite inventory — 2026-10-18

Owner asked to continue prerequisite review only. Architecture canvas shows exactly the
three existing GitHub application services; no PostgreSQL, Redis, scanner, SMTP sink or
scheduler service visible. This is environment-local evidence, not an inventory of unrelated
projects/external providers. Bucket availability not verified. API configured-variable panel
shows only staged PORT; Worker shows no configured application variables, only unadded
repository suggestions and Railway-provided variables. Never treat suggestions as saved config.
Required server variable groups verified against packages/config/src/environment-schema.ts
and infra/railway/staging.variables.example.json: database/Redis, auth secrets, production
encryption+Meta configuration, S3 and SMTP; scanner defaults must be replaced with real private
host for imports. No resources created, values entered or deployment triggered during review.
Next requires owner budget/provisioning decision and secret entry plan. Keep current15 changes
staged; generated domains alone do not prove runtime/auth readiness.

## Railway domains generated — 2026-10-18

Owner explicitly approved public domains for Web/API only. Created
whatsapp-platformweb-production.up.railway.app and
whatsapp-platformapi-production.up.railway.app, both target port8080. First attempted unverified
port action was blocked by safety review; inspected Dockerfile/Next direct start and Nest
listener/config to confirm both honor PORT, then staged explicit PORT=8080 per service before
domain generation. Set Web NEXT_PUBLIC_API_URL to the actual API HTTPS domain plus /api/v1.
15 changes now staged (previous12 build settings + two PORT + public API URL). No Deploy
Changes clicked, worker remains private, no new paid infrastructure or secrets entered.
API variable panel had suggestions rather than configured application values; backend
runtime/infra config still required before successful startup. Domain assignment is not proof
of working HTTP/authentication. Preserve strict cookies; Railway subdomains alone do not
verify same-site browser auth. Follow-up domain/auth topology must be reviewed before login.

## Railway build correction staged — 2026-10-18

Owner requested inspection of existing Chrome Railway project, then explicitly approved fixing
all three failures. Actual API/Web/Worker logs show app-only pnpm builds missing compiled
workspace packages (contracts/config/provider/API runtime), not a demonstrated account-limit
failure. Existing service settings used Railpack with root context and filtered app commands.
Staged four settings per service (12 total): DOCKERFILE builder, infra/railway/Dockerfile.web,
.api or .worker, empty custom build command, respective direct Node start commands from the
checked-in Dockerfiles. Verified staged change detail; NOT clicked Deploy Changes.
Blocker: Web variables panel shows only Railway-provided variables and unadded suggestions;
NEXT_PUBLIC_API_URL is not configured. API settings had no public domain. Do not add suggested
localhost/development defaults, invent an HTTPS endpoint or expose services without approval.
Project environment is named production, currently trial banner 30 days/$5 remaining. No new
resources, paid upgrades, variable secrets, migrations, seed or provider calls. Next resolve
domain/configuration choices, then apply and inspect builds/runtime under TASK-082.4.1.

## Templates and development setup checkpoint — 2026-10-18

CLAR-055 approved WhatsApp setup implementation: account list/health, fixed credential-reference
test-asset mapping and confirmed sync/local disconnect. CLAR-056 approved mocked tests now.
Final new browser suite 12/12; combined initial setup+Campaign/workspace/insights 36/36;
shared client 10/10. Frontend lint/typecheck/build passed. Two initial selector failures fixed
in tests only. No real provider calls or business writes. See SETUP_UI_TEST_REPORT.md for
coverage limits and WHATSAPP_SETUP_UI.md for permanent behavior. This supersedes the earlier
waiting-for-approval/testing status below. Manual populated UAT, additional edge coverage,
086.6.4 backend review and broader launch/admin gaps remain; not production certification.

## Templates first slice — 2026-10-18 / CLAR-054

Owner goal: recommended Templates→WhatsApp setup flow. Owner explicitly approved text-first
Marketing/Utility header/body/footer editor and synced templates read-only after source review
found update retains Meta status/ID (086.6.4 review pending, no backend fix silently applied).
Implemented features/templates typed client, compatible-component parser, local editor/live
preview, list/filter/saved preview and internal review/sync UI; workspace navigation/dirty
guards extended. Synced/unsupported content is view-only and never flattened. No submission,
schema/dependency/BE changes or real provider calls. All configured web lint (templates added),
typecheck/build/format passed. Browser owner tab signed out; requested Tenant Admin login.
No automated tests yet for Templates (separate from CLAR-053 Campaign checkpoint). Docs in
TEMPLATES_UI.md, cases in TEST_PLAN. Waiting on explicit next WhatsApp-development setup
scope question (fixed credential reference, no token input/Embedded Signup/live sends).
Goal remains active until recommended flow is implemented/verified within approved scope.

## Campaign automated checkpoint — 2026-10-18 / CLAR-053

Owner replied “sure” to run Campaigns tests now; interpretation stated before execution.
Updated campaigns.spec.ts for wizard/detail split and added preview/dirty/schedule/role/report/
CSV/responsive regressions with synthetic API fixtures. Final affected browser run26/26:
Campaigns20, workspace2, insights4 (20.7s). Shared client10/10; test formatting/diff passed.
First failures were scoped alert/mobile drawer fixture issues, corrected without weakened
assertions. Combined run exposed old Groups/member arrays and string role in workspace
fixtures; verified GroupService current envelopes, recorded086.7.2.1 and fixed fixtures only.
No production code/schema/dependency/provider/customer writes changed in this test pass.
Report: CAMPAIGN_UX_TEST_REPORT.md; T086-UX01–07 representative coverage passes, broad
variants remain partial and do not certify backend tenancy/provider/security or real sends.
TASK-086.7.2 closed as focused checkpoint, not customer-launch readiness. Templates UI still
requires separately scoped approval; no new feature implementation authorized by “sure”.

## Guided Campaigns implementation — 2026-10-18 / CLAR-052

Owner approved Campaigns-first UX redesign. Existing Campaign API/BE unchanged. Frontend
now separates list, five-step persistent draft form and saved lifecycle/report detail; adds
authorized text-only sample preview with cancellation, template placeholder hints, UTC picker
and truthful setup prerequisites. Existing untouched schedules keep exact instant/timezone;
edited ones explicitly use UTC. Same server approvals, preflight, quota/idempotency and sends.
Dirty-state callback to workspace guards navigation/sign-out; form guards close/reload/unload.
No dependencies/schema/real sends. Templates management remains separate, not implemented.
Focused format/lint/typecheck/production build passed, including final schedule/layout updates.
Owner signed into another local Chrome tab as Tenant User (not Admin). Visually inspected
list, wizard/template/recipients/schedule and missing-setup/preview states at375/768/1440;
document width did not exceed viewport, preview stacks at narrow widths. Restored viewport.
No account/templates present: populated preview/save/delivery/Admin controls not verified.
No credentials read/entered, records saved or external sends performed. T086-UX01–07 pending; automated suites and
test-file updates not run under optional checkpoint cadence. Historical test passes do not
certify this redesign. Web dev96875/APIdev45163 running for local visual review, no worker
started by this task. See CAMPAIGN_DRAFTS.md and CAMPAIGN_UX_PROPOSAL.md.

## Campaign UX reference review — 2026-10-18

Owner says UI is hard to understand and requests similar usability to Bonbell/Meridian
campaign tutorial. Chrome connection now available (browser3); visually inspected video
template library/editor/live preview, campaign recipient wizard and send-rate summary.
Current DESIGN retains CLAR-049/051 Geist/yellow compact system. Proposed 086.7 guided
campaign redesign reuses APIs; full scope is in CAMPAIGN_UX_PROPOSAL.md, awaiting approval.
No code changed. TemplateController has draft/create/update/internal approval/sync/preview
but no Submit-to-Meta endpoint; earlier broad backend-capability claims must not imply that
external submission exists. Template UI is a second slice needing component scope approval;
rate modes/cost/sheets/new submission are not silently added by a visual reference request.

## Railway-derived compact UI scale — 2026-10-17

Owner retained the current Geist and black/off-white/yellow direction but requested smaller,
application-like typography plus Railway's shape and spacing rhythm. Live `railway.com` computed
styles showed 14 px/20 px compact controls, 40 px desktop buttons with 12 px horizontal padding,
6 px button corners, common 8 px cards and repeating 8/12/16 px gaps; its 36–54 px marketing
headings were intentionally excluded. CLAR-051/TASK-086.5.7 applies a shared 14 px/20 px body and
control scale, restrained headings, 40 px desktop controls, 6/8/12 px control/card/panel radii,
compact forms/tables/navigation/cards and 8/12/16 px spacing. Geist, colors, workflows and
permissions are unchanged; pills/avatars stay circular and mobile controls keep 44 px touch
targets. Live authenticated platform rendering confirms Geist 14/20 body, 14/20 buttons at 40 px
with 6 px corners, 128 px cards with 16 px padding/8 px corners, 8 px toolbars, 12 px card grids,
a 64 px topbar and no horizontal overflow at 1280 px. Prettier, web/UI lint, typecheck and
production builds pass. Automated suites remain deferred under CLAR-026.

## Groups duplicate-name 500 fix — 2026-10-17

Owner reported `POST /api/v1/groups` returning 500. The Groups service intended to translate
PostgreSQL unique-constraint code `23505` to the approved `409 CONTACT_GROUP_NAME_EXISTS`
application error, but only inspected the outer error while Drizzle can wrap the database error in
standard `Error.cause` layers. TASK-086.5.6 now uses the repository's established bounded
four-level cause inspection for both Group create and update, without inspecting or exposing SQL
or parameters; unrelated database failures still reach the normal internal-error handler. Focused
Prettier, API lint, typecheck and production build pass. No tenant-authenticated local browser tab
was available for runtime replay, so owner retry remains the live confirmation. Wrapped-`23505`
create/update regression coverage is recorded as TASK-086.5.6.1 for the next owner-approved test
checkpoint under CLAR-026; no automated suites ran.

## Groups/Imports response-contract fix — 2026-10-17

Owner reproduced `groups.map is not a function` in Imports. Root cause: backend `/groups`
intentionally returns `{ groups: [...] }`, but GroupsScreen and ImportsScreen asserted the payload
was an array; group members similarly return `{ members: [...] }`. Updated both group-list
consumers and the member consumer to unwrap the established envelopes and defined a truthful
minimal GroupMember projection. Contact-import history was inspected and correctly remains a raw
array. No backend/API behavior changed. Focused format, web lint/typecheck and production build
pass. No tenant-authenticated local browser tab was available for agent runtime confirmation;
owner reload/retest remains. Automated suites remain deferred under CLAR-026.

## Portfolio-derived card/button geometry — 2026-10-17

Owner requested the live portfolio's card/button look and adjacent-action spacing while keeping
the approved app palette. CLAR-050/TASK-086.5.4 measured the live portfolio and applied square
editorial surfaces, 48 px standard buttons with 12×16 px padding/weight 700, 160 px dashboard
cards with 24 px padding, 14 px card-grid gaps and 12 px grouped-action gaps. Refresh/export
controls now use explicit shared toolbars instead of incidental inline spacing across platform,
overview, usage and billing views. Pills, avatars, navigation and quiet links remain intentional
exceptions. Live authenticated platform rendering and computed metrics confirm all target values;
format, web lint/typecheck and production build pass. No automated suites ran under CLAR-026.
Follow-up TASK-086.5.4.1 removed the remaining 10 px shared form-control radius after owner
spotted rounded inputs. The control token is now 0; live audit-form computed styles confirm 0 px
for input/select/fieldset at 48 px height, and textarea uses the same token. Focused static/build
checks pass.

## Three-reference UI refinement completed — 2026-10-17

Owner confirmed image-1 dashboard composition, image-2 black/off-white/yellow visual identity
and image-3 grouped fixed desktop sidebar/responsive drawer. CLAR-049/TASK-086.5.3 supersede
the earlier blue action palette. Existing tenant and platform shells now have grouped permission-
aware icon navigation, active state, bottom user controls, utility topbar and responsive drawer;
cards/forms/tables use the restrained dashboard treatment. Owner briefly selected Bebas Neue,
then supplied their live portfolio and requested its single-family approach. Final typography is
self-hosted Geist everywhere, using weight/scale/spacing for hierarchy. Browser inspection caught
and fixed an initial CSS-variable scope fallback to Times New Roman; computed styles now confirm
Geist for body, headings and navigation. Live authenticated platform dashboard, responsive card
layout and open/closed drawer were visually verified; the drawer breakpoint is 1024 px, horizontal
overflow is contained and backdrop hover remains neutral. Focused format, web lint/typecheck and
production build pass. No automated suites ran under CLAR-026.

## Existing UI visual-token refresh — 2026-10-17

Owner rejected the current UI and supplied a style-guide JSON as the visual direction.
CLAR-048/TASK-086.5.2 adopt the artifact as design data only: Roboto-first typography,
white/mist surfaces, ink/muted text, action blue, restrained shadows, larger radii and
controls, visible focus, compact motion and reduced-motion support. Product identity,
WhatsApp terminology, navigation, role/permission behavior, APIs and workflows are unchanged;
no source-brand copy or recruitment semantics were imported. Updated global styling for the
existing auth, workspace shell/navigation, forms, tables, dialogs, Contacts/Groups/Imports,
Inbox, Campaigns, Automations and reporting views, plus shared UI token exports and DESIGN.md.
Focused Prettier check, web lint, web typecheck and Next production build passed. No test files
changed and no automated suites ran under CLAR-026. Owner visual/manual walkthrough remains
pending under TASK-086.5; missing administration/setup/template screens remain TASK-086.6.

## Local app brought up — 2026-10-17

Owner started Docker. All data services healthy; read-only checks: 35 tables, applied9 /
committed9 migrations, one active account per system role, configured seed emails/role and
password hashes match. No credentials printed, migration/seed/reset or login writes made.
API dev session35164, web loopback dev50889 and worker dev39718 remain running. Web HTTP200;
API live/ready200 with DB/Redis up. Use localhost:3000 for CORS, not127.0.0.1 in browser.
Worker initially crashed InvalidClassScopeException: scoped PinoLogger retrieved by get.
TASK-086.5.1 recorded before fix; main.ts now await app.resolve(PinoLogger); actual restart
compiled0errors and logged worker_initialized. No business or dependency changes.
Focused worker lint, typecheck and build passed; git diff check passed. No test files or
automated suites added/run for this bootstrap fix; scoped startup regression coverage remains
pending at the next approved test checkpoint. Existing Docker images predate this source fix.
No campaigns/messages at preflight, development Meta token absent; no external sends done.
Owner walkthrough NOT RUN. LOCAL_MANUAL_WALKTHROUGH.md has private .env key references,
restart commands and role steps. Source inspection confirmed missing dedicated tenant team,
WhatsApp setup/template management and full platform account-management browser forms;
TASK-086.6 requires assessment/proposal/approval, not silently implemented. Earlier broad
feature-readiness claims do not certify these UI journeys. Real Meta remains separate.

## Owner-only local walkthrough preflight — 2026-10-17

Owner clarified no friends/sharing now: personally inspect all roles locally, Railway later;
then requested continuation. TASK-086.5 records the concrete local startup/manual work.
Read existing bootstrap/local-development docs; seed preserves passwords, never reset volumes
to recover access without separate destructive approval. Preflight (including elevated Docker
check) finds Docker Desktop Linux engine pipe missing; no listeners on 3000/4000/5432/6379.
No seed, migration, app/worker startup or external messages performed. Await owner starting
Docker Desktop, then inspect existing database/account/config state safely. Do not print .env
or credentials. Worker defaults enable message processing and scheduler, so do not blindly
run pnpm dev against possible queued work before checking safe provider/durable state.

## TASK-086 started — 2026-10-17

Owner asked to start launch verification while leaving other work for later. Prepared
docs/LAUNCH_VERIFICATION.md with start-vs-launch dependencies, existing local evidence,
NOT RUN deployed UAT matrix and focused owner inputs; TASK-086.2 complete, .3/.4 pending.
No new code, tests, cloud changes, Meta sends or launch approval. Existing local results
are reused, not relabeled deployed verification. TASK-082 staging, TASK-083 operational
controls, TASK-084 critical security/safety and provider readiness remain launch gates.
CI/post-MVP features/extended scale can remain deferred under recorded scope; initial
workload still requires verification. Next ask whether staging already exists/public URLs.

## Phase 8 local checkpoint in progress — 2026-10-17

Final checkpoint update: pnpm check passed (including all 33 Playwright tests), combined
reporting SQL/authenticated HTTP passed 7/7. All lean images built and artifact checks passed;
web production injected-PORT/HTTP smoke passed in a network-isolated container. All three
Trivy rescans completed with 1 critical / 60 high occurrences each, exit 1. Three fixable
findings are bundled npm paths; critical zlib1g is scanner will_not_fix. No suppressions or
app dependency/baseline upgrades. TASK-084.2.3 tracks remaining remediation/review; never
claim production ready. PHASE_8_LOCAL_REPORT.md supersedes pending statements below and
contains exact image identities, evidence and consolidated owner/cloud/Meta/launch gates.

CLAR-043 authorizes local phase tests, disposable-only recovery tooling and runbooks;
CLAR-044 approves local Trivy without Docker socket; CLAR-045 approves production-only
pnpm deployment artifacts and available Node 24/Debian security updates. No cloud,
live Meta, customer data changes or Git commit authorized. Remote 082–086 gates remain open.

Observed passes: reporting unit 12, disposable SQL 6, authenticated HTTP 1 (isolated),
worker readiness 5, shared client 10, reporting browser 4, recovery safety 2.
Recovery drill restored 35 app tables / 9 migrations / 2 synthetic marker rows and
verified a primary key; both invocation-created databases were removed. Runbook added.
Full checkpoint still needs rerun after test lint corrections. Initial combined HTTP/SQL
run hit startup timeout under concurrent builds; isolated HTTP passed, combined rerun pending.
Actual SQL uncovered Drizzle wrapping PG 23505 in cause: bounded cause inspection now
preserves intended duplicate-payment conflict; SQL retest passed.

Original full-workspace images built successfully but Trivy API scan found high/critical
OS and unnecessary build-tool packages. Initial report is ignored .local/phase8/reports/api-initial.json.
Production dependency audit passed its high threshold (one moderate); all-dependency
audit still reports a high braces toolchain advisory. Do not call scans clean.
Lean packaging edits now use pnpm deploy --prod --legacy and package files allowlists;
API migrations and existing runtime paths/start commands preserved. Rebuilds/rescans pending.
Local deploy probe affected dependency install mode: restored with frozen --prod=false;
no lockfile change. Do not mark phase complete before final evidence and remote checklist.

## TASK-082 repository preparation — 2026-10-16 (CLAR-042)

Owner said “sure start” to repo-only preparation/manual staging guide; no project/domain/
budget supplied. TASK-082 remains open for 082.4 cloud/owner work, not marked deployed.
Added root-context Dockerfiles for web/API/worker (scheduler uses worker artifact), a
secret-excluding .dockerignore, manual service-settings JSON and placeholder variable JSON.
These are not provisioning programs or Railway native apply files. No new SDK/dependency.
Non-root Node 24 runtime and pnpm11.25 frozen workspace/dependency-ordered builds. Runtime
uses direct Node, including compiled API migration/seed commands; no global pnpm assumed in
runtime and no automatic migration/seed on startup. Web reads injected PORT and receives only
the public API URL at build time; Turbo now includes NEXT_PUBLIC_API_URL in the build key.

consumer.ts uses WorkerModule with campaign scheduling disabled and private health enabled;
local main.ts stays combined. scheduler.ts loads existing CampaignRuntimeModule and timer
plus health/logging/lifecycle, not job consumers/provider delivery. Existing relays, automation
recovery and import retention stay with consumers. Separate scheduler enable token preserves
old preflight-disabled module behavior by default. Timer drains in beforeApplicationShutdown
before database shutdown hooks; replacement still needs stop-before-start/verified singleton
operations, not merely replicas=1. No leader-election or alternate execution path added.

Private health transport/controller -> service -> PG repository plus existing queue adapter;
no customer queries. SELECT 1 / Redis PING, coalesced five-second checks, three-second query
timeout and five-second pool connection timeout. Scheduler has a max-1 readiness PG pool
besides its runtime pool and one readiness queue connection with explicit close. Installed
library inspection corrected initial type failures: BullMQ6 uses getBackend().client.runCommand
and pg supports per-query query_timeout although @types declares it only in ClientConfig;
an explicit intersection retains type safety. Health returns service/status only, not proof
of migrations, progress, scanner/bucket or successful sends.

RAILWAY_STAGING_GUIDE.md documents isolated private dependencies (including existing ClamAV
and private Mailpit sink), issued HTTPS bucket endpoint, same-site Secure/Strict auth domains,
exact CORS/proxy trust verification, pool budgeting, controlled migration/seed, immutable
commit/digests, private worker/scheduler endpoints and owner-approved spending limits. Domain,
project/region, alert recipient/amount and hard cap remain unchosen; no current price claimed.
Do not apply workspace limits affecting other projects without permission.

Verification: final `pnpm exec turbo run lint typecheck build` passed all 30 tasks; schema
contract passed 35 unchanged tables; format/diff passed. Docker engine29.8.2 build --check
passed API/worker/web with no warnings; this only validates Dockerfile/static configuration,
not full Linux builds, installed dependencies, runtime networking, health or deployed behavior.
No tests/test files, actual images/application containers started, database/seed operations,
Railway login/provisioning/deployment/secret changes, Git commit or Meta calls. T082-01–08
remain deferred. Actual staging setup, cost configuration and runtime evidence are pending
082.4 with explicit owner choices/authorization; do not move parent to complete based on
local checks. TASK-083/084/085/086 readiness gates remain unchanged.

## TASK-081 implementation complete — 2026-10-16 (CLAR-041 / ADR-023)

Owner approved bounded direct CSV exports rather than large async export infrastructure.
Tenant/platform POST report endpoints reuse existing insights/campaign read services and
live auth. Platform service cannot reach tenant recipient content. New tenant-only recipient
repository selects active Contact phone/ID, delivery status, redacted code and timestamps,
with campaign/tenant/message relationship predicates; no variables/content/provider payloads.
Campaign summary requires campaign.read/export; recipients additionally contact.read/export.
Other reports retain existing read permissions. No grants, new schema or dependencies.

Serializer limits 10,000 data rows / 10 MiB including encoding/escaping/BOM/CRLF, quotes all
cells and neutralizes formula prefixes including hidden whitespace/control/format characters.
Overflow fails REPORT_EXPORT_TOO_LARGE/422 without truncation. Payment/audit export calls
existing read services with server-owned bounded limit and checks nextCursor; exports cover
full bounded matching sets, not visible pages. Payment exports strip notes for all roles.
CSV preparation audit precedes response; audit failure blocks download. No stored files or
signed/public links. Raw response follows existing webhook response-ownership pattern without
changing global JSON envelopes. Errors retain envelopes, success uses no-store CSV attachment.

Shared browser request core now accepts a response reader so Blob downloads retain exactly
the JSON client's refresh coalescing, late-401 and session-generation checks. Export controls
mount in overview/usage/payment/audit/campaign reports and separate platform metadata views.
Keyed filter/target changes/unmount abort obsolete downloads; busy guard, error/retry, PII
confirmation, temporary Blob URL cleanup and download-requested notice implemented.

Final static/build rerun passed all 30 tasks after TASK-081.4's source-review correction:
platform preparation audit remains platform-owned; targetTenantId is identifier-only metadata,
not a foreign-key owner derived from an arbitrary audit filter. T081-08 runtime remains pending.
`pnpm schema:verify` passed 35 unchanged tables; `pnpm format:check` and `git diff --check`
passed. No test files changed, no
automated tests, runtime SQL/API/download checks, live sends, migration, payment operation,
deployment or Git commit. T081-01–10 remain pending; historical Phase 7 results do not verify
this implementation or changed shared auth client. See REPORT_EXPORTS.md for fields, limits,
snapshot/deleted-Contact count differences and rollout limitations. Large async exports need
separate approval. Next sequential task is TASK-082 Railway staging; no deployment authorized
by TASK-081, and capacity/security/launch verification remains TASK-084/085/086.

## TASK-080 implementation complete — 2026-10-16 (CLAR-040)

Owner approved the seven recommended reporting/billing/audit decisions. Implemented strict
Controller-Service-Repository tenant dashboard, usage, payment history and audit reads;
separate Super Admin aggregate/metadata repository/services; extended existing platform
dashboard and reused manual-payment API. Shared SQL fragments contain only approved read
projections, no customer payload access for platform views. Added browser-safe insight
contracts and permission-aware Overview/Usage/Billing/Audit screens plus separate platform
workspace, selected-business metadata and confirmed manual-payment form. Super Admin never
mounts tenant Contacts/Inbox screens. No permissions are granted implicitly.

UTC-month ledger reservations remain distinct from message current-status counts and money;
overlapping eligible subscriptions flag ambiguity rather than silently selecting an allowance.
Tenant payment SELECT omits operational notes; platform retains them. Money stays in original
minor units/currency, no mixed totals/Meta pricing/invoice/balance inference. Payment recording
does not activate/extend a subscription. Related 080.2.1 validates/locks a non-deleted selected
business inside the existing audited payment transaction, while permitting suspended business
records. Active Admin dashboard count now requires non-deleted role/tenant and active matching
membership. Audit emits safe summary fields only, with 30-day default / 90-day max range and
timestamp+UUID pagination. Query changes/unmount abort browser reads; stale scopes are hidden.

Final `pnpm exec turbo run lint typecheck build` passed all 30 tasks. `pnpm schema:verify`
passed 35 unchanged tables. Initial mapped-row typing, narrowed-role comparisons and strict
FormData lint issues were corrected without weakening rules. Formatting/diff checks follow
the documentation update. No test files created/updated, automated tests run, runtime SQL/API/
browser verification, new dependencies, migrations, schema application, gateway/Meta requests,
customer-data mutation or Git commit for TASK-080. Prior Phase 7 PASS is historical, not
TASK-080 acceptance. T080-01–10 remain pending at the owner-approved phase checkpoint.

See ESSENTIAL_REPORTING.md for implemented routes, metric definitions and limitations.
Next sequential implementation task is TASK-081 exports; not started or approved by this
handoff. Full tenant/plan-management UI, gateway, advanced charts and launch readiness remain
outside TASK-080. Existing broader workspace lint debt TASK-067 remains; new insights feature
files are included in configured lint and workspace integration is typechecked/built.

## TASK-075 local checkpoint complete — 2026-10-16

This supersedes older in-progress checkpoints below. Owner explicitly approved TASK-075.4.
Final API automation integration suite passes 10 cases: full authenticated >100 KB valid
30-node graph save/read/publish, revision/publication races and eight runtime/concurrency
cases plus rollback authoring. Worker automation integration passes 3 cases: SQL exhausted-
event concurrent-once replay, audit rollback/no handed-off-run resurrection, four controlled
pause/takeover-vs-SENDING orderings, and isolated Redis retries/exhaustion. API test fixture
optionally supplies its exact local disposable pool/URL for worker test-only reuse.

Full `pnpm check` passed after all code/test changes: 35-table schema, formatting, configured
lint/typecheck, registered unit/client suites, production builds and all 29 Chromium cases
(5 automation, 16 Inbox, 8 existing other flows). Separate SQL/Redis integration results are
not implied by pnpm check; they were explicitly run. New scripts retain these suites.

Actual defect fixed under TASK-075.4.1: raw Express body-size Error was mapped to 500 by
the shared API mapper. Exact Error + entity.too.large + 413 now returns the existing safe
PAYLOAD_TOO_LARGE envelope; arbitrary status-bearing errors retain INTERNAL_ERROR. Full HTTP
and 2 unit security cases pass. No parser limit, webhook byte handling, schema or dependency
change. Browser happy-path test selector corrected to match the named account combobox.

TASK-075 is complete for approved local scope, not production certification. Remaining
exhaustive branch/race permutations, crash/outage/month-rollover, live Meta, deployed security/
capacity and customer launch acceptance remain existing TASK-084/085/086. No ordinary delivery
worker, customer cleanup, Git staging/commit or live send. Only exact disposable fixture DBs
and unique Redis test keys were cleaned; no application data was removed. Next core feature
is TASK-080 and requires the owner's direction; not started.

## TASK-075.2/075.3 continuation — 2026-10-16

Owner approved continuing runtime/concurrency and queue/browser testing. Added seven passing
PostgreSQL runtime cases with real independent connections in validated disposable
automation_test_<UUID hex> databases. Cover all eight nodes, duplicate trigger/advance/choice,
immutable-version pinning after new publication, text acceptance ordering, early-choice
receipt rollback/retry, stale context/active keywords, ten-step yield/replay, plan/publisher/
consent/window changes, LIST expiry, STOP/unexpected-text handoff, permanent failure/quota,
ambiguous SENDING and takeover race/no automatic resume. No actual delivery provider exists
in these fixture processes; acceptance is simulated by explicit test SQL.

Three relay unit cases and one real local Redis/BullMQ test pass: durable identity rejection
on process/exhaustion, redacted logs, publication failure release, deterministic event IDs,
distinct continuations, retry recovery and five-attempt exhaustion. Redis cleanup is scoped
to an exact unique test prefix. Provider suite passes five fake-fetch cases including both
interactive payloads. Worker delivery suite now passes 22 cases including automation gates.
Automation Chromium four cases and existing Inbox fifteen pass; API Inbox SQL nine pass.
New unit cases are registered in ordinary API/worker test scripts; SQL/Redis suites remain
explicit commands. All 30 static/build tasks passed before the last delivery-test addition;
full pnpm check passed after all test additions: schema, formatting, lint/typecheck,
registered unit/client suites, builds and all 27 Chromium cases. API now runs 62 tests;
worker ordinary suite includes 22 existing/delivery plus 3 relay cases. Separate SQL/Redis
results and remaining acceptance boundaries are in PHASE_7_TEST_REPORT.md.

No production defect established: corrected new-test status DISABLED, control signature and
ambiguous Next route-announcer selectors; strict lint fixed without rule suppression.
TASK-075 remains open for TASK-075.4 (authenticated large valid graph, SQL replay/rollback,
publication/dispatch-claim races). No live Meta, ordinary delivery worker, schema change,
customer cleanup, Git commit or production-readiness claim. No additional approval is needed
to continue these already-approved local acceptance checks.

## TASK-075 local testing checkpoint — 2026-10-16

Owner explicitly approved local test creation/execution. TASK-075 remains in progress;
see PHASE_7_TEST_REPORT.md for exact scope/results and remaining acceptance. Added 7 pure/
transport tests and one rollback-only local PostgreSQL case covering authoring history,
revisions, tenant isolation, simulation purity, persisted keyword/duplicate receipt,
version pinning and explicit takeover/allow cancellation without replay. All pass.
Existing API tests pass 55, worker tests 21, Inbox/webhook SQL tests 8. The initial SQL
assertion used the wrong error code; corrected and rerun. No production defect identified.
Independent automation races, full runtime/delivery/recovery and browser coverage remain
pending. Parser harness is not a full authenticated large-graph save. No live Meta sends,
ordinary delivery worker, schema changes or Git commit. Earlier handoff's request to ask
for testing approval is superseded by this explicit owner approval.

## Phase 7 implementation handoff — 2026-10-16

TASK-070–074 implementation is complete under CLAR-038/039. Earlier in-progress entries below
are historical checkpoints. Added strict-layered automation API/repositories/runtime, retained
immutable versions, exact keyword/current-choice triggers, all eight approved nodes, a form
editor/readable preview/history and pure no-send simulation. Reused common policy/quota/outbox/
delivery/provider infrastructure, including neutral buttons/lists; no new workflow engine,
table, migration or infrastructure. See BASIC_AUTOMATION.md and ADR-022 for contracts/ownership.

Admin publication/pause/reactivation, publisher live membership/permission, automation_enabled,
tenant/account/consent/window/quota gates remain server-side. Explicit Inbox takeover blocks
unclaimed bot sends; accepted requests may finish. Allow enables future triggers only and
cancels the old run. Audit watermark uses decision clock time after locking, not transaction
start. Active entry keywords/stale choices are ignored while waiting; other unexpected text
hands off. Permanent failures expose safe reasons. Receipts cover unmatched inbound and
continuation events; failure paths re-resolve persisted job identity as well. Operator replay
uses service-owned transactions and never starts consumers or resends ambiguous acceptance.

CLAR-039 explicitly approved the automation-only 2 MB parser and direct Express 5.2.1 /
@types/express 5.0.6 declarations (both already transitive). Offline installation downloaded
nothing and left other dependency versions unchanged. The named wrapper preserves Nest's
ordinary/raw-body parser registration. HTTP limit/signature behavior is still untested.

Final verification: pnpm schema:verify passed (35 tables); pnpm exec turbo run lint typecheck
build passed all 30 tasks; pnpm format:check and git diff --check passed. Initial strict-lint /
type/format failures were corrected, not bypassed. No automated tests or test-file changes,
provider/network sends, schema application, queue purge, customer-data cleanup or Git commit.

TASK-075 is pending: ask whether to create/run local unit, SQL/Redis/queue, security/provider-
double and Playwright acceptance/regression tests now or defer. Existing Inbox/webhook doubles
need approved updates for the new automation effects. Prior phase PASS does not verify this
implementation. Live Meta, deployment/outage/scale and production readiness remain separately
authorized/unverified. Do not claim Phase 7 acceptance or production readiness from static checks.
TASK-080 is the next core feature only after separate owner direction; it has not started.

TASK-072/073 checkpoint: inbound atomic outbox and protected Message receipt, exact keyword /
current-message correlated choice triggers, immutable-version runtime and all eight nodes are
wired through the server-only automation-runtime export and identifier-only BullMQ transport.
Run advancement receipt is atomic in outbox payload metadata. Common composer/provider/worker
now supports neutral BUTTONS/LIST with automation provenance and live publisher/ownership gates.
Ordered text waits for provider acceptance; at most 10 immediate nodes per transaction, durable
continuations and window deadlines. Failures hand off safely; transport exhaustion retains an
operator-replayable event. Private automation:replay added; existing maintenance CLIs explicitly
disable automation and campaign processing. ADR-022 records reuse and lock order. No new table,
dependency, test file or test execution. API/worker/provider static/build gate passed 14 tasks.
TASK-074 is active (explicit takeover/allow, pause/reactivate, safe Inbox runtime status).

TASK-071 authoring checkpoint: strict parsers, pure graph validation/simulation and thin
Controller -> AutomationService -> AutomationRepository route path; existing permissions,
Admin-only exact-revision publication, account-scoped keyword uniqueness, immutable published
snapshots. UI adds form steps/branches, preview, version history, no-send simulation and paged
account/team options. Type/build passed; strict lint findings corrected (React SyntheticEvent,
safe unknown handling, void handlers and explicit safe DTO projection); lint passed separately.
No tests or live provider calls. TASK-072 active. Its duplicate-event receipt uses protected
inbound Message policy metadata in the same transaction as trigger resolution, preventing old
unmatched messages from starting flows on replay without adding a table/retention decision.

TASK-070 persistence checkpoint: added browser-safe contracts, AutomationRepository and
AutomationRunRepository using the existing five tables/JSON columns. Tenant and active-parent
predicates, locked flow/run mutations, same-version node checks, append-only draft snapshots
and retained published history; no hard delete or migration. API/contracts lint/typecheck/build
passed 11 tasks. Runtime/SQL acceptance remains pending TASK-075; no tests/provider calls run.
TASK-071 is now active (draft validation, publication, simulator and form editor).

Phase 7 approved 2026-10-16 (CLAR-038): implement TASK-070–074 sequentially, including
form-based editor/simulator and Inbox takeover controls. BASIC_AUTOMATION.md records all nine
approved decisions and node/runtime limits. TASK-070 is active; five tables already exist.
TASK-075 requires a separate phase-end testing decision; no live Meta/send authorization.
No clarification is required for the approved branches. New material uncertainty still pauses
only the affected work. Preserve existing changes and do not commit automatically.

TASK-065.3 follow-up (2026-10-16): owner explicitly approved local remaining Inbox tests,
including concurrency and polling/error recovery; live Meta testing remains separately
authorized. Expanded suites pass API/PostgreSQL 9 cases, worker/PostgreSQL 8 cases and
Inbox Playwright 15 cases. Added seven isolated API-client tests to the root test command.
Independent-connection races use local disposable inbox_test_<UUID hex> databases with
reviewed migrations, exact-name cleanup and no customer fixtures. Real child API checks
cover live sessions/role downgrade, Super Admin denial, tenant injection and deleted history;
no delivery worker is started. Ordinary SQL cases still use rollback/savepoint fixtures.

Coverage now includes duplicate replies/notes/inbound STOP, close/read serialization,
audit/completion/outbox rollback, timestamp variants/order, active replacement/replay,
template approval/quota/actor keys, pagination ties/inactive authors, Message/recipient READ,
polling 30/60-second recovery, offline/reconnect/coalescing, terminal auth clearing, stale
selection/unmount, notes/team pagination and login/logout generations. No production feature,
schema, policy or dependency changed. See PHASE_6_TEST_REPORT.md for exact boundaries.
Cross-tab coordination, exhaustive permutations/stress and deployed provider end-to-end
acceptance remain explicit TASK-084/085/086 work, not verified or implicitly authorized.
Final `pnpm check` passed: schema contract, formatting, configured lint, typecheck, unit/client
suites, builds and all 23 Chromium cases. TASK-065.3 is complete for its approved local scope;
TASK-065 retains partial status for the separately tracked broader phase/launch acceptance.
Next core feature remains TASK-070; it has not been started. No commit performed.

TASK-066 implemented 2026-10-16 under approved CLAR-036: tenant Inbox navigation, desktop
list/detail and mobile drill-in, search/filter/cursor history, explicit read/unread/close/reopen,
TEXT/eligible TEMPLATE replies, assignment and append-only notes. Mounted existing keyed
polling; drafts/retry keys stay in memory per conversation while Inbox is mounted. Added
minimal active-tenant assignee options through existing repository/service/controller layers.
No schema/dependency change. See INBOX_UI.md.

Owner-authorized TASK-065 local testing follows implementation. New PostgreSQL suites cover
Inbox services (6 passing cases) and inbound/status effects (3 passing cases); Playwright
Inbox flows pass 7 cases against API doubles. Fixed actual DELIVERED-to-READ SQL progression
and late-failure metadata in messages/recipients, plus dynamic form-label accessibility.
Existing composer/webhook doubles now match current interfaces. Full results and remaining
acceptance gaps are recorded in PHASE_6_TEST_REPORT.md; these are not production certification.
TASK-067 tracks pre-existing workspace lint debt discovered by a wider lint trial; no rules
disabled. New Inbox files and shared client are linted; workspace integration is typechecked.
Historical task entries below describe their original implementation checkpoints, not the
current UI/testing state. No live Meta send or customer data used.

TASK-064 foundation completed 2026-10-16 under approved CLAR-035 / ADR-021. Added typed Inbox
API access and useInboxRefresh: visible/online 15-second-after-completion GETs, coalesced
triggers, focus/reconnect/manual refresh, abort/stale-key guards, transient 30/60-second
backoff and terminal-error stop. Protected data clears on 401/403. TASK-066 must mount it;
no actual Inbox UI freshness is claimed. No push service, dependency or schema added.

Shared client changes: same-runtime single-flight token rotation, newer-token reuse for
late 401s, token clearing on refresh failure and login/logout-generation response guards.
Login/logout wait for existing rotation; logout uses the existing cookie-authenticated route.
Expanded Inbox/client lint exposed and fixed the prior HeadersInit spread bug. This is not
cross-tab authentication coordination; review that boundary under TASK-065/084.

Web lint/typecheck/build passed all 4 tasks including dependency build; formatting and diff
checks passed. No test files changed, automated tests run or live provider calls. T064-01–10
remain pending for TASK-065. See INBOX_REFRESH.md. Next: TASK-066 Inbox UI, with design/
assignee-selection approval still required; phase tests follow UI implementation.

TASK-063 implementation completed 2026-10-16 under approved CLAR-034. Added internal
assignment/unassignment and separately paginated append-only note APIs in a dedicated
Controller-Service-Repository path. Reused existing schema, permissions and active same-tenant
member validator. All statuses permit internal work without reopen/handoff/send. Note UUIDs
deduplicate exact author/conversation/text retries; conflicting reuse returns a generic error.
State/note and redacted audit commit together, without note text in metadata. Assignment
does not grant/restrict access; neither operation changes unread/window/automation or sends.

Formatting and API/contracts lint/typecheck/build passed all 11 tasks including dependencies;
git diff checks passed. No migrations, dependencies, test changes/execution or live Meta calls.
T063-01–08 remain pending under TASK-065; see INBOX_COLLABORATION.md. Next task: TASK-064,
transport/polling decision not yet implemented. Recorded TASK-066 for the missing Shared Inbox
frontend before Phase 6 UI/E2E closure; its design and implementation need owner approval.

TASK-062 implementation completed 2026-10-16 under approved CLAR-033. Added backend POST
/conversations/{id}/messages via strict parser, thin controller and DI ConversationReplyService.
Requires conversation.read/reply; server resolves targets and hashes actor/client keys into
an inbox namespace. Existing MessagingService owns policy/quota/audit/outbox and delivery.
New replies require OPEN/PENDING and NONE/PAUSED/HANDED_OFF, checked under a Conversation
lock after common message-key/quota locks. Reopen/handoff-required blocks persist normal
FAILED/audit evidence without quota/outbox. Existing accepted key replay precedes new-reply
state checks, so later close does not duplicate/cancel the accepted message. Accepted new
replies update last activity atomically, preserving unread/window/status/automation.

Formatting and API/contracts lint/typecheck/build passed all 11 tasks including dependencies;
git diff checks passed. No test files changed, automated tests run, live provider calls,
schema/migration/dependency changes or UI. T062-01–09 and existing common INBOX composer
test-double updates remain pending under TASK-065. See INBOX_REPLIES.md. Next: TASK-063,
assignment and internal notes; not started. TASK-074 still owns full handoff/automation
ownership coordination with queued/in-flight messages.

TASK-061 implementation completed 2026-10-16 after owner approval of CLAR-032. Added strict
Controller-Service-Repository `/conversations` listing, paginated history, literal name/phone
search, status/account/unread filters and explicit read/unread/close/reopen APIs. Reused the
existing schema and conversation.read/close permissions; Super Admin remains denied and
deleted Contact history is hidden. GET is read-only; shared read acknowledgement validates
the displayed message boundary and preserves later unread increments. Close/reopen changes
status only. State changes and redacted audit are atomic; no-op repeats do not audit again.

API/contracts lint/typecheck/build passed all 11 tasks including dependencies; formatting
and git diff checks passed. No test files changed or automated tests run; T061-01–09 remain
pending under TASK-065. No migration, new dependency, live provider call or UI. Shared
contracts live in packages/contracts/src/conversations.ts; API behavior is in INBOX_API.md.
Next core task: TASK-062, authorized agent reply through the common messaging service.

## Current delivery priority — 2026-10-15 (CLAR-030)

TASK-060 implementation completed on 2026-10-16 under approved CLAR-031. Reused TASK-036's
existing path; service now owns transaction/policy orchestration while the repository alone
executes SQL. Deleted-only sender identities fail with INBOUND_CONTACT_REVIEW_REQUIRED;
invalid/missing inbound timestamps fail with INBOUND_TIMESTAMP_INVALID. Existing FAILED/DEAD
and private replay tooling retains the event for review; there is no automatic Contact
restoration/recreation, timestamp substitution, new review UI or schema/state extension.
An event failure rolls back all sibling effects. Account/phone routing and status effects
are tenant/account checked; duplicate inbound IDs skip profile/unread/STOP mutations.

Worker lint/typecheck/build passed all 10 tasks including dependencies; formatting and
git diff checks passed. No test files changed, automated tests run, live Meta calls or
migrations. T060-01–09 and existing webhook-double updates are pending for TASK-065.
Implementation completion is not runtime acceptance verification. See
INBOX_INBOUND_RESOLUTION.md. Next core task: TASK-061; it has not started.

The owner approved correcting over-deep engineering: prioritize the usable end-to-end MVP.
Follow `MVP_DELIVERY_PRIORITIES.md`. Keep the approved Next.js/NestJS/Drizzle/PostgreSQL/
Redis/BullMQ/Railway stack, strict layering and all safety/business invariants; do not
redesign working foundations or add speculative infrastructure/features.

Next core work is TASK-060 and the inbox slice, then existing basic automation and essential
reporting/admin workflows. Inspect existing TASK-036 resolution and existing usage/billing
services before implementing gaps. Basic automation remains in scope; saved segments
(TASK-058) and advanced features stay post-MVP. No new code task is started by this update.

Phase 5 local tests passed; TASK-056 is now pending rather than the active blocker.
Its PARTIAL results remain unchanged. Critical remaining safety/user-flow checks must close
through TASK-056.3 + TASK-084/086 before customer use; exhaustive scale/outage/race stress
belongs to TASK-085 before relevant workload expansion. TASK-057 stays required before
production delivery. Validate the full application using Meta test assets, verify backups/
operations and intended pilot workload, and obtain owner launch approval. Do not equate
the 100,000-contact local preflight with send capacity or verified 1,200-user hosting.

This entry supersedes older next-step/in-progress sequencing below, not their historical
implementation/test evidence. The owner-approved phase testing cadence is unchanged.

Last updated: 2026-10-15

## Phase-end testing policy — owner instruction, 2026-10-13

Defer test-file creation/updates and automated tests until phase implementation is complete.
Record pending cases during tasks. At each phase boundary, ask whether to create/run tests now
or defer to a later phase; testing stays optional until all implementation tasks finish. Wait
for the owner's choice, record deferral, and keep test tasks pending while continuing implementation.
Revisit all deferred coverage at the final implementation checkpoint. When testing is approved,
write full coverage, execute suites, fix failures, retest, and update records. Static/build checks remain
task-level checks. Reserve `pnpm check` for phase closure. Preserve existing tests and historical
results; report deferred verification as pending. Explicit owner requests may authorize earlier
testing. This supersedes previous mandatory phase-end testing guidance. Distinguish implementation
completion from verified completion and production readiness.

## Current status

Planning and documentation baseline is complete. The monorepo scaffold, local quality tooling, Docker development infrastructure, validated runtime configuration, and initial observability/API error foundation are verified.

## Completed

- Product and technical source documents reviewed and consolidated.
- Detailed functional, architecture, data, API, provider, messaging, security, testing, and deployment documentation created.
- MVP backend and PostgreSQL low-level design created.
- Approved stack: Next.js, NestJS, PostgreSQL, Redis/BullMQ, S3-compatible storage.
- Approved hosting: Railway Pro.
- Capacity target documented for 1,000-1,200 registered/daily users.
- Final scope confirmed: Contacts and Groups included; Tags and Lead CRM excluded.
- Project development rules and task backlog created.
- Critical application flows, stage-gated implementation plan, and six-artifact pre-build readiness mapping created.
- Data access decision approved: Drizzle ORM with drizzle-kit and PostgreSQL.
- `TASK-010` completed: pnpm/Turborepo workspace initialized with Next.js `web`, NestJS `api`, NestJS `worker`, and shared `contracts`, `config`, and `ui` packages.
- Runtime baseline pinned to Node.js 24.7+ within the Node 24 line and pnpm 11; Node 24.7
  supplies the built-in Argon2id API, and the dependency lockfile is committed.
- Production build, strict type checking, baseline test command, API runtime response, and Next.js production startup were verified.
- Git repository is connected to `origin` and the initial monorepo commit is on `main`.
- `TASK-011` completed: type-aware ESLint, Next.js lint rules, Prettier, EditorConfig, strict TypeScript conventions, package lint scripts, and the root `pnpm check` quality gate are configured.
- TypeScript is pinned to `6.0.3` and ESLint to `9.39.5`, the latest combination supported by the current stable TypeScript ESLint and Next.js plugin dependency tree.
- `pnpm check` passes formatting, zero-warning lint, strict type checking, baseline test runners, and production builds across all six workspaces.
- Repository engineering rules now require pragmatic SOLID design, feature-oriented frontend/backend structure, senior-level readability, intent-focused comments, and documented material decisions for all new and changed code.
- `TASK-012` completed: Docker Compose provides healthy, persistent PostgreSQL 16, Redis 7, MinIO-compatible local object storage, and Mailpit email capture through localhost-only ports.
- The local MinIO image is reproducibly built from the immutable commit for the final archived Community Edition release because MinIO no longer publishes Community Edition container images or binaries. It is explicitly prohibited outside local development.
- Local MinIO bucket creation is idempotent, and PostgreSQL, Redis, and object-storage persistence were verified across container restarts.
- `TASK-013` completed: the shared server-only configuration package validates, converts, and freezes API/worker runtime configuration before NestJS initialization.
- Configuration errors expose field names and constraints without echoing submitted secret values; production requires authentication, encryption, and Meta credentials.
- `.env.example` parity, production requirements, coercion, cross-field database pool bounds, immutability, and error redaction are covered by five automated tests.
- API and worker start commands load the optional repository-root `.env` file while preserving injected environment variables as the deployment configuration source.
- Repository policy now prohibits speculative frontend/backend requirements, requires focused user clarification and approval for material ambiguity, and records approved answers and implementation outcomes in `docs/CLARIFICATION_DECISION_LOG.md`.
- Material solution design now follows an evidence-based senior-engineering discipline: inspect the actual system and authoritative requirements, use established patterns, evaluate real constraints and failure modes, compare practical options, and recommend the smallest robust architecture-compatible solution before requesting implementation approval.
- Discovered work from implementation, debugging, or approved design decisions must be recorded before implementation: use a numbered subtask only when it is required for the active task's acceptance criteria; otherwise add a separately numbered, ordered follow-up task. This preserves sequential delivery and does not bypass material approval.
- `TASK-014` completed: the API and worker use shared Pino structured logging with sensitive-field redaction; API requests receive a validated or generated request ID; success and error responses use shared envelopes; and versionless liveness/readiness endpoints are available for deployment probes.
- The initial readiness contract covers validated application configuration only. PostgreSQL, Redis, and object-storage checks must be added when their application clients are introduced.
- The complete `pnpm check` gate passes across all seven workspaces, including the API integration suite for health routes, request correlation, envelopes, safe errors, and log redaction.
- A canonical modular MVP database contract now lives in `apps/api/database/schema/`:
  33 one-table SQL files, machine-readable manifest, relationship map, soft-delete policy,
  deferred constraints, timestamp triggers, and structural verification.
- `docs/DATABASE_SCHEMA.md` provides the complete 33-table schema guide, and
  `pnpm schema:validate:db` executes the entire contract against local Docker PostgreSQL
  inside an assertion transaction that always rolls back.
- Soft deletion is restricted to approved API-deletable business entities and uses
  `is_deleted`, `deleted_at`, and `deleted_by`. Append-only and operational/history tables
  retain lifecycle/retention semantics, and no API schema relationship hard-cascades.
- Role model corrected and approved: Super Admin is the only platform role; Tenant Admin
  is the client/business owner; Tenant User is the employee/assistant. Each active Tenant
  Admin/User has exactly one business membership in the MVP and cannot switch tenants.
  Super Admin creates/activates initial Admins and sees account/billing/operational
  metadata, aggregates, and redacted audit data only—not tenant contact PII or message
  content. Tenant Admin has full own-business access and manages its Users.
- User-created or materially User-edited campaigns/posts and templates require a different
  same-tenant Admin to approve the exact current `content_version`. Material edits
  invalidate approval. Admin-authored/materially Admin-edited work needs no second
  internal approver. Meta template approval remains separate. Routine granted User work,
  including Contact/Group CRUD, inbox replies, and tracking, needs no approval.
- ADR-012 supersedes the scoped-platform-Admin portion of ADR-011. The 33-table contract
  remains intact: one active tenant membership is enforced in `user_tenant_scopes`, and
  campaign/template approval fields live on their existing tables with audit-log evidence.
- ADR-013 makes strict Controller-Service-Repository layering mandatory for all backend
  work. Controllers/queue processors are transport-only and call services; services own
  business orchestration, policy, transactions, audit/outbox work, and injected external
  adapters; repositories alone use Drizzle/database/raw SQL and contain no business
  decisions. NestJS constructor injection wires Repository -> Service -> Controller, and
  layers cannot be collapsed without explicit owner approval and a recorded exception.
- `TASK-020` completed: Drizzle ORM `0.45.4`, drizzle-kit `0.31.11`, and the PostgreSQL
  `pg` driver are configured for the API. The typed `app` schema contains all 33 approved
  tables, and the committed `0000_initial_mvp_schema.sql` migration includes PostgreSQL
  bootstrap, all constraints/indexes, deferred circular foreign keys, and 20 timestamp
  triggers.
- The initial migration was executed from a clean isolated PostgreSQL 16 database and its
  catalog matched the canonical schema exactly: 33 tables, 395 columns, 209 constraints,
  105 total indexes (including constraint-backed indexes), and 20 triggers. Static schema
  verification now also checks the Drizzle migration and snapshot.
- ADR-014 records the canonical-SQL/typed-Drizzle parity workflow. Generated definitions
  and migrations require review because introspection initially reversed composite-key
  ordering and emitted incorrect explicit index operator classes; both were corrected and
  database parity-proven before task completion.
- `TASK-021` completed: the API has a bounded node-postgres pool, typed Drizzle client,
  graceful shutdown lifecycle, database-aware readiness, and an injected transaction
  manager. Application services own transaction orchestration and pass transactions to
  repositories in accordance with strict Controller-Service-Repository layering.
- `OutboxRepository.create()` accepts only a service-owned transaction, so a business write
  and its `PENDING` durable event cannot commit independently. Queue claiming, publishing,
  retry, and relay status transitions remain deferred to the later outbox-relay task.
- Runtime migrations are explicit, forward-only, and never execute during API startup.
  `pnpm schema:migrate` applied the initial migration twice idempotently; PostgreSQL
  integration tests verified one migration record, all 33 tables, transaction commit, and
  rollback without a residual outbox row. ADR-015 and `docs/DATABASE_OPERATIONS.md` record
  deployment and recovery rules.
- Canonical schema validation now uses and removes an isolated temporary PostgreSQL
  database, so it cannot collide with the migrated local development schema.
- `TASK-022` completed: `pnpm schema:seed` now validates environment-only bootstrap
  identities, hashes temporary passwords as salted Argon2id PHC strings before the
  transaction, and creates or validates one Super Admin, one active tenant, its Tenant
  Admin/User, exact single-business memberships, 46 stable permissions and three system
  role assignments, the non-commercial `MVP_INTERNAL` plan/subscription, and one redacted
  audit record.
- Seed execution uses strict service/repository separation, one transaction-scoped
  PostgreSQL advisory lock, full rollback on conflicts, and never overwrites existing
  passwords, account status, or display names. The database integration suite runs the
  seed twice inside a rolled-back outer transaction and verifies idempotency and password
  preservation. ADR-016 and `docs/BOOTSTRAP_SEED.md` are the permanent contract.
- `TASK-023` completed: strict AuthController -> AuthService -> AuthRepository flows now
  implement login, refresh, and logout. Password verification uses bounded Argon2id PHC
  parameters and dummy work for unknown accounts; supported principals are revalidated
  for active role, tenant, and single-business membership inside the session transaction.
- Access tokens are minimal 15-minute HS256 bearer tokens returned in JSON. Opaque refresh
  tokens are stored only as HMAC-SHA256 digests and delivered in an HttpOnly,
  SameSite=Strict, auth-path cookie that is Secure in production. Families use one
  absolute configurable 30-day deadline; rotation does not extend it, replay revokes the
  whole family, and logout is idempotent and family-revoking.
- Redis now enforces fixed-window login limits by normalized email and client IP and is
  part of readiness. Browser auth endpoints validate origins. JWT/refresh secrets are
  mandatory in every runtime. 2FA-enabled accounts fail with `TWO_FACTOR_REQUIRED`; no
  unapproved 2FA flow was added. ADR-017 and CLAR-010 record the binding choices.
- `TASK-024` completed: protected requests now verify the bearer token and resolve the
  exact live PostgreSQL session, active user/role, single-business membership, active
  tenant, and current role permissions. Revocation, suspension, membership changes, and
  permission changes therefore take effect on the next request.
- Reusable `@RequirePermissions(...)` guards use all-of semantics. `@TenantContent(...)`
  also requires `TenantScopeService` to produce a non-null branded tenant repository
  context; Super Admin cannot receive that context or enter a tenant-content path. Future
  tenant repositories must still add explicit `tenant_id` predicates. ADR-018 and
  CLAR-011 are binding.
- `GET /me` returns the safe identity, role, tenant, sorted permissions, and active plan
  projection. `GET /me/sessions` lists only owned active sessions, and
  `DELETE /me/sessions/{sessionId}` revokes an owned current/remote session family with
  audit evidence in one transaction. Broader adversarial isolation/leakage coverage is
  intentionally assigned to TASK-025.
- `TASK-025` completed: a real PostgreSQL integration test now seeds two tenant
  workspaces and a Super Admin, then verifies tenant-claim switching fails at live
  authorization, Tenant User cannot acquire `campaign.send`, cross-user session
  revocation returns `SESSION_NOT_FOUND` without changing the target session, Super Admin
  cannot create tenant repository scope, and Super Admin `/me` output contains no other
  tenant names or Admin emails. Content-route, export, storage, job, and realtime leakage
  tests remain mandatory as those modules are introduced.

## Current task

`TASK-053` is complete: approved Campaign draft API/UI, Contacts/static Groups audience,
literal/Contact-field mappings and row-locked material-version/revision conflict checks.
Preflight/send workflows remain TASK-054/055. See CLAR-023 and CAMPAIGN_DRAFTS.md.

`TASK-041` completed the approved combined Contacts and Groups vertical slice. It
coordinated the ordered TASK-041 through TASK-045 outcomes: minimal authenticated web
foundation; Contacts UI; static manual Groups; typed consent/tenant-wide STOP handling;
and secure asynchronous CSV/XLSX imports with ClamAV scanning, mapping, normalization,
deduplication, and row-error reporting. TASK-046 remains the dedicated comprehensive
security/E2E test task. The binding decisions are recorded in CLAR-018.

`TASK-046.3` repaired the worker development script by placing the `tsx watch` subcommand
before Node's optional environment-file flag, matching the working API command. Root
`pnpm dev` no longer fails because `tsx` attempts to import an `apps/worker/watch` module.

`TASK-047` replaced the API's `tsx` development runner with the local Nest CLI TypeScript
watch pipeline. `tsx` does not emit `design:paramtypes` decorator metadata, so Nest could
not resolve class-based constructor injection during source execution. The API watcher
continues to load the repository-root `.env`; production build/start behavior is unchanged.

`TASK-048` documented the verified development-only recovery procedure for a forgotten
bootstrap password: generate three distinct strong passwords locally, reset disposable
local infrastructure, migrate and reseed, verify Tenant Admin login, then clear plaintext
bootstrap passwords from `.env`. The guide warns that the reset deletes all local service
data and records the UTF-8, unique-key, termination-prompt, and API-health diagnostics.

`TASK-040` is complete. Tenant Admins and permitted Tenant Users now have strict
Controller-Service-Repository Contact list/create/read/update/soft-delete APIs. The service
derives the tenant exclusively from live authorization, blocks Super Admin, uses cursor
pagination, and writes redacted audit evidence inside the CRUD transaction. Manual phones
accept E.164 or Indian local input normalized with the approved `+91` default; duplicate
active numbers return `CONTACT_PHONE_EXISTS` without a merge. New manual Contacts always
have `UNKNOWN` consent, while consent lifecycle remains TASK-043. An optional assignee is
validated as an active same-tenant Admin/User. Migration `0003_contacts_cursor_listing`
adds the active tenant cursor-listing index; it does not change any Contact fields.

`TASK-034` is complete. Tenant template listing, creation, complete material updates,
approval request/review, deterministic preview, and bounded Meta synchronization follow
strict Controller-Service-Repository layering. Internal User approval and Meta provider
status remain separate. Material changes increment `content_version` and invalidate
non-Admin approval; a requester cannot approve their own template. Template submission
to Meta and campaign use remain protected future workflows.

`TASK-036` is complete. Each new verified Meta webhook delivery now creates an atomic
outbox handoff. A worker uses PostgreSQL claim locks and BullMQ jobs containing only the
webhook event UUID, retries a failed job five times at 1/2/4/8/16-second delays, then
marks it `DEAD` with only a safe error code. The initial processor creates/fetches
Contacts and Conversations, inserts inbound Messages once, updates activity, and advances
delivery states monotonically. The private `webhook:replay` worker command requeues only
`FAILED`/`DEAD` events. Meta `deleted` status stays solely in the protected webhook event;
it cannot regress a Message state. Migration `0002_webhook_outbox_claims` adds the relay
claim fields and `PROCESSING` state. No credentials were committed.

`TASK-035` is complete. The Meta webhook endpoint captures the exact raw request body,
returns the verification challenge only for the configured token, and uses a constant-time
HMAC-SHA256 check before parsing a delivery. A verified `whatsapp_business_account`
delivery is stored at most once using its raw-body SHA-256 digest; account/tenant ownership
is attached only when one payload phone identifier matches one local account. The
stored JSON payload remains tenant-content and is not logged or exposed to Super Admin.
The receiver leaves events in `RECEIVED`; dispatch, processing, retry, and replay are
intentionally deferred to TASK-036. No credentials were committed.

`TASK-033` is complete within the approved development-safe scope. Tenant-scoped health
listing, Meta phone synchronization, and local disconnect now exist behind the official
provider adapter boundary. Synchronization uses only the server-side
`env://META_DEVELOPMENT_ACCESS_TOKEN` reference and remains safely actionable until the
owner adds the ignored environment value for frontend testing. Disconnect preserves
history and does not perform upstream token revocation or WABA unsubscription (CLAR-014).

`TASK-032` is complete within the approved development-only scope. An authorized Tenant
Admin can persist the Meta development test WABA/phone mapping and an opaque server-side
credential reference through `POST /whatsapp/connect`; the reference is never returned
or logged, and the account plus redacted audit evidence are committed atomically. Full
client Embedded Signup remains deferred until the Meta partner model and credential
exchange are confirmed (CLAR-013). No credentials were committed.

`TASK-031` is complete. Meta configuration is read only from server runtime variables;
the provider configuration boundary requires Graph API version, app ID, app secret, and
webhook verification token without exposing their values. The local API development
command now invokes `tsx watch` correctly. The owner has created the Meta development app
and its test WABA/phone assets; no credentials were committed.

`TASK-030` is complete. The server-only WhatsApp provider contract now exposes neutral
account, template, and outbound-message operations with normalized safe failures. Its
unconfigured adapter rejects all calls until the Meta credential work in TASK-031.

`TASK-026` is complete. Platform administration now uses separate allowlisted routes for
business creation, Tenant Admin creation, tenant suspension/reactivation, plan/subscription
administration, and append-only manual payment records. The next sequential task is
`TASK-030`.
`TASK-015` GitHub Actions remains explicitly owner-deferred.

## Known decisions requiring implementation-time confirmation

- Meta partner arrangement and exact production Embedded Signup credential exchange.
- Launch Railway region and data-residency requirements.
- Retention periods, RPO, RTO, and backup retention.
- Commercial plan limits, pricing, and quota behavior. `MVP_INTERNAL` is only a
  configurable non-commercial bootstrap plan.
- Inbox transport resolved by CLAR-035 / ADR-021: REST polling foundation; actual UI mounting/runtime verification remains TASK-066/065.

## Known issues

- CI does not exist yet.
- The full dependency audit reports `GHSA-vfj7-8cjw-p6xm` in the development-only
  `eslint-config-next -> fast-glob -> micromatch -> braces@3.0.3` chain. The advisory has
  no patched release. The package is not in production dependencies; continue tracking
  it and remove any exception once the upstream toolchain resolves it.
- The production dependency audit reports moderate `GHSA-w5hq-g745-h8pq` for
  `uuid@8.3.2`, pulled by `exceljs@4.4.0` in the API and worker import paths. The current
  `pnpm security:audit` high/critical gate passes; review an upstream ExcelJS upgrade or a
  compatibility-tested override before production launch rather than applying a blind
  transitive-major-version override.
- ESLint 10 adoption is deferred until the Next.js React/import/accessibility plugin chain supports it without peer conflicts.
- Production RPO, RTO, backup retention, and restore automation remain open for TASK-083;
  migration recovery currently uses forward correction or the environment's approved
  backup/PITR procedure.
- A Meta development app and test WABA/phone assets exist locally; production/staging
  credentials and the Embedded Signup partner model remain unconfigured.
- No Railway services have been provisioned.

## Next step

TASK-052 is complete within the verified provider boundary. API/worker share one server-only provider
package. The worker revalidates live dispatch policy, persists SENDING before submission,
then stores normalized provider ID/SENT/accepted time. Five total attempts use
exponential jitter and longer Retry-After; terminal failures use existing FAILED.
Private message:replay requires tenant/message IDs and requeues only confirmed retryable
failures through a new audited outbox event. Unknown acceptance and existing provider IDs
cannot be replayed; crash/acceptance-persistence gaps retain SENDING for manual review.
See OUTBOUND_DELIVERY_OPERATIONS.md and ADR-019.

Required TASK-056 delivery tests are included in TASK-052. Campaign dispatch remains
blocked until TASK-053–055 supplies approval/recipient workflows. Text HEADER/BODY
template parameters are supported; unsupported media/buttons fail closed. Tests use
fake providers, rollback-only PostgreSQL fixtures and uniquely prefixed Redis jobs.

Verification: pnpm check (format/lint/typecheck/unit/build/Playwright), ten API database
integration tests and three real worker PostgreSQL/Redis/BullMQ integration tests passed.
The final gate passed after the worker metadata-compatible runner change. A compiled
private replay smoke check initialized Nest dependencies and correctly rejected a
nonexistent message without writes or sends.
No live Meta sends or schema migration were required. Numeric provider-code verification
before production remains TASK-057; current mapping is deliberately conservative.

TASK-053 passed pnpm check (schema/format/lint/typecheck/unit/build/Playwright), including
50 API tests and five browser tests, plus three separate rollback-only PostgreSQL draft
tests. The Campaign feature lint gap and same-version explicit form reload bug are fixed.
No schema migration, provider call, send or commit is introduced. Saved segments remain
TASK-058 pending design approval. Next sequential task: TASK-054.
TASK-015 remains owner-deferred.

TASK-054 is complete. Campaign preflight is a durable asynchronous diagnostic flow: the
tenant-scoped API transaction creates one version-bound `campaign_preflight_runs` record plus an
identifier-only outbox event, the worker relay/processor expands explicit Contacts and active
static Groups, and the Campaign UI polls aggregate results. Audience overlap is deduplicated;
recipient snapshots store the preflight run/content version, rendered variables for eligible
Contacts, or explicit invalid-phone/consent/suppression/missing-variable skip reasons. Current
tenant, subscription/plan, account/credential, internal/provider template approval, campaign
approval, supported components, exact mapping, and monthly quota are reported as campaign-level
blockers. Preflight reserves no quota and never sends; insufficient quota blocks instead of
truncating. Material edits supersede active runs and remove stale snapshots. TASK-055 must rerun
and finalize preflight after exact-version approval before schedule/send. Migration
`0007_campaign_preflight` raises the canonical schema to 35 tables and is applied locally.
Verification: full `pnpm check` passed (schema/format/lint/typecheck, 50 API unit/security tests,
19 worker tests including preflight policy and queue-relay cases, production builds, and five Playwright tests), and
four rollback-only Campaign PostgreSQL integration tests passed. No live Meta send occurred.
Next sequential task: TASK-055. TASK-015 remains owner-deferred.

## TASK-055 implementation — 2026-10-15

Implemented campaign approval and delivery lifecycle under CLAR-027. Draft schedules store
UTC/timezone and invalidate User approval when changed; approval pins the selected template
version. A different active Tenant Admin reviews User submissions. Start commands retain a
request key/hash and actor; recipient composition is deterministic and transactional.

The worker scheduler scans durable PostgreSQL campaign state and calls the server-only
`@whatsapp-platform/api/campaign-runtime` module (ADR-020). It reuses the existing MessagingService,
database transaction manager and outbox; it does not send through a second provider path.
Fresh final preflight runs use outbox/BullMQ, future schedules recheck when due, and expansion
composes 25 recipients per transaction. Sorted message-key locks precede the common quota lock.
The full uncomposed remainder must fit remaining monthly quota; later insufficiency pauses it.

Pause/cancel serialize with provider SENDING claims. Paused jobs delay without spending provider
attempts; already-claimed requests may finish. Cancel preserves evidence and stops unclaimed
work. Live sender/reviewer membership and permissions, campaign approval, snapshot variables,
and pinned template version are rechecked. Tenant-only reports show current message states,
final preflight blockers, safe reasons, pagination and timestamps. The UI exposes saved-version
review, schedule, send, pause/resume/cancel and report refresh.

Migration `0008_campaign_lifecycle` is generated and applied to the local development database;
the canonical table count remains 35. It adds schedule timezone, template binding, start identity,
delivery actor, final-preflight relationship and pause reason. The worker runtime has an
additional bounded database pool; account for it in Railway connection budgeting.

Integration review fixed preflight audit parameter casts and the installed BullMQ validator's
rejection of two-part colon job IDs in preflight and delivery-webhook queues. The equivalent
Contact-import issue is recorded as TASK-059, outside this implementation.

Verification: `pnpm exec turbo run lint typecheck build` passed all 30 tasks; formatting,
schema verification and drizzle-kit checks passed; local migration application succeeded.
No test files were created/changed, no automated tests executed, and no live Meta sends made.
Cases T055-01 through T055-16 are pending in TEST_PLAN.md. TASK-055 is implementation-complete,
not acceptance-verified or production-ready. TASK-056 is the optional test checkpoint; TASK-057,
TASK-058 and TASK-059 remain pending follow-ups. TASK-015 remains owner-deferred.

## TASK-059 implementation — 2026-10-15

Corrected Contact-import job identity from `contact-import:{importId}` to
`contact-import-{importId}`. Source inspection confirmed that the installed BullMQ validator
rejects the old two-segment colon ID. The new identity stays deterministic per durable import;
payload, retry/backoff, retention, and existing outbox retry behavior are unchanged. Failed
outbox publications can retry through the existing relay when the updated worker is running;
no queue purge, database migration or manual data rewrite was performed.

Worker lint/typecheck/build passed (`pnpm exec turbo run lint typecheck build
--filter=@whatsapp-platform/worker`, 10 successful tasks including dependency builds), and the
changed queue file passed formatting. Automated tests were neither created nor run; transport
cases T059-01–04 remain pending under CLAR-026. TASK-059 is implementation-complete.
TASK-056 tests remain deferred; TASK-057 provider verification and TASK-058 saved-segment design
remain pending. The next core feature implementation is TASK-060 (Shared Inbox foundation).

## Phase 5 testing checkpoint — 2026-10-15

The owner explicitly authorized Phase 5 testing before TASK-060 (CLAR-029), superseding the
earlier deferral for this checkpoint. Added lifecycle unit tests, real PostgreSQL approval /
scheduling / quota / concurrency checks, worker policy/paused-attempt coverage, a 100,000-contact
preflight and real Redis queue-ID checks, plus browser submission/delivery/scheduling coverage.
Corrected the old metadata-only draft fixture and browser report double to current contracts.

Real SQL exposed invalid schema-qualified FOR UPDATE OF emitted in the common composer gate.
TASK-056.1 uses supported FOR UPDATE, locking both campaign and recipient rows; lifecycle and
isolated concurrency retests pass. TASK-056.2 updates the old database inventory assertion
to the approved nine migrations/35 tables; all 10 database regressions pass.

Campaign SQL suite: 9 passing tests. Worker messaging SQL/Redis suite: 3 passing tests.
`pnpm check` passed schema/format/lint/typecheck/unit/build/browser gates: API 55/55,
worker 21/21, provider contracts 4/4 and Chromium 8/8 (other workspace suites also passed).
Worker Phase 5 integration: 2 passing tests; 100,000-contact fixture/preflight/verification
took 44,755 ms, with 60,000 eligible, 40,000 skipped, one overlap removed, no usage reserved,
and one completion audit on replay. This is not 100,000-message dispatch capacity.

See `docs/PHASE_5_TEST_REPORT.md` for command results and the exact per-case boundaries.
No live Meta sends. Fixtures roll back; isolated concurrency database and prefixed test jobs
are removed after testing. No normal application data/queues are deleted. TASK-056 remains
in progress for TASK-056.3 extended fault/recovery/load and remaining partial scenarios.
TASK-057 and TASK-058 remain pending. TASK-060 has not started.

## TASK-086.5.9 visual-system refresh — 2026-10-23

The owner explicitly approved a current-internet-researched UI refresh because the prior
yellow-heavy interface felt dated. First-party guidance from Linear's 2026 refresh, Vercel Geist
and Atlassian spacing/elevation foundations selected CLAR-060: calm monochrome hierarchy,
receding navigation, flat white work surfaces, near-black primary actions and restrained green
only for live/success meaning. Geist remains the sole font; workflows, permissions, responsive
behavior and API/provider contracts are unchanged.

Updated shared CSS and UI tokens across authentication, fixed desktop/sidebar drawer, navigation,
topbar, forms, cards, tables, statuses, templates, campaigns, WhatsApp setup and dialogs. The
unclassified My profile sidebar action now shares navigation geometry instead of inheriting the
global primary button. Desktop rendered verification confirmed 28 px mixed-case auth heading,
38 px black action, 8 px control radius and no horizontal overflow. Formatting, focused Web/UI
lint and typecheck passed. UI and Web production builds passed; the first sandboxed Web build
could not fetch Geist, then the approved network retry compiled and completed. Next.js 16.4.0
reported a known security vulnerability and recommends a separate security upgrade. Automated
tests remain deferred under CLAR-026; authenticated feature-screen and narrow-viewport visual
acceptance remain for the owner/runtime checkpoint.

## TASK-086.5.10 large-container alignment — 2026-10-23

CLAR-079 standardizes authenticated pages on a centered, fluid 1,200 px large container. The
sticky topbar, page headers, action groups, feature roots, forms, cards, tables and pagination
now share the same horizontal edges, with 24 px section spacing, 8/12 px action gaps and 20 px
mobile gutters. Existing component density, 44 px mobile targets, workflows, permissions and
contracts are unchanged. Authenticated Super Admin audit rendering measured the topbar, first
content block and filter form at the same 1,200 px width with no horizontal overflow. Formatting,
focused Web/UI lint/typecheck/build passed; automated tests remain deferred under CLAR-026.

TASK-086.5.10.1 corrects a cascade defect visible on primary form buttons: an older generic
hover color survived while CLAR-060 changed only the later background, producing dark text on a
near-black hover surface. Primary and submit hovers now explicitly retain white text; secondary,
navigation, quiet and destructive variants keep their more-specific treatments.

TASK-086.5.10.2 removes the screenshot-confirmed remaining layout conflicts. Overview direct
toolbars retain the same auto-centered 1,200 px edges as topbar/cards. Platform Businesses and
Tenant Team group eyebrow/title/description in one header block. Profile aligns its page root to
the same 1,200 px container while keeping readable 840 px left-aligned forms; fieldsets use white
12 px card surfaces and primary submits remain black inside mixed action rows. Authenticated
Chrome measurements passed all three reported pages without horizontal overflow. Format, Web
lint/typecheck and production build passed; automated tests remain deferred under CLAR-026.
# Production-style local Compose stack — 2026-10-24

TASK-089 extends `compose.yaml` from infrastructure-only to the complete compiled local stack:
Web and API use their existing Railway images; Worker runs `dist/consumer.js`; exactly one
Scheduler reuses the Worker image and runs `dist/scheduler.js`. API, Worker and Scheduler use
full/production validation with Compose-network PostgreSQL/Redis/MinIO/ClamAV/Mailpit addresses;
all published ports remain loopback-only. Web uses the same-origin `/api/v1` build plus fixed
`http://api:4000/api/v1` proxy. Local-only fallback secrets keep non-provider startup deterministic;
real Meta actions still require explicit `.env` overrides. Migration and seed remain explicit
profiled one-shot compiled commands, never runtime startup.

Railway files/configuration were not changed: pushing `main` still leaves the current preview
topology as Web/API/PostgreSQL/Redis unless the owner separately changes Railway. Compose config
expands to postgres, redis, clamav, mailpit, minio, minio-init, api, worker, scheduler and web.
Prettier,35-table schema and diff checks pass. Automated tests were deferred per owner cadence.
Docker image build was attempted but Docker Desktop's Linux engine was stopped; TASK-089.1
records build/migration/start/health verification after the owner starts it. No containers,
database/provider operations, Railway changes or real secrets were used.

## TASK-089.1 local compiled-stack verification — 2026-10-25

Docker Desktop's Linux engine was available, so the production-style local stack was completed.
The first image build exposed two runtime defects: Web's fixed Compose proxy lacked `/api/v1`
and did not permit the exact internal `api` hostname over HTTP, and BullMQ 6's ioredis adapter
requires the lowercase `ping` method name for Worker/Scheduler readiness. Compose now supplies
the paired Web proxy variables at build and runtime, permits only that exact local Compose HTTP
host in addition to the existing HTTPS/private-Railway rules, and uses the adapter-compatible
queue ping. Web/API/Worker production image builds and focused formatting/config/diff checks pass.

The existing local schema already contained the exact changes from migrations 0009 and 0010,
while its Drizzle ledger stopped at 0008. After confirming the column definitions and check
constraint against the committed SQL, only the two missing hashes/timestamps were recorded.
The compiled migrator then completed successfully; no schema reset or seed occurred.

The complete ten-service/one-shot topology starts successfully: PostgreSQL, Redis, MinIO,
ClamAV, Mailpit, API, Web, Worker and singleton Scheduler are healthy, while MinIO init exits 0.
Independent requests returned HTTP 200 for Web and the API, Worker and Scheduler live/ready
endpoints. Automated tests remain deferred under the owner cadence; no Railway change, Meta
provider action, live message, seed, reset, commit or push occurred.

## TASK-084.2.1 manual-payment conflict closure — 2026-10-25

The production fix already present from the Phase 8 checkpoint safely follows at most four
`Error.cause` links to recognize PostgreSQL `23505`, preserving the manual-payment 409 without
exposing SQL or parameters. This task added the two evidence cases that the report still marked
pending. Concurrent same-reference requests now have verified behavior: exactly one succeeds,
one maps to 409, and the database contains one payment plus one matching audit. A forced audit
failure also verifies that its preceding payment insert rolls back atomically.

The focused compiled PostgreSQL file passed 8/8. The initial combined command passed all eight
SQL cases but its separate authenticated HTTP fixture hit the previously observed startup timeout
with no HTTP status or startup markers; no payment assertion failed, and that unrelated fixture
was not changed. Test databases were randomly named, localhost-guarded and removed by the fixture.
Formatting, typecheck and production compilation passed. No application database, Railway or Meta
operation occurred.

## TASK-067 full workspace lint coverage — 2026-10-25

Reproduced 54 legacy findings (52 errors, two warnings) in `workspace-app.tsx`, previously excluded
from the configured Web lint path. Existing rules were retained. Mechanical void-arrow issues,
async JSX handlers, deprecated form-event types, untrusted FormData coercion, catch typing and
numeric rendering were corrected. Contacts and Groups now perform initial requests directly in
their effects and update state after promise settlement. Import error state is keyed by import ID,
so switching imports hides stale rows without a synchronous effect reset while preserving polling
and error pagination.

The Web lint scripts now include the complete `features/workspace` directory instead of only
`api-client.ts`. Formatting, expanded Web lint, route generation/typecheck, production build and
diff checks passed. Automated browser tests remain deferred under the owner cadence; no API,
schema, provider, database or deployment behavior changed. Next.js 16.4.0 stopped the first build
once for its known security-upgrade recommendation; the required identical retry completed while
retaining the warning. A separate security upgrade requires owner approval.

## TASK-092 sign-in password visibility — 2026-10-25

The sign-in password input now includes an inline eye button. Passwords remain masked by default;
the toggle switches only the input presentation between password and text, preserves the current
autocomplete/submission value and stores nothing separately. The button is keyboard accessible and
announces Show password / Hide password with matching pressed state. Styling uses the existing
compact neutral controls and visible focus behavior. No other password form was expanded.

Focused formatting, expanded Web lint, route generation/typecheck, production build and diff checks
passed. Browser automation remains deferred under the owner cadence. Next.js 16.4.0 repeated its
known security-upgrade recommendation; the required identical build retry succeeded. No API,
database, authentication policy, deployment or provider behavior changed.

TASK-092.1 replaces every remaining password input with the same reusable control: initial password
handover (temporary/new/confirm), Profile change (current/new/confirm), Tenant User creation,
business/Tenant Admin creation and Super Admin creation. The component forwards existing input
properties and owns visibility only, so field names, controlled/uncontrolled values, autocomplete,
required state, length rules and help associations remain unchanged. Static search confirms no raw
`type="password"` implementation remains in Web features. Formatting, full Web lint, route
generation/typecheck, production build and diff checks passed; browser automation remains deferred.

TASK-092.2 corrects the screenshot-reproduced shared-control layout regression. The form row could
be wider than the input's existing 640px maximum, causing the absolutely positioned eye to anchor
at the row edge; the global hover rule also replaced its vertical-centering transform. The password
wrapper now shares that maximum width, and component-specific default/hover/active rules keep the
36px control inside the input's right edge without movement or transition. Accessible behavior and
all form contracts are unchanged. Web formatting, full lint, route generation/typecheck and the
production build passed; browser automation remains deferred. Next.js 16.4.0 repeated its known
security-upgrade recommendation; the required identical build retry succeeded.

## TASK-086.6.4 synchronized-template edit guard — 2026-10-25

The backend now matches the approved read-only UI policy for synchronized WhatsApp templates.
`TemplateRepository.updateMaterial` atomically requires the active tenant row's expected content
version, `provider_status = DRAFT` and a null provider template ID. Direct API calls and races can
therefore no longer apply local material edits while retaining stale Meta identity/status. The
smallest safe policy is rejection rather than silently unlinking provider records, preserving
sync identity and existing provider behavior. No schema, controller/service contract, UI or Meta
call changed. Formatting, API lint/typecheck/production build and diff checks passed. Automated
regression coverage remains deferred to the owner-approved checkpoint.
