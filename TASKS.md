# MVP Task Backlog

- [ ] TASK-093: Implement the approved unified online/offline tenant billing-control flow (CLAR-083). Reuse the existing usage ledger, plans, subscriptions, manual-payment records and Super Admin platform boundary. Offline payment recording remains append-only and never changes entitlements by itself; a separate explicitly confirmed, audited subscription command assigns the plan, effective period and status. Subscription expiry/billing suspension preserves data and approved read-only access while blocking quota-consuming creation/execution server-side. Security, abuse or policy tenant suspension remains a separate stronger control. A future online gateway must enter the same subscription workflow through an idempotent adapter/webhook path and is not authorized by this task. Super Admin controls tenant-level billing/subscription state; Tenant Admin retains ordinary Tenant User management. Exact pricing, currencies, partial-payment allocation, tax/invoice/refund rules, grace periods and renewal-date calculation remain unresolved and must be approved before their affected branches are implemented.
  - [ ] TASK-093.1: Before implementation, inventory current plan/subscription/payment/status APIs and enforcement points; propose the smallest Controller-Service-Repository extension, DTO/state-transition contract, transaction/audit behavior and read-only capability matrix for owner approval.
  - [ ] TASK-093.2: After the TASK-093.1 contract is approved, implement the Super Admin offline-payment plus explicit subscription activation/extension flow without coupling payment insertion to entitlement mutation.
  - [ ] TASK-093.3: Enforce the approved subscription read-only mode at every applicable API/worker execution boundary and surface actionable tenant/platform UI state without exposing tenant content to Super Admin.
  - [ ] TASK-093.4: At the phase checkpoint, ask the owner whether to write/run the recorded authorization, transaction, idempotency, expiry and enforcement coverage or defer it under the project test cadence.

- [x] TASK-091.1: Owner-authorized automated partner Super Admin checkpoint (CLAR-082): creation25/auth32, disposable SQL/HTTP15 (parent included) and mocked Chromium11 passed; API build/lint/format/diff checks passed. Dedicated npm scripts added. See docs/SUPER_ADMIN_TEST_REPORT.md for exact coverage and residual combinations/UAT. Removed only labelled disposable test containers and their test volumes; normal services/data untouched. No hosted data, real accounts or provider calls.
  - [x] TASK-091.1.1: Repaired real PostgreSQL schema-qualified FOR UPDATE OF generation failure by locking the creator row separately before eligibility joins in the same transaction. Full/preview creation/rollback/concurrency checks passed. Browser hydration timing and alert scoping corrected; final browser runner exited0 outside Windows sandbox.

- [x] TASK-092: Added one reusable accessible show/hide eye control to every password input.
  Passwords stay hidden by default; each keyboard-accessible button exposes field-specific Show/Hide
  labels and pressed state while preserving submission/autocomplete without separately storing values.
  No standalone password input remains. Focused Web format/lint/typecheck/production build and diff
  checks passed. Automated browser coverage remains deferred; Next.js retains its security warning.
  - [x] TASK-092.1: Extracted the sign-in control into a reusable password input and applied it to
    every password field: initial handover, Profile change, Tenant User creation, business/Tenant
    Admin creation and Super Admin creation. Each field's form contract is preserved, and static
    search confirms no raw `type="password"` implementation remains outside the shared component.
  - [x] TASK-092.2: Corrected the screenshot-reproduced password visibility layout regression.
    The shared wrapper now follows the input's existing 640px maximum width, and the eye remains
    inside its right edge with unchanged centering across default, hover and active states. No
    animation or accessible behavior changed. Web format/lint/typecheck/build and diff checks pass.

- [x] TASK-091: CLAR-081 / ADR-034 partner Super Admin creation UI/API implemented: existing non-pending platform actor/user.invite, strict shared account DTO, server-owned role/null tenant/no memberships, atomic redacted audit, reserved-email protection and mandatory handover/fresh login. Same layers in full/preview; creation-only UI with privilege confirmation/dirty protection. Contracts/API/Web builds, API/Web lint, Web typecheck,35-table schema and diff checks passed. No migration, actual account or deployment; local automated checkpoint completed under TASK-091.1, with residual T091 scenarios documented separately.

- [x] TASK-090: Documented the owner-approved Railway branch/environment promotion workflow
  (CLAR-080). One Railway Pro project uses an isolated `development` environment deployed from
  `dev` for complete full-stack E2E/UAT, while the existing `production` environment remains on
  `main` and unchanged until explicit owner promotion approval. Record strict data/secret/Meta/
  queue isolation, acceptance gates and `dev` -> `main` promotion; documentation only, with no
  branch, code, Railway, migration, provider or test action. Updated current state, Railway
  development/staging and preview guidance, README, clarification log and memory. Focused
  Markdown formatting, decision-reference search and diff checks passed; no tests were needed
  or run for this documentation-only change.

- [x] TASK-089: Added a production-style local Docker Compose application stack. Reuses the
  existing Railway images to run Web, API, Worker consumer and singleton Scheduler alongside
  the existing local PostgreSQL/Redis/MinIO/ClamAV/Mailpit services. Keep migrations/seeding
  as explicit one-off commands, use container-only dependency addresses, expose local health
  checks and leave Railway's current Web/API/PostgreSQL/Redis preview deployment unchanged.
  Compose expansion, formatting,35-table schema and diff checks pass. Automated tests remain
  deferred under the current owner cadence. Docker image/runtime verification could not run
  because Docker Desktop's Linux engine is stopped; no Railway, database or provider action.
  - [x] TASK-089.1: Built the production Web/API/Worker images, applied the explicit compiled
    migration, started the complete ten-service/one-shot Compose topology and independently
    verified HTTP 200 for Web plus API/Worker/Scheduler live and ready endpoints. PostgreSQL,
    Redis, MinIO, ClamAV, Mailpit, API, Web, Worker and Scheduler are healthy; MinIO init exited
    successfully. No seed/reset/send, Railway or Meta action occurred. Automated tests remain
    deferred under the owner cadence; production builds and runtime health were verified.
    - [x] TASK-089.1.1: The first real Compose image build reproduced Web proxy validation
      failure: the local target omitted `/api/v1` and fixed-host validation allowed Railway
      private HTTP only. Correct Compose to `http://api:4000/api/v1` and permit only the exact
      internal Compose hostname `api` over HTTP; retain HTTPS/private-Railway requirements for
      every other target, then rebuild before migration/start.
    - [x] TASK-089.1.2: Reconciled the existing local database's Drizzle migration ledger with
      migrations 0009 and 0010 after read-only inspection confirms their exact schema changes
      are already present. Record only the two missing migration hashes/timestamps, rerun the
      compiled migrator, and verify the ledger before starting services; do not reset or seed.
    - [x] TASK-089.1.3: The full-stack startup reproduced a Worker/Scheduler readiness failure
      because BullMQ 6's ioredis adapter resolves `runCommand` names as case-sensitive client
      methods. Use the adapter's lowercase `ping` method name, rebuild the Worker image, and
      verify both process health endpoints.

- [x] TASK-088.1: CLAR-078 migration-to-schema review complete:0001–0010 effects already reflected in corresponding separate table SQL; no duplicate ALTER or SQL mutation needed. Mapping added to schema/README.md. Static35-table schema verification and diff checks passed; migration files unchanged. No DB execution or exhaustive catalog/runtime parity claim.

- [x] TASK-088: CLAR-077 withdrew consolidation: original38 separate SQL files (35 tables plus bootstrap/deferred keys/triggers), manifest and schema tools restored. Combined SQL/reader removed; ADR-033 retained as withdrawn evidence. Future changes use new versioned migrations with matching per-table/Drizzle updates. Schema verification and diff checks passed; migration files unchanged, no DB operations or runtime tests.

- [x] TASK-087: CLAR-075 Markdown maintenance complete: current35-table/polling/encrypted-signup guidance reconciled; duplicated deployment paragraph removed; trial preview/full rollout and initial/extended capacity boundaries distinguished; dated local/hosted checkpoints labelled. CURRENT_STATE.md adds ownership/navigation. ADR decisions, approval history, test reports, deferred coverage and unrelated edits preserved. Selected local-link checks and git diff --check passed. No runtime/deployment/test changes or acceptance waivers.

- [x] TASK-082.4.8: Owner-authorized hosted migration checkpoint2026-10-23: read10 applied, ran node dist/database/migrate.js in API console successfully, verified11 applied plus provider_credentials.encrypted_token and provider_credentials_storage_check. No seed/reset/deletion, credential changes or future pre-deploy configuration changes. Services remain Online; authenticated UAT pending.

- [x] TASK-082.4.7: CLAR-073 repaired preview startup on2026-10-23 by generating owner-approved Web-only public domain. Existing API references now resolve to its HTTPS origin; redeployed API6964ca35 successfully, all four services Online. Public login renders and /api/v1/me denies unauthenticated access. API stays private; no secrets, code, migration, paid upgrade or authenticated data changed. Full readiness/authenticated UAT/launch gates remain pending.

- [x] TASK-086.8: CLAR-072 own Profile implemented for all roles/full/preview: read-only email/role/business, own-name update with atomic audit, current-password verified change with revoke-all/fresh login and unchanged initial handover gate. Shared UI includes saving/error/success and dirty protection. API/Web lint and production builds, web typecheck, schema and diff checks passed. No migration, dependency or hosted change. Automated/runtime acceptance remains pending owner checkpoint decision; see docs/PROFILE.md and docs/TEST_PLAN.md.

Status values: `[ ]` pending, `[-]` in progress, `[x]` completed, `[!]` blocked.

Only one implementation task should normally be in progress at a time.

- [x] TASK-032.1: CLAR-071 configurable onboarding foundation implemented. Server-owned development/
  embedded_signup selector defaults to development; API-driven setup UI, validated Meta
  configuration ID and explicit unavailable state; manual connection denied outside development.
  No automatic provider calls, live SDK launch, schema change or deployment.
  Config/contracts/API/Web builds, registered lint, Worker typecheck,35-table schema and
  diff checks pass. Foundation tests now covered by the combined032.2 checkpoint below.
  Owner chose combined foundation + secure signup testing2026-10-21; no separate suite now.
  - [x] TASK-032.2: Direct Tech Provider connection implemented and locally checked; live
    provider/activation acceptance is separate. Secure Embedded Signup completion, per-business credentials, verified
    assets and reconnect lifecycle. Credential storage approved and implemented in032.2.1;
    provider-specific connection workflow now implemented. Agency operation
    uses each client's Tenant Admin, never Super Admin impersonation.
    Owner approved direct Tech Provider flow, no agency credit-line sharing. Implement
    one-use10-minute session/tenant/config-bound Redis attempts, strict DTOs, code exchange
    and token/app/scope/asset verification outside DB transactions, then atomic connection/
    encrypted credential/audit. Existing account IDs retained on same-tenant reconnect;
    foreign asset reassignment rejected. SDK loaded only after explicit Connect intent.
    No auto registration/subscription, payment, sends or preview background enablement.
    - [x] TASK-032.2.2: Combined local testing found the existing app smoke runner assumes
      package cwd and hardcodes normal local services. Allow explicit guarded disposable
      DB/Redis overrides and an absolute compiled entry point before smoke retest; no API
      behavior change or ordinary local DB/queue mutation authorized.
      Absolute compiled entry and guarded disposable overrides implemented; smoke/auth31/31
      rerun passed. Combined focused35/35, SQL/Redis13/13, mocked browser19/19 passed;
      tests include replay/concurrent claims, expiry, foreign session/tenant, encryption,
      stable reconnect and actual audit rollback. Report records exact bounds/deferred cases.

- [ ] TASK-032.3: Owner-authorized real Meta onboarding/HTTPS/domain/approval verification
  after migration/configuration. No live provider or hosted action implicitly authorized;
  phone registration/payment/webhook/sending activation remains separate from connection.
- [ ] TASK-032.4: Extended onboarding outage/rate-exhaustion/log/key-rotation/UI recovery
  matrices and bounded large-WABA pagination follow-up. See test report for remaining cases;
  no speculative infrastructure or additional partner/coexistence flow approved.
    - [x] TASK-032.2.1: Encrypted credential foundation implemented and covered by combined tests.
      Owner approved encrypted PostgreSQL credentials with separate server
      keys. Implement authenticated, account/tenant-bound encryption, additive migration,
      shared API/Worker resolver and key-version handling. No plaintext token endpoint,
      hosted migration, provider mutation or paid service. Combined secure signup tests
      remain the owner-selected checkpoint.
      Migration0010 source generated (11 migrations/35 tables), not applied. Cipher/keyring,
      internal audited persistence and shared API/Worker repository/resolver implemented.
      Secure signup callback/provider activation remains TASK-032.2; partner/payment model
      must be clarified before selecting partner-specific registration/credit-line steps.

- [x] TASK-082.4.6: Owner-approved storage-free preview expansion (2026-10-21).
  Reuse existing tenant reporting/direct bounded CSV, WhatsApp development setup/sync,
  text-template workflows and campaign drafts/internal approval. No S3/SMTP/scanner,
  Worker/Scheduler, webhooks, preflight, delivery, Inbox or automation enabled.
  Enforce disabled campaign operations server-side; preserve permissions/tenant isolation.
  Owner authorized local Docker DB testing; use disposable fixtures and mocked Meta only.
  No Railway mutation, paid resources, migration, commit or deployment authorized.
  Implemented using existing modules with service-level background command denial.
  Config10/10, feature unit29/29, disposable PG/Redis12/12, mocked Chromium4/4 pass;
  config/API/Web builds and35-table schema verification pass. See local test report for
  coverage limits and expanded ad-hoc lint findings; no hosted/live-provider acceptance.

Active deployment follow-up (CLAR-067):

- [x] TASK-082.4.5: CLAR-069 mandatory first-login password change implemented for new Tenant
  Admin/User INSERTs. Persisted users flag/default false preserves existing accounts;
  includes creation-path updates, restricted server authorization, dedicated change UI/API
  and atomic password update/session revocation/audit. Existing auth/cookies/layering retained.
  Owner approved revoking all sessions and requiring fresh login. No automatic replacement.
  API/Web lint/typecheck/build, contracts lint/build, observability lint/typecheck/build,
  Worker typecheck, source/metadata format/diff,35-table verifier and Drizzle metadata check
  passed. Generated0009_initial_password_change (10th migration); no hosted migration/deploy.
  Local testing authorized2026-10-19:30 focused unit/regression tests pass; PC01–07
  remain partially covered, not completed. See TEST_PLAN for boundaries.
  Configure approved pre-deploy migration before pushing an auto-deploy release.

  - [-] TASK-082.4.5.2: Owner-approved deferred local tests. Added DTO/service/gate
    coverage and repaired existing auth mock for user locking/refresh owner lookup.
    Focused30/30 and mocked browser3/3 passed. Disposable PostgreSQL/Redis: seven
    scenarios passed (migration, revoke-all, rollback, concurrency, full/preview HTTP);
    former platform provisioning failure repaired under082.4.5.3. Expanded integration
    suite11/11 passed (10 scenarios plus parent), unit30/30 and browser3/3 passed again.
    Wider PC01–07 permutations remain open; see docs/INITIAL_PASSWORD_TEST_REPORT.md.
    No application/hosted DB touched.
  - [x] TASK-082.4.5.3: Owner-approved tenant-role provisioning repair complete2026-10-19.
    role mismatch. Platform creation requests global TENANT_ADMIN and Team requests
    global TENANT_USER, while seed/eligibility use tenant-scoped roles; fresh bootstrap
    only supplies SUPER_ADMIN. Recommend transactional tenant-scoped role/permission
    provisioning and scoped Team role resolution, preserving existing eligibility and
    cross-tenant denial. Add positive creation-to-login/handover and foreign-role tests.
    New TenantRoleProvisioningService reuses SeedRepository/catalog; PlatformService
    orchestrates tenant, scoped Admin/User grants, Admin/membership and audit atomically.
    Team selects its own active system role only. Existing roles/authorization and restore
    flag unchanged. Actual Admin/User creation/login/handover, exact permission sets,
    restore, foreign-role denial and duplicate-email rollback pass. API build/lint,
    schema35/Drizzle check pass. No schema/backfill/deployment or hosted repair performed.
  - [x] TASK-082.4.5.1: Serialize login, refresh and password change by user before session
    writes so an in-flight old-credential login/refresh cannot escape all-session revocation.
    Required for first-login acceptance, not a separate feature. Real shared-lock
    contention and duplicate-change scenarios passed2026-10-19; wider variants pending.

- [x] TASK-082.4.3: Protected first-Super-Admin POST implementation complete, full/preview.
  Optional server secret enables it; email/password only, existing Argon2id and permission
  catalog; atomic all-user (including deleted) empty check, serialized against CLI seed and
  other user inserts; durable audit closure; no tenant/test-account provisioning. Preserve
  layered boundaries, safe responses/logs and existing Origin/cookie policy. Migrations remain
  required. Tests deferred; static checks now. No remote execution/secrets entered here.
  API lint/typecheck/build, config/observability lint/typecheck/build, source format/diff and
  unchanged35-table schema verification passed. No runtime/concurrency tests or hosted POST.
  See docs/FIRST_SUPER_ADMIN_BOOTSTRAP.md and ADR-026; T082-BS01–06 remain pending.
  Hosted checkpoint2026-10-19: owner-approved existing runtime migrations completed in API
  Railway console;35 tables/9 migration records verified read-only. No seed/reset/bootstrap
  POST or account creation performed; owner first-account retry/login still pending.
- [x] TASK-082.4.4: CLAR-068 existing database-only preview administration implemented:
  platform metadata/aggregates, business/Admin creation and status, plans/subscriptions/manual
  payments/redacted audit and existing bounded platform CSV; Tenant Admin team controls.
  Reuse current controllers/services/repos/screens, retain role/tenant guards, no new account
  operations or Super Admin content access. Files/provider/worker/tenant-reporting routes stay
  disabled. No infrastructure/schema/dependency changes; static checks now, tests deferred.
  API/Web lint/typecheck/production builds, changed-source formatting,35-table schema check
  and git diff check passed. Web build needed network retry for existing Google Geist font.
  T082-AD01–04 pending; no tests, cloud deployment or hosted account/payment writes performed.

## Current delivery priority — CLAR-030

Follow `docs/MVP_DELIVERY_PRIORITIES.md`: finish the usable core product on the existing
stack. Next core task is TASK-060, not more Phase 5 stress testing. Shared inbox, basic
automation and essential reporting/admin flows remain in scope. Reuse already implemented
foundations; do not add speculative features, infrastructure or alternative implementations.
Finish real Meta test-account end-to-end validation and focused safety/operations checks
before customer launch. Extended hardening is tracked under TASK-085, not a blocker for
continuing core development. Deferred coverage stays unverified; no task is marked complete
merely because its priority changed.

Testing cadence: finish phase implementation first, recording pending cases during tasks.
At each phase boundary, ask whether the owner wants test files and execution now or deferred
to a later phase. Testing remains optional until all implementation tasks finish. Record the
choice; deferred test items stay pending and do not block next-phase implementation. Revisit
all deferred coverage at the final implementation checkpoint. When approved, run tests, fix
failures, retest, and update case records. Distinguish implementation from verified completion.
Implementation tasks may finish with automated verification explicitly pending. Preserve past
results. See `RULES.md` and `docs/TEST_PLAN.md`.

## Task discovery and follow-up policy

- During implementation, debugging, or approved design work, record newly discovered work before starting it.
- Add required work as a numbered subtask of the active task only when it is necessary for that task's documented acceptance criteria.
- Otherwise, add it as a separately numbered follow-up task immediately after the related task or at the end of the relevant phase, with its dependency and reason recorded.
- A discovered item does not authorize speculative scope, a material product/architecture decision, or parallel implementation. Follow the clarification and approval rules before proceeding where they apply.

## Phase 0 - Planning baseline

- [x] TASK-000: Consolidate product and technical source specifications.
- [x] TASK-001: Define MVP scope, exclusions, architecture, LLD, security, testing, and Railway capacity plan.
- [x] TASK-002: Add project rules, decisions, memory, design system, test plan, environment template, and delivery workflow.
- [x] TASK-003: Define detailed MVP application flows, stage-gated implementation approval, and pre-build readiness mapping.
- [x] TASK-004: Establish the canonical 33-table modular PostgreSQL schema contract, relationship inventory, and scoped soft-delete policy.

## Phase 1 - Repository and local foundation

- [x] TASK-010: Initialize pnpm/Turborepo workspace with `web`, `api`, `worker`, and shared packages.
- [x] TASK-011: Configure TypeScript strict mode, ESLint, formatting, and root scripts.
- [x] TASK-012: Add Docker-based PostgreSQL, Redis, MinIO, and Mailpit development services.
- [x] TASK-013: Implement typed configuration validation and `.env.example` parity test.
- [x] TASK-014: Add structured logging, request IDs, health endpoints, and base error envelope.
- [ ] TASK-015: Configure CI for install, lint, typecheck, unit tests, integration tests, build, and security scanning. Local prerequisites are verified; GitHub automation is owner-deferred.

## Phase 2 - Database, authentication, and tenancy

- [x] TASK-020: Configure Drizzle ORM/drizzle-kit and create the initial PostgreSQL migration from the approved 33-table modular schema contract and LLD.
- [x] TASK-021: Implement database client, transaction helper, outbox repository, and migration workflow.
- [x] TASK-022: Seed Super Admin, Tenant Admin, Tenant User, system permissions, and initial plans safely.
- [x] TASK-023: Implement login, password hashing, access tokens, refresh rotation, logout, and session revocation.
- [x] TASK-024: Implement current-user/session context, session listing and remote revocation, single-business Tenant Admin/User request context, permission guards, Super Admin content denial, and scoped repositories.
- [x] TASK-025: Add cross-tenant, tenant-switching, privilege-escalation, Super Admin content-denial, and aggregate-projection leakage integration tests.
- [x] TASK-026: Implement Super Admin business/Admin/plan/billing administration with purpose-built account metadata, operational-health, aggregate activity, and redacted audit projections only.

## Phase 3 - WhatsApp foundation

- [x] TASK-030: Define internal WhatsApp provider interface and normalized errors.
- [x] TASK-031: Implement Meta adapter configuration and credential references.
- [x] TASK-032: Implement development tenant-WABA-phone persistence through an authorized manual test-asset connection. Production Embedded Signup completion is deferred until the Meta partner model and credential exchange are approved (CLAR-013).
- [x] TASK-033: Implement development-safe account health, phone synchronization, and local disconnect/revocation. Meta synchronization requires the later local/Railway `META_DEVELOPMENT_ACCESS_TOKEN` configuration (CLAR-014); production webhook unsubscription and token revocation remain deferred.
- [x] TASK-034: Implement tenant template synchronization/normalization, separate Admin/provider approval, material-version invalidation, and deterministic preview data.
- [x] TASK-035: Implement raw-body webhook verification and durable event persistence.
- [x] TASK-036: Implement idempotent webhook dispatch and replay tooling.

## Phase 4 - Contacts and Groups vertical slice

- [x] TASK-040: Implement contact schema/repository/service and tenant-scoped CRUD API.
- [x] TASK-041: Execute the approved combined Contacts and Groups vertical slice. The active coordinator task delivers the ordered TASK-041 through TASK-045 outcomes below as one reviewed implementation unit; TASK-046 remains the separate comprehensive security/E2E test task.
  - [x] TASK-041.1: Add the minimal authenticated web client and tenant workspace shell required to reach Contacts/Groups; implement Contacts UI loading, empty, validation, error, delete-confirmation, and cursor-pagination states.
  - [x] TASK-041.2 / TASK-042: Implement static manual Groups only: tenant-scoped CRUD, soft deletion, and explicit Contact membership API/UI. Dynamic/rule-based groups are out of scope.
  - [x] TASK-041.3 / TASK-043: Implement typed consent evidence, opt-out/suppression transitions, and whole-message case-insensitive tenant-wide STOP handling for `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT`; do not auto-re-opt-in on `START`.
  - [x] TASK-041.4 / TASK-044: Implement a 10 MiB/10,000-row secure CSV/XLSX import pipeline with signature validation, ClamAV scanning, protected storage, asynchronous worker processing, and 30-day configurable import-file/error retention.
  - [x] TASK-041.5 / TASK-045: Implement mapping for phone, profile fields, custom fields, consent evidence, and optional existing Group assignment; require a default country for local numbers (India preselected); normalize to E.164; import only the first valid in-file phone; skip/report active existing contacts; preserve row-error reports.
  - [x] TASK-041.6: Package the server-only storage and contact-normalization libraries as compiled runtime dependencies; this was required for the import worker to execute from built JavaScript instead of Node's limited TypeScript stripping mode.
  - [x] TASK-041.7: Repair the pre-existing canonical-schema manifest dependency order exposed by the required disposable PostgreSQL validation. `payment_records` references `users` but was ordered before it; the manifest must remain dependency-valid before the Phase 4 task can be accepted.
  - [x] TASK-041.8: Refresh the stale-job processing lease when an import worker reclaims work, and retain row errors only for terminal jobs. This directly protects the approved asynchronous import reliability/retention acceptance criteria.
- [x] TASK-042: Implement Groups schema, membership rules, API, and UI. Delivered through the approved TASK-041 combined vertical slice.
- [x] TASK-043: Implement consent, opt-out, suppression, and STOP handling. Delivered through the approved TASK-041 combined vertical slice.
- [x] TASK-044: Implement secure CSV/XLSX upload and asynchronous import pipeline. Delivered through the approved TASK-041 combined vertical slice.
- [x] TASK-045: Implement column mapping, E.164 normalization, deduplication, and row-error report. Delivered through the approved TASK-041 combined vertical slice.
- [x] TASK-046: Add Contacts/Groups/import unit, integration, security, and E2E tests.
  - [x] TASK-046.1: Add the approved Playwright + Chromium browser E2E harness for the authenticated Contacts, Groups, consent, and import workspace flows.
  - [x] TASK-046.2: Repair the committed Drizzle migration journal/metadata so the consent and import migrations are actually applied by the runtime workflow; required because real PostgreSQL integration revealed an outdated four-migration database missing `contacts.consent_proof_reference`.
  - [x] TASK-046.3: Repair the worker development command so the full local application can start for worker-backed import E2E coverage; `tsx` no longer interprets the misplaced `watch` subcommand as a module path.
- [x] TASK-047: Replace the API's metadata-incompatible `tsx` development runner with the Nest CLI TypeScript watch pipeline so constructor injection works during local development.
- [x] TASK-048: Document the verified local bootstrap-password reset, destructive infrastructure reset, reseed, login, and post-seed secret-cleanup procedure.

## Phase 5 - Messaging and campaigns vertical slice

- [x] TASK-050: Implement common outbound message composer and policy/quota gates.
  - [x] TASK-050.1: Add the approved backend-only outbound composition boundary for `TEXT` and `TEMPLATE` messages with tenant, authorization, account, contact, consent, service-window, template, subscription, quota, and idempotency enforcement.
  - [x] TASK-050.2: Keep client-key replay tied to the immutable composition policy decision rather than mutable delivery errors, so a later provider failure cannot change the result of the original accepted request.
  - [x] TASK-050.3: Serialize the tenant/client-key claim independently from the calendar-month quota lock so identical requests crossing a UTC month boundary cannot race the unique message key.
- [x] TASK-051: Implement idempotent outbox-to-BullMQ publishing and message worker.
  - [x] TASK-051.1: Atomically create an identifier-only `message.outbound.created` outbox event with each accepted TASK-050 Message.
  - [x] TASK-051.2: Add stale-lock-safe PostgreSQL relay claiming, deterministic BullMQ publication, and atomic `CREATED` to `QUEUED` transition.
  - [x] TASK-051.3: Add the thin message job processor and Service/Repository delivery boundary, disabled by default and failing closed until TASK-052 implements provider delivery and recovery.
- [x] TASK-052: Implement provider response persistence, retries, backoff, and dead-letter handling within the verified provider boundary (numeric-code follow-up: TASK-057).
  - [x] TASK-052.1: Extract the shared server-only provider package and implement TEXT/TEMPLATE sends.
  - [x] TASK-052.2: Revalidate dispatch policy, persist delivery claims/results, and classify bounded retries and terminal failures.
  - [x] TASK-052.3: Add safe private replay, worker activation, and failure/duplicate/recovery tests from TASK-056.
  - [x] TASK-052.4: Correct discovered TASK-051 queries against nonexistent messages.is_deleted and BullMQ IDs containing reserved colons.
  - [x] TASK-052.5: Apply the established metadata-compatible Nest CLI development runner to the worker and execute private replay from compiled JavaScript; required for actual runtime constructor injection.
- [x] TASK-053: Implement campaign draft API/UI, Contacts/static Groups audience selection, and material content versioning. Saved segments are deferred by CLAR-023 to TASK-058.
  - [x] TASK-053.1: Add tenant-scoped draft contracts, Controller-Service-Repository API, transactional audit, and stale-version rejection.
  - [x] TASK-053.2: Add the authenticated Campaign draft UI with audience selection and literal/Contact-field mappings; no preflight/send actions.
  - [x] TASK-053.3: Verify draft/version/approval invalidation, tenant isolation and browser states; update permanent documentation.
  - [x] TASK-053.4: Include the new Campaign feature directory in frontend lint coverage; the existing web command only scans app route files.
  - [x] TASK-053.5: Reset the draft form on explicit reload even when the returned material version/timestamp is unchanged; the stale-edit browser test exposed retained unsaved inputs.
- [x] TASK-054: Implement campaign preflight, recipient snapshot, variable validation, and estimates.
  - [x] TASK-054.1: Persist version-bound asynchronous preflight runs and enqueue them transactionally through the outbox.
  - [x] TASK-054.2: Resolve and deduplicate Contact/Group audiences, validate account/template/variables/consent, replace recipient snapshots, and calculate all-or-nothing quota estimates.
  - [x] TASK-054.3: Add the thin BullMQ relay/processor, authenticated polling API, and Campaign UI loading/result/error states.
  - [x] TASK-054.4: Add unit, integration, security, UI and queue coverage; update permanent documentation and verification evidence.
- [x] TASK-055: Implement User campaign approval, exact-version revalidation, scheduling, expansion, dispatch control, pause/cancel semantics, and reports. Implementation complete; automated verification deferred to the owner's testing checkpoint (TASK-056).
  - [x] TASK-055.1: Persist schedule/timezone and template-version binding; implement audited approval and idempotent lifecycle commands.
  - [x] TASK-055.2: Finalize preflight and compose recipients through the existing MessagingService in durable worker execution; enforce live campaign checks at provider claim.
  - [x] TASK-055.3: Add lifecycle UI and paginated reports; record deferred test cases and run static/build checks.
  - [x] TASK-055.4: Align final preflight parameter rules with the existing delivery adapter and preserve message/recipient state consistency during cancellation and delivery.
  - [x] TASK-055.5: Correct ambiguous PostgreSQL parameter types in the preflight audit insert discovered during final-preflight integration; retain active-user/role predicates.
  - [x] TASK-055.6: Replace the preflight job ID's colon separator, which the installed BullMQ validator rejects, so final-preflight jobs can be published.
  - [x] TASK-055.7: Apply the same verified job-ID correction to delivery webhooks, which campaign delivery/read reports depend on.
- [ ] TASK-056: Phase 5 local testing checkpoint completed with recorded passing results; remaining partial acceptance coverage is pending, not actively blocking TASK-060 under CLAR-030. Preserve `docs/PHASE_5_TEST_REPORT.md`; focused launch-safety closure links to TASK-084/086 and extended stress coverage to TASK-085.
  - [x] TASK-056.1: Correct the PostgreSQL-invalid schema-qualified FOR UPDATE OF generated by the campaign composition gate; real SQL lifecycle/concurrency retests passed.
  - [x] TASK-056.2: Update the database regression inventory assertion to the approved nine migrations and 35 tables; all 10 PostgreSQL regressions passed.
  - [ ] TASK-056.3: Close remaining partial cases in `docs/PHASE_5_TEST_REPORT.md`. Focused safety/user-flow checks must close through TASK-084/086 before customer launch; exhaustive process-kill/race/full-dispatch/month-rollover/deadlock stress belongs to TASK-085 before relevant capacity expansion. Not a prerequisite for TASK-060; local results are not production certification.
- [ ] TASK-057: Verify current Meta numeric error-code mappings against accessible official documentation and add contract fixtures before production delivery rollout. TASK-052 currently uses verified HTTP rejection/Graph transient signals conservatively.
- [ ] TASK-058: Post-MVP, deferred: define and obtain approval for saved-segment audience semantics before implementation. Not required for first release; Contacts/static Groups remain the MVP audience model (CLAR-023/030).
- [x] TASK-059: Correct the existing Contact-import custom job ID for the installed BullMQ separator restriction. Uses `contact-import-{importId}`; worker lint/typecheck/build and formatting passed. Automated transport cases T059-01–04 remain deferred.

## Phase 6 - Shared inbox vertical slice

- [x] TASK-060: Complete inbound contact/conversation/message resolution using TASK-036's single pipeline and approved CLAR-031 policies. Implementation/static verification complete; runtime cases T060-01–09 remain deferred to TASK-065.
  - [x] TASK-060.1: Inspect existing ingestion, normalization, Contact/Conversation upsert, message deduplication, unread/window updates and STOP handling; retain one processing path.
  - [x] TASK-060.2: Implement approved CLAR-031 hold-for-review and invalid-timestamp failure through the existing failure/replay path; retain one pipeline and scope all effects to the persisted tenant/account. Keep transaction/policy orchestration in the service and SQL in the repository.
  - [x] TASK-060.3: Worker lint/typecheck/build passed (10 tasks including dependency builds); document behavior and record deferred T060-01–09 coverage and webhook-double updates. No tests, live Meta calls, migration or inbox UI included.
- [x] TASK-061: Implement conversation list/history/search, unread state, close/reopen, and pagination APIs under approved CLAR-032. Static/build verified; runtime acceptance remains deferred to TASK-065 (T061-01–09).
  - [x] TASK-061.1: Inspect existing Conversation/Message schema, permission catalog, authorization and inbox requirements; reuse existing tenant-scoped API patterns.
  - [x] TASK-061.2: Implement approved shared unread semantics, existing read/close permissions and status-only close/reopen using Controller-Service-Repository APIs/contracts; no UI/reply/assignment scope.
  - [x] TASK-061.3: Record T061-01–09 pending TASK-065 coverage and update API/inbox/security documentation; formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies). No tests or live provider calls.
- [x] TASK-062: Implement agent reply through the common outbound messaging service under approved CLAR-033. Static verification complete; runtime coverage T062-01–09 remains deferred to TASK-065.
  - [x] TASK-062.1: Inspect existing common composer, outbox/worker, permissions, provider capabilities and Inbox contracts; reuse the TEXT/TEMPLATE path without a second send pipeline.
  - [x] TASK-062.2: Implement the tenant-scoped POST conversation reply with strict input/actor-scoped idempotency and common policy/queue handling. Enforce new-reply state guards inside the composer transaction, not a racy endpoint-only check; retain existing failed-policy evidence and accepted inbox activity updates.
  - [x] TASK-062.3: Record deferred T062-01–09 coverage and required existing composer-double updates; update permanent docs. Formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies). No tests/live sends/schema changes.
- [x] TASK-063: Implement assignment and internal notes under approved CLAR-034. Implementation/static verification complete; runtime cases T063-01–08 deferred to TASK-065.
  - [x] TASK-063.1: Inspect existing assigned_user_id, conversation_notes and tenant permission boundaries; reuse the current inbox module/schema.
  - [x] TASK-063.2: Implement approved assignment/unassignment and paginated append-only internal notes with transactional redacted audit, without provider/outbox side effects.
  - [x] TASK-063.3: Document contracts and deferred T063-01–08 coverage; formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies). No tests/live sends/schema changes.
- [x] TASK-064: Implement approved CLAR-035 polling foundation and shared token-refresh protection. Static/build verified; actual UI mounting remains TASK-066 and runtime tests T064-01–10 remain deferred to TASK-065.
  - [x] TASK-064.1: Inspect transport requirements, existing authenticated API client and missing Inbox UI boundary; recommend a bounded polling foundation rather than new push infrastructure for the MVP.
  - [x] TASK-064.2: Implement approved typed Inbox API access and lifecycle-safe refresh support; coalesce concurrent access-token refresh calls because current per-request 401 handling can race refresh-token rotation during polling. Discard protected responses/refresh token updates from a previous login/logout generation.
  - [x] TASK-064.3: Include Inbox and shared client paths in lint/fix commands; normalize HeadersInit correctly. ADR-021/refresh docs record deferred T064-01–10 cases. Web lint/typecheck/build passed (4 tasks including dependency build); no tests run. TASK-066 must mount the foundation before actual UI freshness can be verified.
- [x] TASK-066: Complete the approved Shared Inbox UI and safe assignee endpoint. API/web static verification passed (12 tasks); runtime verification proceeds in TASK-065, not claimed by implementation completion.
  - [x] TASK-066.1: Inspect existing workspace navigation, design system, polling adapter and template/assignment APIs; identify missing safe assignee-options endpoint.
  - [x] TASK-066.2: Build approved layout, minimal assignee endpoint, list/history, composer, controls, notes/assignment and mount existing refresh support. Reuse current server policy and avoid provider/media/automation expansion.
  - [x] TASK-066.3: Run static/build verification, document UI and proceed to the explicitly requested TASK-065 phase checkpoint.
  - [x] TASK-066.4: Fix new Inbox lint warnings without disabling rules. A trial expansion exposed legacy workspace-app debt; keep shared-client scope and lint the entire new Inbox feature. TASK-067 tracks legacy cleanup separately; workspace integration is typechecked/built.
- [-] TASK-065: Local Phase 6 testing checkpoint completed, including TASK-065.3; broader launch/provider/extended acceptance remains explicitly pending under TASK-084/085/086 and `docs/PHASE_6_TEST_REPORT.md`. This is not production certification.
  - [x] TASK-065.1: Fix the real SQL regression where DELIVERED was terminal before READ could advance it; preserve monotonic message/recipient status and avoid late failure metadata on delivered/read evidence. PostgreSQL webhook checks pass.
  - [x] TASK-065.2: Fix dynamic reply/note labels so retained textarea values and dynamically loaded template options do not contaminate exact label lookup; scope browser error assertions to the actual composer rather than Next's route announcer. All seven Inbox browser checks pass.
  - [x] TASK-065.3: Complete the owner-approved local follow-up: API SQL/HTTP 9 cases, webhook SQL 8 cases, Inbox browser 15 cases and shared client 7 cases pass. Covers independent-connection races, audit/outbox rollback, polling/backoff/auth recovery and related security/pagination cases. No production code/dependency/schema change. Live Meta testing is excluded; broader phase acceptance remains explicitly tracked under TASK-084/085/086 and `docs/PHASE_6_TEST_REPORT.md`.
- [x] TASK-067: Resolved all 54 reproduced legacy `workspace-app.tsx` lint findings and enabled complete `features/workspace` lint coverage without weakening rules. Preserved Contacts/Groups/import behavior and made no API/schema/provider change. Format, expanded Web lint, route generation/typecheck, production build and diff checks passed. Automated browser coverage remains deferred under the owner cadence. Next.js 16.4.0 still reports a security-upgrade recommendation requiring separate owner approval.
  - [x] TASK-067.1: Applied the 17 ESLint-safe mechanical void-arrow fixes and manually corrected async event wrappers, deprecated form event types, safe FormData extraction, catch typing and numeric rendering.
  - [x] TASK-067.2: Refactored initial Contacts/Groups loading to asynchronous effect-owned requests and keyed import-error state by import ID, removing synchronous effect resets/dependency warnings without changing polling or pagination behavior.
  - [x] TASK-067.3: Expanded the Web lint scripts from one selected workspace client file to the complete `features/workspace` directory. Focused format/lint/typecheck/production build and diff checks passed; browser coverage remains deferred.

## Phase 7 - Basic automation vertical slice

- [x] TASK-070: Implement flow/version/node/edge/run schema and repositories. CLAR-038; reused five existing tables, no migration required for this persistence slice. Static checks passed; runtime tests pending TASK-075.
  - [x] TASK-070.1: Add tenant-scoped persistence contracts, locked draft/version snapshots and run state repositories; inspect existing constraints before adding migrations.
- [x] TASK-071: Implement draft validation and immutable publication. Authoring API/UI, exact revisions and no-send simulator implemented; static/type/build checks passed, runtime acceptance pending TASK-075.
  - [x] TASK-071.1: Add approved form-based flow/branch editor, readable preview and side-effect-free simulator; no drag-and-drop or raw JSON editing.
- [x] TASK-072: Implement keyword and interactive-response triggers. Persisted-message trigger service and correlated choice logic implemented; worker transport is wired with TASK-073. Runtime acceptance pending TASK-075.
  - [x] TASK-072.1: Persist identifier-only inbound automation outbox handoff atomically; use protected inbound Message policy metadata as the durable processed receipt (never outbound policy mutation), covering unmatched-event replay without a new receipt table or TTL assumption.
- [x] TASK-073: Implement supported MVP nodes and idempotent run advancement. API/worker/provider lint/typecheck/build passed 14 tasks; runtime acceptance pending TASK-075.
  - [x] TASK-073.1: Extend the existing provider-neutral common messaging/delivery path for BUTTONS/LIST and automation provenance; no parallel send endpoint or provider path.
  - [x] TASK-073.2: Wire identifier-only automation outbox/BullMQ adapters to server-only API runtime services, bounded advancement and durable continuation/recovery.
  - [x] TASK-073.3: Retain exhausted transport events for explicit audited operator replay, with all consumers disabled in replay CLIs; repeated events cannot create extra continuation side effects.
- [x] TASK-074: Implement human handoff and automation pause behavior. Phase 7 implementation complete under CLAR-038/039; repository-wide static/build checks passed 30 tasks plus schema/format/diff checks. Runtime acceptance is not yet verified.
  - [x] TASK-074.1: Add Inbox takeover/allow-automation controls and safe runtime reason display using existing UI/permissions.
  - [x] TASK-074.2: Revalidate the existing automation_enabled plan flag at creation/publication/runtime/dispatch, prevent pre-allow queued inbound replay, and hand off on durable message failures without replaying uncertain sends.
  - [x] TASK-074.3: Apply owner-approved CLAR-039 scoped 2 MB automation JSON parser with the existing Express version; preserve raw webhook/default-route parsing and record parser regression coverage for TASK-075.
- [x] TASK-075: Add concurrency, duplicate-event, retry, version-pinning, and handoff tests. Approved local checkpoint completed 2026-10-16: API/database 10, worker SQL/Redis 3, full pnpm check including 29 Chromium cases pass. See PHASE_7_TEST_REPORT.md for exact scope; broader launch/stress/live Meta remain TASK-084/085/086, not certified here.
  - [x] TASK-075.1: Pure graph/DTO/simulator/entitlement and scoped HTTP parser regressions. Seven tests pass; full authenticated large-graph round trip is explicitly TASK-075.4.
  - [x] TASK-075.2: Database/runtime concurrency, receipts, version pinning, retries and handoff acceptance. Eight runtime/concurrency cases pass; controlled pause/takeover-vs-SENDING ordering additionally passes in worker SQL tests. This is representative local coverage, not every possible race permutation.
  - [x] TASK-075.3: Provider/queue and affected Inbox/browser regressions; record phase results. Provider/relay/isolated Redis and five automation + sixteen Inbox browser cases pass; database-backed replay/rollback passes under 075.4.
  - [x] TASK-075.4: Authenticated >100 KB valid-graph save/read/publication, concurrent revision/publication, exhausted-event replay/rollback/no-resurrection, and both dispatch-claim orderings against pause/takeover pass. No live provider or ordinary delivery worker started.
    - [x] TASK-075.4.1: Fixed verified Express size-limit errors being mapped to INTERNAL_ERROR/500 by the shared API error mapper. Narrow entity.too.large/413 shape maps to the existing safe PAYLOAD_TOO_LARGE envelope; unit and full HTTP/default-route regressions pass.

## Phase 8 - Reports, audit, and production readiness

- [x] TASK-080: Implemented essential usage/billing visibility, audit search and basic dashboards under CLAR-040. Reuses existing ledger, tables and manual payment workflow; no gateway/accounting replacement. All 30 lint/typecheck/build tasks and 35-table schema contract pass. Runtime acceptance T080-01–10 remains deferred; implementation completion is not verified/production-ready completion.
  - [x] TASK-080.1: Tenant and separate platform aggregate projections, UTC-month quota/subscription visibility, paginated billing and safe audit search.
  - [x] TASK-080.2: Permission-aware tenant/platform screens and manual payment form using existing recording workflow; no subscription activation on payment.
    - [x] TASK-080.2.1: Validate and lock the selected non-deleted business inside manual-payment recording; missing/deleted targets rejected before writes. TASK-084.2.1 subsequently closed the real-SQL duplicate/race/audit-rollback portion of T080-07.
  - [x] TASK-080.3: Static/build verification and ESSENTIAL_REPORTING.md/permanent documentation; deferred T080-01–10 recorded. No automated tests/test-file changes for this task.
- [x] TASK-081: Implemented bounded campaign/operational CSV exports under CLAR-041 / ADR-023. All 30 configured lint/typecheck/build tasks pass; runtime/security/browser cases T081-01–10 remain deferred, not verified completion or production certification.
  - [x] TASK-081.1: Bounded CSV serialization (10,000 rows / 10 MiB), strict requests, tenant/platform separation, allowlisted projections and audit-before-response.
  - [x] TASK-081.2: Authenticated browser downloads through the existing refresh/session-generation path; campaign and operational export controls.
  - [x] TASK-081.3: Static/build verification, permanent docs and deferred runtime/security/browser cases. Large asynchronous exports remain deferred.
  - [x] TASK-081.4: Keep platform preparation audit platform-scoped and record selected business as identifier-only metadata, so an empty audit report filtered to a nonexistent business cannot fail its audit insert with a tenant foreign-key error. Source-review correction; runtime case remains T081-08.
- [ ] TASK-082: Configure Railway staging services, private networking, variables, health checks, and cost alerts.
  - [x] TASK-082.1: CLAR-042 repository-only staging preparation: root-context Docker builds, explicit service settings and secret-free variable/owner checklist. No cloud provisioning, paid resources, deployment or live Meta sends.
  - [x] TASK-082.2: Separate campaign scheduler deployment entry point while preserving combined local worker; private worker/scheduler health Controller-Service-Repository checks using existing database/queue infrastructure. Runtime verification remains pending.
  - [x] TASK-082.3: All 30 lint/typecheck/build tasks, 35-table schema, format/diff and all three Dockerfile --check validations passed. Guide and T082-01–08 pending cases recorded. Docker --check is not a full Linux image build or runtime test.
  - [-] TASK-082.4: Limited preview deployed2026-10-19 from541ef6d: Web/API/PG/Redis Online, Web-only HTTPS domain and same-origin private API route confirmed by unauthenticated /me denial. API remains private. Migration/seed approval and execution, authenticated roles/cookie checks, replacement and cost/alert controls remain pending. Full staging/customer launch not approved; see MEMORY and RAILWAY_LIMITED_PREVIEW.md.
    - [x] TASK-082.4.2: CLAR-065 limited preview implementation complete: APP_MODE=preview API configuration/module allowlist, existing login/session/manual Contacts/Groups, server-reported UI mode and Super Admin limited notice. Full/local default preserved; workers reject preview through full-only loader. No schema/dependency/cloud/cookie changes. Eight API/Web dependency builds,25 affected static lint/typecheck/build prerequisites,35-table contract and formatting/diff checks passed. Runtime/HTTP/browser acceptance remains unverified; see docs/RAILWAY_LIMITED_PREVIEW.md and T082-PV01–06.
      - [ ] TASK-082.4.2.1: Owner explicitly deferred focused preview tests to start deployment preparation (2026-10-19). No test files or suites authorized; T082-PV01–06 remain pending/unverified. Static results are not runtime acceptance or launch approval.
      - [x] TASK-082.4.2.2: CLAR-066 / ADR-025 same-origin proxy implementation complete: validated fixed /api/v1 Next.js rewrite, paired Web build variables/Turbo cache inputs, lean package config inclusion and deployment guidance. No new service/dependency or cookie/auth/tenant changes. npm contracts build, Web lint/typecheck and both proxy/default production builds passed; config syntax/format/diff checks passed. pnpm runner was blocked by local engine-store permissions; npm used instead. Automated transport/browser tests T082-PV07 and Docker/hosted acceptance remain deferred/unverified. No cloud apply or migration performed.
    - [ ] TASK-082.4.1: Owner-approved repair of Railway API/Web/Worker builds. Missing compiled workspace exports from Railpack app-only commands; staged Dockerfile builder/path, cleared custom build and direct Node entry point per service. CLAR-058 generated approved Web/API domains only, explicit PORT=8080 and Web public API build URL staged (15 total changes). Not applied/redeployed: backend runtime variables/private dependencies still need configuration. No secrets, paid infrastructure, migrations or sends changed. See MEMORY latest entries.
      - [x] TASK-082.4.1.1: All three approved local Docker builds passed: Web2/2, API7/7, Worker8/8 dependency tasks plus production packaging/export exit0; original module errors absent. After owner started Docker Desktop, final metadata inspection confirmed all three non-root node users, work directories and intended production entry points. No cloud apply or application processes. See docs/RAILWAY_BUILD_CHECK.md.
- [ ] TASK-083: Configure production backups, restore test, monitoring, alerting, and incident runbooks.
  - [x] TASK-083.1: CLAR-043 local operations/incident documentation and guarded disposable-only backup/restore tooling; no production objectives or cloud services selected.
  - [x] TASK-083.2: Disposable PostgreSQL dump/restore verified 35 app tables, 9 migrations, synthetic history and primary-key enforcement; both generated databases removed. See docs/PHASE_8_LOCAL_REPORT.md.
  - [ ] TASK-083.3: Owner approves recovery objectives, retention, backup storage/access, monitoring destinations and remotely verifies scheduled backups, restore and alert delivery. Not covered by local tooling.
- [ ] TASK-084: Execute focused pre-launch security review, dependency/container scans and tenant-boundary tests; review remaining safety-critical Phase 5 cases (TASK-056.3) without requiring exhaustive scale/fault permutations.
  - [ ] TASK-084.2: CLAR-043 local checkpoint: write/run reporting/export/health/shared-client/browser and actual SQL boundary tests, build/scan containers, run dependency audit, consolidate duplicate T082 documentation, fix demonstrated defects and record per-case evidence. No live Meta or production actions.
    - [x] TASK-084.2.1: Reconciled the Phase 8 bounded Drizzle `Error.cause` fix and completed the missing PostgreSQL concurrency/audit-rollback coverage. Duplicate/race paths preserve the existing 409 contract; two concurrent same-reference writes persist exactly one payment and one audit; an audit failure rolls back the payment. Focused SQL rerun passed 8/8. The combined script's separate authenticated HTTP fixture hit its known startup timeout and was not changed under this task.
    - [x] TASK-084.2.2: Approved lean pnpm production artifacts and available Node24/Debian updates implemented. All images built, non-root/runtime resolution checked, web PORT/HTTP smoke passed and rescans completed. Each still has 1 critical / 60 high occurrences; no suppressions. See docs/PHASE_8_LOCAL_REPORT.md.
    - [ ] TASK-084.2.3: Review/remediate remaining base OS/bundled npm and dev-toolchain advisories; retain launch blocker until approved resolution. New baseline/dependency choices require approval.
  - [ ] TASK-084.1: Review residual Phase 6 cross-tab refresh/reuse behavior and full authenticated role/tenant/field/consent/template matrices documented in `docs/PHASE_6_TEST_REPORT.md`; local checkpoint coverage does not waive launch-critical checks.
- [ ] TASK-085: Extended hardening/scale checkpoint: execute representative deployed 1,200-user, campaign, webhook, import and worker-failure load plans before expanding to those limits. Track exhaustive Phase 5 process-kill/race/full-dispatch/month-rollover/deadlock coverage here via TASK-056.3. Not a blocker for core development or a prerequisite for limited pilot launch when focused safety and agreed pilot capacity checks pass; larger capacity remains unverified until measured.
- [ ] TASK-086: Complete staging QA, focused safety/initial-workload checks, production checklist, owner launch approval and post-deploy smoke tests. Include the full UI/API/worker/webhook flow using Meta test assets and consented test Contacts, plus remaining critical Phase 5 user-flow checks; no live send is authorized merely by this task description.
  - [x] TASK-086.1: CLAR-043 local evidence report and consolidated owner/deployment/launch checklist recorded in docs/PHASE_8_LOCAL_REPORT.md; remote, Meta, capacity and security gates remain pending.
  - [x] TASK-086.2: Start launch-verification readiness review and map existing local evidence, required launch gates and owner inputs in docs/LAUNCH_VERIFICATION.md. Starting this review does not waive other tasks or authorize deployment/live sends.
  - [ ] TASK-086.3: Execute staging UAT and the complete consented Meta test-asset journey after environment prerequisites and explicit send authorization; record expected/actual results and defects.
  - [ ] TASK-086.4: Review launch-critical security/operations evidence, agree initial workload, obtain owner go/no-go, then perform separately authorized deployment/post-deploy smoke checks.
  - [ ] TASK-086.5: Owner-only local manual walkthrough before friends/sharing/Railway. Startup verified 2026-10-17: Docker healthy, 9/9 migrations, existing active accounts/passwords match all three roles; frontend/API/worker running. No reset/migrate/seed. Owner manual results pending; see docs/LOCAL_MANUAL_WALKTHROUGH.md.
    - [x] TASK-086.5.1: Fixed reproduced InvalidClassScopeException in worker main.ts using await app.resolve(PinoLogger). Watch compilation and actual worker_initialized passed; no business/provider behavior changes. Focused static checks recorded in MEMORY.
    - [x] TASK-086.5.2: Applied the owner-provided neutral/blue design-token system to the existing web shell and screens before the walkthrough. Preserved product copy, flows, permissions and backend contracts; updated shared tokens and design documentation under CLAR-048. Focused format, frontend lint, typecheck and production build passed; automated tests remain deferred under CLAR-026.
    - [x] TASK-086.5.3: Refined the UI to the owner-approved three-reference direction: image-1 dashboard composition, image-2 black/off-white/yellow styling and image-3 grouped fixed sidebar with a responsive drawer. Geist is the sole application font per the owner's final direction. Preserved workflows and permissions; focused format/lint/typecheck/build passed and the live authenticated platform dashboard, computed Geist styles, responsive cards and open/closed drawer were visually verified (CLAR-049). Automated tests remain deferred under CLAR-026.
    - [x] TASK-086.5.4: Matched shared card/button geometry and adjacent-action spacing to the owner's live portfolio while retaining the approved application colors. Standard controls are square, 48 px high with 12×16 px padding; dashboard cards are square 160 px blocks with 24 px padding, 14 px grid gaps and action groups use 12 px gaps. Preserved compact link/navigation exceptions and behavior. Live computed metrics and authenticated rendering verified; format/lint/typecheck/build passed (CLAR-050). Automated tests remain deferred under CLAR-026.
      - [x] TASK-086.5.4.1: Removed the remaining shared 10 px form-control radius so inputs, selects, textareas and form fieldsets match the approved square portfolio geometry. Live audit-form inspection confirmed 0 px input/select/fieldset radius and 48 px control height; textareas share the same token. Format/lint/typecheck/build passed.
    - [x] TASK-086.5.5: Fixed the reproduced Groups/Imports frontend response-contract mismatch: `/groups` is consumed as `{ groups }` in both screens and `/groups/:id/members` as `{ members }`, with a truthful minimal member projection. Preserved the backend contract and UI behavior. Focused format/lint/typecheck/build passed; owner browser retest remains the runtime confirmation because no tenant-authenticated local tab was available to the agent. Automated tests remain deferred.
    - [x] TASK-086.5.6: Fixed `POST /api/v1/groups` returning 500 when PostgreSQL's duplicate-name `23505` is wrapped by Drizzle. The Groups service now recognizes only bounded `Error.cause` chains and preserves the approved `409 CONTACT_GROUP_NAME_EXISTS` contract for create/update. Focused format, API lint, typecheck and production build passed; owner runtime retest remains because no tenant-authenticated local tab was available. Automated tests remain deferred under CLAR-026.
      - [ ] TASK-086.5.6.1: At the next owner-approved test checkpoint, add regression coverage for a Drizzle-style wrapped `23505` during Group create/update. Deferred under CLAR-026.
    - [x] TASK-086.5.7: Applied the owner-approved Railway-derived compact application scale across shared web UI: retained Geist and the existing palette; introduced 14/20 px base/control typography, 40 px desktop controls, 6 px control and 8 px card radii, compact headings/cards/tables/navigation and an 8/12/16 px spacing rhythm; preserved 44 px mobile touch targets and semantic circular/pill exceptions (CLAR-051). Live authenticated dashboard computed styles and visual rendering passed with no horizontal overflow; focused format, web/UI lint, typecheck and production builds passed. Automated tests remain deferred under CLAR-026.
    - [x] TASK-086.5.8: Fixed the reproduced long-page desktop sidebar scroll defect by anchoring the sidebar to the viewport at widths above 1024 px, independently scrolling sidebar overflow and explicitly retaining workspace content in grid column two; preserved the existing responsive drawer behavior. The deployed pre-fix audit page reproduced the sidebar moving from top 0 to -535 px after document scroll; the production bundle contains the desktop-only fixed/100dvh rule. Format, web lint, typecheck and production build passed. Deployment/runtime confirmation remains pending because Railway still serves the pre-fix bundle and no authenticated local session was available. Automated tests remain deferred under CLAR-026.
    - [x] TASK-086.5.9: Applied the owner-approved, research-led 2020s SaaS visual-system refresh across the shared Web shell and feature surfaces: calm monochrome hierarchy, restrained operational green, compact Geist typography, receding navigation, low-contrast borders and consistent 8/12/16 px control/card/overlay geometry. Removed dominant yellow blocks and uppercase presentation while preserving workflows, permissions, contracts and responsive behavior (CLAR-060). Formatting, focused Web/UI lint/typecheck/build and local rendered sign-in geometry/overflow passed. Authenticated feature-screen and narrow-viewport visual acceptance remain for the owner/runtime checkpoint; automated tests remain deferred under CLAR-026. Next.js 16.4.0 reported a security-upgrade recommendation.
    - [x] TASK-086.5.10: Standardized every workspace page on one centered 1,200 px large content container with fluid gutters and a shared alignment/spacing rhythm for sticky headers, page headings, action groups, forms, cards, tables and section transitions (CLAR-079). Preserved compact/mobile behavior, workflows and contracts. Formatting, focused Web/UI lint/typecheck/build and authenticated desktop audit rendering passed: topbar/form/content edges all measured 1,200 px, 24 px section rhythm and no horizontal overflow. Automated tests remain deferred under CLAR-026.
      - [x] TASK-086.5.10.1: Fixed primary-button hover contrast by explicitly retaining white text on the near-black hover background. Secondary, navigation, quiet and destructive hover treatments remain independently scoped.
      - [x] TASK-086.5.10.2: Normalized the screenshot-confirmed legacy overrides: grouped account-page heading content, retained large-container centering for direct toolbars, aligned Profile to the 1,200 px page container, modernized its 840 px readable fieldset surfaces and preserved black primary submits inside secondary action rows. Authenticated Chrome verification passed Overview (topbar/toolbar/cards all 1,200 px), Businesses (header/form/table aligned, no overflow) and Profile (topbar/page both 1,200 px; form 840 px left-aligned; 12 px white fieldsets; black/white submit). Format, Web lint and typecheck passed; production build passed with the existing Next.js security warning. Automated tests remain deferred under CLAR-026.
  - [ ] TASK-086.6: UI completion and acceptance follow-up. The original walkthrough identified missing team/account, WhatsApp setup and template screens; the completed subtasks below now implement those slices. Retain this parent as pending for the explicitly unresolved backend safety review and manual/automated acceptance items; missing-screen wording is historical, not current status. No deferred coverage is waived.
    - [x] TASK-086.6.1: CLAR-054 tenant Templates library/detail/preview implemented with current design and APIs. Search/filter and separate Meta/internal states; static format/lint/typecheck/build passed. Owner authenticated visual review and T086-TPL automated checkpoint pending, not launch certification.
    - [x] TASK-086.6.2: Approved compatible local Marketing/Utility text draft editor/internal review implemented; synced/unsupported templates view-only. No provider submission, content flattening, token input or new backend workflow. Explicit sync confirmation requires permission; no live provider calls executed. See docs/TEMPLATES_UI.md.
    - [x] TASK-086.6.3: CLAR-055 development WhatsApp setup UI implemented: manual test-asset mapping with fixed server credential reference, list/health and confirmed sync/local disconnect. No token input, Embedded Signup, live sends or automatic provider calls. Static/build and mocked responsive checks passed; owner populated manual UAT remains. See docs/WHATSAPP_SETUP_UI.md.
    - [x] TASK-086.6.4: Enforced the existing read-only synchronized-template policy atomically in the repository. Material updates now require provider status DRAFT and no provider template ID, in addition to tenant/version/active checks, so direct API and race paths cannot retain stale provider identity after local edits. Provider identity/sync behavior and the current UI are preserved; no schema, provider call or unlink path. Format, API lint/typecheck/production build and diff checks passed. Automated regression coverage remains deferred to the owner-approved checkpoint.
    - [x] TASK-086.6.5: CLAR-056 mocked UI checkpoint completed: setup suite 12/12, combined affected browser run 36/36 and shared client 10/10 passed. Corrected two test selectors and retested. Exact coverage and remaining edge/provider/backend scope recorded in docs/SETUP_UI_TEST_REPORT.md; not exhaustive launch acceptance. No real sync/sends or customer data mutations.
    - [x] TASK-086.6.6: CLAR-062 local account-management vertical slice implemented. Super Admin Businesses and admins UI reuses atomic tenant + first Admin creation; Tenant Admin Team UI uses the new tenant-scoped list/create Tenant User Controller-Service-Repository path. Server derives tenant/system role, creates membership and redacted audit transactionally, enforces role/permissions and strong initial passwords, and exposes no secret. API/Web typecheck, scoped lint, schema verification, format/diff and production builds passed. T086-USR01–05 automated acceptance remains pending the phase checkpoint; no email/invite/forced-reset claim.
    - [x] TASK-086.6.7: CLAR-063 scoped create-or-restore implemented for Users, Contacts and Groups. Active natural-key matches remain conflicts; one deleted match restores the same UUID transactionally and ambiguous matches fail. User restore applies submitted password/system Tenant User/current tenant membership/ACTIVE state, increments token version and revokes sessions; foreign identity cannot be claimed. Contact profile restore preserves source, consent/suppression/history and deleted memberships; Group memberships also stay deleted. All clear deletion evidence and emit explicit redacted restore audits. Format, scoped lint, typecheck, schema and API production build passed; T086-RST01–05 automated acceptance remains pending.
    - [x] TASK-086.6.8: CLAR-064 Tenant User account controls implemented; owner explicitly deferred automated and manual verification. Tenant Admin Team UI/API can deactivate/reactivate or soft-delete only regular users in the authenticated tenant. Material state changes revoke sessions/increment token version and audit; delete also soft-deletes membership, while repeat delete preserves evidence. Self/Admin/platform/foreign targets are unavailable. Format, scoped lint, API/Web typecheck, schema verification, diff check and both production builds passed. T086-USR06–09 remain pending by owner direction.
  - [x] TASK-086.7: CLAR-052 Campaigns usability redesign implemented: list, five guided steps, authorized sample preview, UTC scheduling, review and saved delivery/report detail. Static/build and responsive owner-authenticated empty/prerequisite checks passed. CLAR-053 focused automated frontend checkpoint passed (see 086.7.2); real-backend populated provider/approval/delivery remains unverified. Templates UI stays separately scoped under 086.6; no provider/rate/cost/sheet expansion.
    - [x] TASK-086.7.1: Implemented persistent step fields and dirty-state guards on close/reload/workspace navigation/sign-out/browser unload, including variable add/remove/clear. Focused workspace callback only; no auth/API changes. Runtime regression coverage remains T086-UX03.
    - [x] TASK-086.7.2: CLAR-053 approved focused automated checkpoint complete: 20 Campaigns + 2 workspace + 4 reporting browser tests and 10 shared-client tests passed. Synthetic preview/approval/report/UTC/draft/role/responsive flows covered. Detailed T086-UX01–07 evidence and residual variants in docs/CAMPAIGN_UX_TEST_REPORT.md; real backend/provider/launch certification not implied.
      - [x] TASK-086.7.2.1: Verified GroupService envelopes and corrected obsolete Groups/members/role browser fixtures only; affected regression rerun passed, assertions retained and backend contract unchanged.

## Explicitly excluded

- Tags.
- Lead CRM.
- AI features.
- White-labeling.
- Public customer API and third-party integrations in the first MVP.
- Unofficial WhatsApp Web automation.
