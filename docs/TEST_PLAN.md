# MVP Test Plan

## TASK-091 — Partner Super Admin local checkpoint

Owner authorized testing under CLAR-082 on2026-10-25. Focused unit/auth, disposable SQL/HTTP
and mocked browser suites passed; see SUPER_ADMIN_TEST_REPORT.md for exact assertions and
remaining gaps. The complete scenario inventory below is not blanket verified:

- T091-01: full/preview real HTTP creation requires existing non-pending Super Admin and
  user.invite; deny anonymous/tenant/foreign/stale/revoked/expired/pending actor and bad Origin.
- T091-02: strict DTO, normalized email, strong password, no role/tenant/status injection;
  reused active/disabled/deleted identities conflict without promotion/restore or PII leakage.
- T091-03: real SQL creates active null-tenant platform identity with existing valid role,
  true handover flag and no membership; audit atomicity/trigger failure rollback; no secrets
  in response, logs, audit or exceptions; hasher/Redis/DB failures fail safely.
- T091-04: concurrent duplicate creates and concurrent creator credential/session changes;
  authentication/email lock order, stale role/status/membership denial and unique conflict.
- T091-05: actual partner login returns restricted /me; workspace/creation denied before
  password change; wrong/reused/weak password denied; handover revokes sessions/version,
  old access/refresh/password fail and fresh login/new password opens platform, never tenant content.
- T091-06: bootstrap remains first-only and existing owners unchanged; tenant creation/
  restore/handover regressions; update obsolete platform-handover rejection expectations.
- T091-07: mocked and real-backed UI sidebar/role denial, labels/strength/errors, confirmation
  cancellation, duplicate-submit/loading, safe success/password clear, retry/lost response,
  unsaved navigation/sign-out/unload, desktop/mobile/keyboard and initial-password journey.

## TASK-086.8 — My Profile checkpoint pending owner choice

Not yet written/run; ask owner to run now or defer. Static checks are not runtime acceptance.

- T086-PRO01: all three roles, full/preview, own projection only, null platform business;
  unauthenticated/pending/inactive/deleted/foreign identity and disallowed-origin denial.
- T086-PRO02: strict name shape/unknown fields/target ID/email/role/tenant overposting,
  trimming/length/control characters; transactional name/audit rollback and safe driver errors.
- T086-PRO03: current password required, wrong/reused/weak password, rate exhaustion/Redis
  outage; ordinary Super Admin change and unchanged initial-handover behavior/errors.
- T086-PRO04: real PostgreSQL revoke-all/version/hash/audit atomicity and rollback; old
  access/refresh/password fail, new login succeeds; concurrent login/refresh/change and
  duplicate change cannot leave an old session alive; safe cookie/log/error redaction.
- T086-PRO05: UI shared role navigation/read-only fields, immediate sidebar name update,
  validation/loading/errors/retry, confirmation/clear, dirty cancellation/navigation/unload,
  mobile layout/keyboard, password success unmount/fresh sign-in, network-loss recovery.

## TASK-032.1/032.2 — combined local checkpoint2026-10-21

Owner-approved combined testing completed: focused35/35, auth+isolated smoke31/31,
disposable PG/Redis13/13, mocked Chromium19/19. WHATSAPP_ONBOARDING_TEST_REPORT.md records
exact assertions, fixture/runner repairs and extended pending cases. Earlier pending lists
below are historical/planned inventory; only report-covered assertions are now verified.
No real Meta/hosted acceptance. Large-WABA paging/coexistence/registration/webhooks and
extended fault/rotation/log matrices are explicitly separate, not silently completed.

## TASK-032.1 — onboarding foundation pending owner test checkpoint

TASK-032.2.1 storage implementation adds pending combined cases: migration10->11 preserves
references/35 tables; storage CHECK rejects mixed/mismatched records; random nonce and
round-trip; tamper/truncated envelope/unknown format/key; cross-tenant/account/credential AAD;
missing/malformed keyring and active ID; retained old-key decryption; no plaintext in DB,
audit/errors/logs; Tenant Admin only/foreign account denial; same-credential reconnect and
audit rollback/concurrency; API and Worker resolver parity, inactive/revoked/disconnected/
deleted-tenant rejection, timeout-safe errors and no environment fallback for ciphertext.
Prior password/database suites' fixed migration-count assertions need updating at combined
test checkpoint (now11 migrations). None of these new cases has run yet.

Owner decision2026-10-21: combine foundation tests with secure signup testing (TASK-032.2).
Do not run a separate foundation suite now. All cases below remain pending, not verified.

No new tests written/run while secure completion has a pending persistence decision.
Pending: full/preview default/mode/config-ID validation and environment template parity;
GET auth/tenancy/platform denial and safe projection; POST manual mapping denied before
writes in embedded mode; config-complete still unavailable; no provider calls on page load;
UI mode loading/error/retry/permissions/form hiding and existing development regression.
Existing mocked WhatsApp browser fixtures must supply /whatsapp/onboarding before that suite
runs; an older API without this endpoint deliberately fails closed rather than assuming dev.
Ask owner whether to run foundation tests now or combine with secure completion checkpoint.

## TASK-082.4.6 — storage-free preview local checkpoint

Owner authorized local Docker tests2026-10-21. Config10/10, focused unit29/29,
disposable PG/Redis12/12 and mocked Chromium4/4 pass. Exact assertions/limitations:
STORAGE_FREE_PREVIEW_TEST_REPORT.md. Wider real-HTTP approval/invalidation, browser-to-DB
and hosted/live-Meta acceptance remain pending. ADR-029 supersedes blanket preview exclusions.

## TASK-082.4.5 initial-password handover — local testing authorized

Latest checkpoint after approved provisioning repair:30/30 unit regressions,11/11
real integration tests (10 scenarios plus parent),3/3 mocked browser tests passed.
Actual Admin/User creation/login/handover, exact catalog permissions, restore,
foreign-role denial and duplicate-email rollback now pass. Existing migration,
revoke-all/audit rollback/concurrency and full/preview HTTP checks remain passing.
See INITIAL_PASSWORD_TEST_REPORT.md for exact evidence and outstanding permutations.
The earlier checkpoints below are historical, not the latest acceptance status.

Owner authorized local test authoring/execution on 2026-10-19. Start with the
password-change flow and affected authentication regressions. Railway, live Meta,
and existing application data are excluded. Cases below remain pending until recorded:

Checkpoint:30/30 focused unit/regression tests passed2026-10-19. Command:
`npm run test:password-change --prefix apps/api`. Includes DTO shape/strength,
service lock ordering/READ COMMITTED setting, wrong/reused password, rate-limit and
outage rejection, stale hash/session/suspended tenant rejection, safe persistence
error mapping, pending authorization gate, existing login/refresh reuse/cookie/me.
These are partial PC02/03/05/07 unit results, not complete acceptance. No real SQL
rollback/session revocation/concurrency, migration, HTTP or UI claims. Docker engine
unavailable; disposable integration environment still required. Browser tests pending.

- T082-PC01: migration false for existing rows, unchanged35 tables/relationships; new platform
  Admin/Team/seed INSERTs true, Super Admin false; restores/idempotent seed retain prior state.
- T082-PC02: pending login/refresh/reload exposes restricted /me, empty permissions/null
  tenant/subscription; all other protected feature/session routes fail PASSWORD_CHANGE_REQUIRED.
- T082-PC03: current password required; strong different replacement, strict unknown-field
  denial, rate limits/Redis outage, inactive/deleted/foreign/non-pending identities denied;
  no password/hash in responses, errors, audit or logs; cookie/origin/CSRF invariants preserved.
- T082-PC04: successful hash/flag/version/revoke-all/audit atomic, cookie expired, fresh login
  required; old access/refresh/temporary password fail, new login works in full/preview.
- T082-PC05: real concurrent login/refresh/change and duplicate change with READ COMMITTED
  and lock order, no old session escapes; membership/status changes, rollback/audit failure.
- T082-PC06: UI labels/keyboard/loading/errors/mismatch/sign-out/reload/success; no workspace
  requests before completion; network-loss-after-commit recovery and stale request generations.
- T082-PC07: update existing auth mocks for owner lookup/lock and first-login E2E seed
  fixtures; regress login/refresh reuse detection/session expiry, old accounts and full/preview.

## TASK-082.4.4 preview DB administration — deferred

CLAR-068 implementation approval retains current test deferral. Pending, not verified:

- T082-AD01: real preview/full module boot; platform and users controllers registered exactly
  once, full default preserved; no S3/Meta/mail/scanner/worker construction or settings needed.
- T082-AD02: Super Admin metadata/aggregate projections only, no Contact/message/recipient PII;
  foreign/inactive/ordinary tenant roles rejected; same-tenant Team permissions/session checks.
- T082-AD03: existing business/Admin create/status, plan/subscription/manual payments, Team
  create/status/soft delete and audit/transaction behavior; no password/hash returned; bounded
  platform CSV safety/privacy; fresh bootstrap with no tenants/plans has clear empty states.
- T082-AD04: platform/Team preview UI navigation/loading/errors/relogin; disabled routes/views
  still inaccessible through direct requests; full/local behavior and cookie/proxy regression.

## TASK-082.4.3 first-Super-Admin bootstrap — deferred

CLAR-067 implementation only; owner test deferral retained. No cases below verified yet.

- T082-BS01: absent/empty secret disables endpoint; short configured secret fails key-only
  validation; malformed/unknown fields and weak password rejected; no values echoed.
- T082-BS02: missing/bad/repeated/oversized secret and foreign Origin rejected before hash/DB;
  correct secret uses bounded existing Redis limiter; Redis failure closed; header redaction.
- T082-BS03: migrated empty DB atomically creates exactly one active platform user, no tenant
  membership/demo accounts/plan, catalog permissions match;201 safe response then normal login.
- T082-BS04: any active/inactive/deleted user, prior completion marker and repeated/redeployed
  request close bootstrap; no reset; no reopening through application soft deletion.
- T082-BS05: parallel requests, multiple instances, CLI seed and ordinary user INSERT race;
  only one bootstrap can commit; permissions/user/audit rollback on injected failures.
  Contended locks time out safely at the transaction-local5-second lock limit.
- T082-BS06: incompatible role, missing migrations, DB outage and existing catalogs normalize
  safely; no SQL/hashes/password/secret leakage; full/preview registration and disabled-route
  behavior; preview platform notice/tenant denial unchanged.

## TASK-082.4.2 limited preview — pending owner checkpoint

CLAR-066 / TASK-082.4.2.2 adds pending T082-PV07: same-origin HTTPS login, Set-Cookie,
refresh rotation/reload/logout, rejected foreign Origin, method/body/query/Authorization
forwarding, upstream error recovery, invalid proxy config, runtime package/private DNS and
full/direct regression. Owner deferred test authoring/execution; not verified by builds.

Implementation approval CLAR-065 does not authorize automated test authoring/execution.
Ask owner at closure; no preview acceptance results yet.

| Case | Pending acceptance |
| --- | --- |
| T082-PV01 | API preview validates real PG/Redis/strong auth inputs without S3/SMTP/Meta; missing/bad core inputs, invalid mode and pool bounds fail with key-only safe errors. Full default retains previous required inputs and .env parity. |
| T082-PV02 | Actual preview Nest bootstrap has only auth/me/Contacts/Groups/health; unsupported endpoints cannot persist uploads/webhooks, enqueue jobs, call Meta or write feature state, including direct HTTP/multipart attempts. |
| T082-PV03 | Login/refresh/logout/session revoke and Contact/Group CRUD/consent/membership retain role/tenant/soft-delete constraints; Super Admin/foreign identities cannot obtain tenant data. |
| T082-PV04 | Worker/consumer/scheduler/replay full loaders reject preview even with otherwise full config, with no Redis/DB/provider effects. |
| T082-PV05 | /me mode drives tenant limited navigation/banner and platform notice; no unsupported requests from preview browser; full mode regression, logout/relogin reset, mobile/keyboard/error states. |
| T082-PV06 | Docker/runtime startup without bucket/mail/provider configuration; isolated migrations/seed/health and actual same-site HTTPS login before hosted acceptance. No production/real sends. |

## TASK-086.6.8 Tenant User controls — owner deferred

CLAR-064 explicitly limits this task to implementation. No automated suite or manual browser/
database mutation is authorized here; the cases remain PENDING for a later checkpoint.

| Case | Pending acceptance |
| --- | --- |
| T086-USR06 | Tenant Admin can deactivate/reactivate only an active, same-tenant regular user; self/Admin/platform/foreign/missing/deleted targets do not disclose or mutate accounts. |
| T086-USR07 | Deactivate/reactivate increments token version, revokes sessions and records one redacted audit only on a material status change; no-op repeats do not duplicate evidence. |
| T086-USR08 | Delete atomically soft-deletes user and matching membership, revokes sessions and audits; repeat delete preserves original deletion evidence and create-or-restore remains valid. |
| T086-USR09 | Team UI exposes actions only for regular users with corresponding permissions, confirms destructive actions, prevents duplicate clicks and refreshes success/error/status safely. |

## TASK-086.6.7 scoped create-or-restore — pending owner checkpoint

No automated suites are authorized during implementation. Static/build checks only.

| Case | Pending acceptance |
| --- | --- |
| T086-RST01 | Active User email, tenant Contact phone or tenant Group name remains a stable duplicate conflict with no mutation or restore audit. |
| T086-RST02 | Exactly one deleted natural-key match restores the same UUID and atomically clears all deletion evidence; zero matches creates normally and multiple deleted matches fail safely. |
| T086-RST03 | User restore derives Tenant User/current tenant membership, hashes the submitted password, activates, increments token version, revokes old sessions and cannot revive foreign/elevated scope. |
| T086-RST04 | Contact restore updates submitted profile fields but preserves consent/opt-out/suppression and does not restore Group memberships; Group restore does not restore memberships. |
| T086-RST05 | Create/restore and redacted audit commit or roll back together under duplicate races; API responses expose neither hashes nor deletion/security evidence. |

## TASK-086.6.6 account-management UI — pending owner checkpoint

No automated suites are authorized during implementation. Static/build checks only.

| Case | Pending acceptance |
| --- | --- |
| T086-USR01 | Super Admin can list businesses and atomically create one business plus exactly one initial Tenant Admin; tenant users cannot call platform creation. |
| T086-USR02 | Tenant Admin can list and create Tenant Users only in the authenticated tenant; Super Admin/Tenant User, missing permission and foreign-scope attempts are denied. |
| T086-USR03 | Duplicate email/slug and invalid email/password/name/timezone/country inputs return safe actionable errors with no partial tenant, user, membership or audit write. |
| T086-USR04 | Created users receive the system Tenant User role, one matching active membership and no elevated permissions; password hashes and audit metadata never appear in responses/UI. |
| T086-USR05 | Loading, empty, retry, validation, duplicate-submit and success-refresh states work at 375/768/1440 widths with keyboard labels and no password retention after success. |

## TASK-086.6 Templates UI — pending owner checkpoint

No new Templates automated suites executed yet. Ask whether to create/run now or defer.

| Case | Pending acceptance |
| --- | --- |
| T086-TPL01 | Tenant permissions/Super Admin denial; filters/loading/empty/error and library usable despite failed account options |
| T086-TPL02 | Text-only draft DTOs match snake_case API keys; optional header/footer roundtrip; unsupported/synced content view-only and not flattened |
| T086-TPL03 | Live/saved preview escapes text, aborts obsolete fetches and reports retry/permission errors; no hidden provider call |
| T086-TPL04 | Dirty close/navigation/sign-out/unload guards, stale-version/input preservation and complete account prerequisite handling |
| T086-TPL05 | Exact-version User request/Admin review, self-review denial, rejection reasons and separate Meta/internal states |
| T086-TPL06 | Explicit permitted account sync confirmation, editor blocks sync, failures retain safe state, no token exposure or Submit to Meta action |
| T086-TPL07 | Keyboard/mobile/tablet/desktop layouts, session/tenant change stale-data clearing and affected Campaign regressions |

## TASK-086.7 campaign redesign — focused checkpoint executed

CLAR-053: owner approved updating/running tests on 2026-10-18. Final affected browser run
passed 26/26 (20 Campaigns, 2 workspace, 4 reporting); shared client passed 10/10. See
`CAMPAIGN_UX_TEST_REPORT.md` for per-case representative evidence, corrected fixture failures
and remaining scope. The broad case inventory below is partially covered, not universally
certified; mocks do not prove backend tenant/approval/provider enforcement.

| Case | Expected result |
| --- | --- |
| T086-UX01 | Five steps preserve fields, selections and mappings; Save draft supports incomplete audience; empty prerequisites are truthful; no implicit delivery |
| T086-UX02 | Invalid hidden-step fields reveal their step; UTC picker validates missing/invalid time; untouched schedule retains exact instant/timezone; edits use UTC |
| T086-UX03 | Dirty close/reload/navigation/sign-out cancel/accept, browser unload and variable add/remove/clear operations preserve intended discard behavior |
| T086-UX04 | Preview uses authorized template endpoint, aborts obsolete requests, reports permission/error/unsupported components, escapes text and never guesses recipient values |
| T086-UX05 | Saved detail alone exposes permitted approval/delivery controls; stale revisions retain input; material edits cancel approval; new results clear stale diagnostic preflight |
| T086-UX06 | List pagination/empty/retry, template/account names, actual status buckets, PII export confirmation/bounds and manual report refresh preserve existing behavior |
| T086-UX07 | Keyboard step focus/navigation, form errors and 375/768/1440 responsive layouts; existing role/tenant denial remains enforced; no provider sends in UI tests |

## Phase 8 local checkpoint authorization — CLAR-043 to CLAR-045

Owner approved local tests, disposable recovery, image builds and Trivy scans on 2026-10-17.
This supersedes earlier local-test deferral wording below, not cloud/live Meta authorization.
See `PHASE_8_LOCAL_REPORT.md` for executed evidence and partial coverage; original acceptance
matrices remain the scope inventory, not a claim that every permutation passed.

## MVP-focused checkpoint policy — CLAR-030

Use `MVP_DELIVERY_PRIORITIES.md` to separate core acceptance/affected regressions from
extended stress certification. Passing local Phase 5 tests allow the next approved core
feature to proceed; partial results below remain partial. TASK-084/086 must close critical
security, approval, consent, idempotency/data-integrity and end-to-end user-flow gaps before
real customer use, including validation with Meta test assets rather than only API doubles.
TASK-085 owns exhaustive scale/outage/race permutations, before expanding to the workload
they certify. Do not run that entire plan at each phase or claim unmeasured 1,200-user capacity.
Keep the existing owner-approved testing cadence and phase-boundary approval requirement.


## TASK-082 deferred acceptance — CLAR-042

All cases are PENDING. Repository preparation permits static/build checks only, not automated
tests, cloud provisioning, migrations/seed or provider sends. Ask at the phase checkpoint.

| Case | Pending result to verify |
| --- | --- |
| T082-01 | Actual Linux builds of all three Dockerfiles with frozen lockfile and dependency order; no local secrets/Git/uploads in context/layers; non-root runtime/package links and compiled migration/seed paths work. Docker --check is not an image build. |
| T082-02 | New consumers start no campaign timer; dedicated scheduler starts no consumers/provider delivery; combined local worker and operator replay-disabled modes retain behavior. Exactly one scheduler process during initial/replacement deployment, or stop-before-start with owner-approved pause. |
| T082-03 | Health Controller-Service-Repository routes/status/unknown methods, PG/Redis loss/timeout/recovery and coalescing; no secrets/raw errors/jobs/customer access. Port bind/collision/bootstrap error/shutdown behavior, no queued/offline probe amplification. |
| T082-04 | Scheduler drain before database shutdown, controlled in-flight tick completion, repeated signals, killed-process recovery and no duplicate delivery; health/listener/queue/pool connections close. Existing messaging/preflight/automation/import/replay regressions remain required. |
| T082-05 | Real staging private PostgreSQL/Redis/scanner and issued HTTPS bucket isolated from production; no public TCP proxies or worker/scheduler/mail UI domains. Real image scanning and pool/Redis/resource budgets verified. |
| T082-06 | Railway PORT/start/workdir/pre-deploy behavior, serialized migrations before consumers, failure gating and explicit conflict-safe seed; no automatic seed/schema mutation or production credentials. |
| T082-07 | Same-site HTTPS domains, Secure/Strict cookie login-refresh-logout, exact CORS, browser public API bundle/cache-key rebuild on URL change, actual proxy/IP throttling trust; no backend secrets in web. |
| T082-08 | Owner-approved plan/project/region/commit/budget, workspace limit scope/outage consent, email threshold/recipient and hard-limit settings recorded with evidence; health/restart/replica settings verified remotely, not assumed from a local manifest. |

## TASK-081 deferred acceptance — CLAR-041

All cases below are PENDING; no tests/test files are authorized during implementation.
Ask at the phase checkpoint before creating/running them. No static check verifies runtime.

| Case | Pending result to verify |
| --- | --- |
| T081-01 | Live role/session/tenant/permission enforcement for every kind; foreign/deleted campaigns/businesses, missing export/read permissions, Super Admin denial of tenant/campaign exports and tenant denial of platform requests. |
| T081-02 | Strict kind/body/filter/UUID/date validation; unknown/array/cursor/limit/business overrides rejected; audit default/frozen/max-90-day ranges and exact filters match the UI. |
| T081-03 | CSV quoting of comma/quote/newline/Unicode/BOM/CRLF; formulas prefixed after whitespace/control/format characters, tab/CR/LF safe, +91 preserved as text; no delimiter/quote breakout. |
| T081-04 | Exactly 10,000 rows allowed, 10,001 rejected; byte boundary includes BOM/header/escaping/multibyte UTF-8; over-limit returns complete JSON error, no partial CSV or successful audit. |
| T081-05 | Actual PostgreSQL recipient joins constrain campaign/contact/message/tenant; soft-deleted Contacts excluded, missing messages safe, codes redacted, timestamps/statuses correct, no content/variables/provider PII outside approved phone column. |
| T081-06 | Payment bigint/currency/reference exact; notes excluded even platform; dashboard/usage definitions unchanged; summaries retain historical delivery counts while details omit deleted Contacts; empty/header-only reports valid. |
| T081-07 | Payment/audit exports include full bounded result across pages, detect extra row, preserve microsecond ties and filters; no silent current-page truncation. |
| T081-08 | Preparation audit only safe kind/scope/count/bytes/actor/request fields and targetTenantId metadata; platform audit stays platform-owned, including nonexistent-business empty filters. Fail closed on audit insert failure; response has CSV/no-store/attachment/length/nosniff/request-ID and errors retain JSON envelope. |
| T081-09 | Blob client shares single-flight refresh/late-401 reuse/generation guards with JSON; logout/login/session switch and body-read errors never download stale data; existing client/auth/Inbox polling regressions. |
| T081-10 | Browser actual download/CSV contents, PII confirm/cancel, busy/error/retry/empty/oversized states, no auto-download on stale filter/business/unmount, Blob URL cleanup, applied audit filters, note exclusion, responsive/keyboard behavior. |

## TASK-080 deferred acceptance — CLAR-040

All cases below are PENDING. No test files changed and no automated tests run during
TASK-080 implementation. Ask at the phase checkpoint before writing/running these suites.

| Case | Pending result to verify |
| --- | --- |
| T080-01 | Tenant dashboard/usage/payment/audit and all platform paths enforce live role, tenant and individual permission; no new User grants, tenant switching or Super Admin content bypass. |
| T080-02 | Counts match documented inventory/month/current-status definitions and exclude deleted current entities without losing retained Message/usage history. Active Admin count requires matching active membership/role/tenant. |
| T080-03 | SUM of reserved ledger quantity matches composer UTC month; duplicates/failures/deleted Contacts retain reservations; zero/null/invalid limit, absent/expired/future/suspended/overlapping subscriptions produce correct safe display. |
| T080-04 | Tenant payment response never contains operational note; platform can read permitted note; bigint minor units remain exact and currencies are never mixed. |
| T080-05 | Audit projections never serialize raw metadata/before/after/entity IDs/PII/payloads. Exact action/actor/result/business filters, defaults and <=90-day boundary work with malformed dates/cursors/arrays/unknown keys rejected. |
| T080-06 | Audit/payment/business pagination preserves microsecond timestamp + UUID ties, filters, tenant/soft-delete isolation, first/next navigation and empty pages. |
| T080-07 | Existing manual record path validates/locks selected business, permits suspended but not deleted/missing targets, rolls back with audit failure, retains reference uniqueness and changes no subscription/quota. Verify duplicate/race/uncertain retry error mapping against real Drizzle. |
| T080-08 | Browser loading/empty/validation/error/retry/success/permission states; 401/403 clearing, abort/stale scope guards, session/user/business switching and no hidden Contacts/Inbox requests for Super Admin. |
| T080-09 | Payment form minor-unit validation, UTC input, confirmation, duplicate-click prevention, failed-input preservation, note privacy and successful history refresh; no provider/gateway call. |
| T080-10 | 375/768/1440 widths, keyboard/labels/focus/tables and affected authentication/Contacts/Inbox/Campaign/automation regressions. Check actual SQL and DTO serialization, not only doubles/static build. |

## Phase 7 local acceptance — CLAR-038

Owner approved TASK-075 local testing on 2026-10-16. Approved local checkpoint is complete; see
[PHASE_7_TEST_REPORT.md](PHASE_7_TEST_REPORT.md) for executed assertions and remaining cases.
The table is the acceptance inventory, not a claim that every exhaustive variant has passed.
TASK-075.4 now has passing actual authenticated large-graph HTTP, concurrent revision/
publication, database-backed replay/audit rollback and controlled SENDING claim-vs-control
evidence. A size-limit error-mapping defect was fixed and retested. See the report for
exact commands and safety boundaries; broader launch/stress remains TASK-084/085/086.

| Case | Expected result |
| --- | --- |
| T070-01 | Tenant/active-parent scoping, same-version edges/run node, locked revisions and atomic audit; no hard delete/history overwrite. |
| T071-01 | Structural/configuration limits, reachability/cycle checks, no ambiguous keywords, immutable versions, concurrent save/publish conflict and active member checks. |
| T071-02 | Form editor/preview/simulator states, permission denial, mobile/keyboard navigation and stale-save recovery; simulation never sends or mutates customer data. |
| T072-01 | Persisted inbound/outbox atomicity, duplicate events, reserved STOP precedence, account isolation and current-choice correlation. |
| T072-02 | While waiting, active entry keywords and stale choices are ignored; unrelated free text hands off once without a fallback send or competing run. |
| T073-01 | All eight nodes, deterministic side effects, 10-step continuation, restarts/retries, pinned versions, window/consent/plan/quota/publisher checks. |
| T074-01 | Explicit handoff/allow, pause/reactivate, queued-vs-claimed races, no automatic resume, permanent failure reasons and human reply ownership. |
| T075-01 | Local end-to-end regression/concurrency and provider doubles; live Meta remains separately authorized. |
| T075-02 | CLAR-039: valid >100 KB graph accepted under automation's 2 MB limit, oversized body rejected, other routes retain defaults, named wrapper leaves Meta raw-body HMAC verification unchanged. |
| T075-03 | Existing automation_enabled flag enforced at create/publish/reactivate/trigger/runtime/dispatch; disabled plans retain read/edit/history without sending. |
| T075-04 | Correlated choice arriving before provider acceptance persistence retries without losing the receipt; stale/unmatched/pre-allow events cannot start/advance runs on replay. |
| T075-05 | Text sequences preserve composition order, permanent/async failure hands off, SENDING ambiguity never resends; quota-month timestamp is consistent. |
| T075-06 | Exhaustion/replay and queue tampering re-resolve persisted event identity on both success/failure paths; malformed envelopes cannot stop a different run or leak log content. |
| T075-07 | Automation authoring clears protected snapshots on terminal auth errors, preserves failed-save inputs, shows readable content/history and responsive keyboard-safe controls. |
| T075-08 | Existing Inbox/browser/webhook SQL doubles must be updated for automation status, inbound/status outbox effects and shared provider capability; previous Phase 6 PASS does not verify these changes. |

## Phase 6 checkpoint — 2026-10-16

Owner authorized TASK-065 after TASK-066. See [PHASE_6_TEST_REPORT.md](PHASE_6_TEST_REPORT.md)
for passing PostgreSQL, browser and affected regression commands, discovered fixes, and the
expanded TASK-065.3 concurrency/polling/recovery results. Tests include disposable-database
real transactions and authenticated HTTP boundaries, browser API doubles and isolated
client-source tests. Broader launch/scale/provider acceptance remains TASK-084/085/086;
these are not all certified by the local checkpoint. Earlier deferred statements below are
historical task records, not evidence that all listed scenarios have now passed.

## Phase 5 checkpoint — 2026-10-15

Owner authorized tests before TASK-060 (CLAR-029). Local PostgreSQL lifecycle/concurrency,
worker delivery/Redis transport, unit/provider-double and Chromium checks are recorded in
[PHASE_5_TEST_REPORT.md](PHASE_5_TEST_REPORT.md). That report is the current per-case result
record; earlier deferred descriptions below are historical. Partial scenarios remain pending
under TASK-056.3 and must not be described as fully verified.

## Quality gates

Owner instruction (2026-10-13): defer test-file creation/updates and automated testing until
phase implementation is complete. This supersedes earlier per-task testing and full-suite
pre-commit guidance. Preserve existing tests and historical results; explicit owner requests
may authorize earlier testing.

Record pending scenarios during each task and run relevant static/build checks (formatting,
lint, typecheck, schema validation, build). Report deferred automated verification as pending.
At each phase boundary, ask the owner whether to create/update test files and run tests now,
or defer testing to a later phase. Wait for the answer before testing. Test authoring and
execution remain optional until all implementation tasks finish; recorded deferral permits
continuing next-phase implementation. Keep deferred test tasks pending and record the decision,
coverage, and intended checkpoint. At the final implementation checkpoint, revisit all deferred
coverage with the owner. When approved, write full coverage, execute suites, fix failures,
retest, and update records.

Maintain records here or in linked phase reports with case ID, scenario, expected result,
actual result/status (`PENDING`, `PASS`, `FAIL`, `BLOCKED`), command/date, defect/task reference,
and retest result. Distinguish implementation completion with deferred tests from verified
completion. Deferred tests are never passing evidence or proof of production readiness.

When phase testing is approved, run the relevant subset of:

1. Formatting/lint.
2. Type checking.
3. Unit tests.
4. Integration tests.
5. Contract tests.
6. End-to-end tests.
7. Production build.
8. Security and dependency checks.

The complete local quality gate is `pnpm check`. It runs schema verification, formatting,
linting, type checking, unit tests, the production build, and Playwright Chromium browser
tests in that order. The production build runs before browser tests because the isolated
browser server uses `next start` against the built application. Run `pnpm test:e2e` to
execute only the browser suite.

PostgreSQL foundation coverage runs separately with `pnpm schema:test:integration` after
Docker PostgreSQL is healthy. It applies migrations through the real runtime command and
checks migration idempotency, the 35-table inventory, transaction commit/rollback, atomic
outbox persistence, and bootstrap seed idempotency. Seed coverage verifies the three role
identities, single-tenant memberships, exact rerun behavior, audit deduplication, and
password-hash preservation inside a transaction that is always rolled back. This
database-mutating suite must use development or isolated test credentials, never
production.

Playwright browser tests live in `tests/e2e/`. They route authenticated workspace API calls
to deterministic in-browser test doubles, so they cover the Contacts, Groups, consent, and
import user flows without a live Meta account, real credentials, or customer data. Service
and PostgreSQL integration tests separately verify the real authorization, tenancy, and
persistence paths. Until GitHub CI is explicitly enabled, contributors run `pnpm check` locally
at an owner-approved testing checkpoint rather than for each task, commit, or push. The current `pnpm test` command includes the API integration suite. The
local production dependency gate is `pnpm security:audit`; `pnpm security:audit:all`
also scans development tooling and is used to track toolchain advisories. CI must run
these approved local commands when TASK-015 resumes.

## Critical suites

### Authentication and tenancy

- Valid/invalid login and refresh rotation.
- Revocation after logout, password reset, and token reuse.
- Absolute refresh-family expiry is unchanged by rotation; the browser cookie is HttpOnly,
  SameSite=Strict, auth-path scoped, and Secure in production.
- Login throttling covers normalized email and client IP, fails closed without Redis, and
  does not distinguish an unknown account from other rejected credentials.
- Protected routes reject unauthenticated users.
- Protected-route tests prove that expired/revoked sessions, inactive principals,
  permission gaps, token/tenant mismatches, and Super Admin tenant-content attempts fail.
- Session-revocation tests prove actor ownership in the query, family-wide revocation,
  immediate access-token invalidation, and redacted audit evidence.
- Client A cannot access Client B records, files, exports, queues, or realtime events.
- Super Admin, Tenant Admin, and Tenant User access is permission checked and audited.
- Tenant Admin and Tenant User each resolve exactly one active business membership; no body/header/query tenant ID or UI action can switch them to another business.
- Super Admin can read only approved account metadata, billing, operational health, aggregate contact/campaign/message/send metrics, and redacted audit metadata.
- Super Admin is denied contact list/detail/import-row data, conversation/message history, recipient-level campaign results, customer media and signed downloads, raw webhook/provider payload content, content search, detailed exports, and tenant-content realtime channels.
- Administration DTOs and audit snapshots do not leak phone numbers, email, custom fields, notes, consent evidence, message bodies, rendered variables, recipient identifiers, media URLs, or payload fragments.
- No Super Admin break-glass content route or screen exists in the MVP.
- User campaign/template approval requires a different active Admin in the same tenant and records the exact current content version.
- Material User edits invalidate approval; stale approval, self-approval, cross-tenant approval, direct endpoint bypass, queued-job tampering, and worker replay cannot submit/use a template or schedule/send a campaign.
- Admin-created or materially Admin-edited work proceeds without a second internal approver, while all Meta, policy, quota, and provider gates still apply.
- Contact/Group CRUD, permitted inbox replies, tracking, and other granted routine User operations do not incorrectly require approval.
- TASK-025 proves the currently implemented authorization foundation with two seeded tenant
  workspaces: mismatched tenant claims fail authentication; a Tenant User lacks
  `campaign.send`; a caller cannot revoke another user's session; Super Admin cannot
  obtain tenant repository scope; and the Super Admin `/me` projection excludes other
  tenant names and Admin emails. The domain-specific customer-content endpoint matrix is
  extended as Contacts, campaigns, inbox, media, exports, jobs, storage, and realtime
  modules are implemented.

### WhatsApp onboarding and webhooks

- Supported account completes onboarding and synchronization.
- Provider credentials never reach browser responses or logs.
- The development-only connection route permits only an active Tenant Admin with
  `whatsapp.connect`, persists its WABA/phone mapping and opaque credential reference
  atomically with redacted audit evidence, rejects a raw credential value, and does not
  enable production Embedded Signup before its partner model is approved.
- Account sync reads only the configured tenant's persisted WABA/phone mapping through
  the server-side development credential reference, records safe health metadata outside
  the provider call transaction, and maps credential failures to actionable account
  states. Local disconnect blocks future sends and preserves history without attempting
  an unapproved destructive provider operation.
- Template synchronization normalizes paginated provider templates without storing raw
  provider payloads; provider status remains distinct from internal approval. User
  material edits increment the version and invalidate approval, self-approval and
  stale/cross-tenant review fail, and preview data is derived only from tenant-scoped
  normalized components.
- Webhook verification returns Meta's plain-text challenge only for the configured token;
  invalid tokens and signatures are rejected before a payload is read or persisted.
- A valid signature is calculated over the exact received bytes, and the verified JSON
  delivery is persisted once using its raw-body SHA-256 dedupe key. A duplicate receipt is
  acknowledged without another durable event; no webhook payload or secret enters logs or
  Super Admin projections.
- Duplicate and out-of-order events do not duplicate or regress business state.
- Stored events can be retried and replayed safely.
- Webhook outbox claims use one worker ownership token; duplicate queue dispatch does not
  duplicate inbound messages, contacts, conversation counters, or state transitions.
- Webhook failures retry five times with the approved exponential schedule before `DEAD`;
  private replay returns only eligible `FAILED`/`DEAD` records to durable dispatch.
- A Meta `deleted` status remains in the protected raw event and never regresses a stored
  message state before a reviewed schema change.

### Contacts and Groups

TASK-059 deferred transport cases (all `PENDING`; run only at an owner-approved checkpoint):

| Case ID | Scenario and expected result |
| --- | --- |
| T059-01 | Enqueue an import with `contact-import-{importId}`; BullMQ accepts the custom ID. |
| T059-02 | Repeat publication of the same durable import; deterministic job identity avoids duplicate work. |
| T059-03 | A previously failed publication is retried by the existing outbox relay after the worker restarts. |
| T059-04 | Queue payload remains identifier-only; retry/backoff, tenant resolution and import outcomes remain correct. |

- Tenant-scoped contact CRUD and phone normalization.
- Manual Contacts accept E.164 or an Indian local number normalized with `+91`; malformed
  numbers return a stable validation error and duplicate active phones return
  `CONTACT_PHONE_EXISTS` without an implicit merge.
- Contact create/update validates that an optional assignee is an active Admin/User from
  the same tenant; cross-tenant contact reads, updates, assignments, and deletes fail.
- Manual Contacts begin with `UNKNOWN` consent, and delete is an audited soft delete.
- Group creation and membership cannot cross tenants.
- Consent, opt-out, suppression, and STOP processing.
- CSV/XLSX mapping, deduplication, invalid rows, progress, and report.
- Large imports remain asynchronous and bounded in memory.

### Campaigns and messages

TASK-055 automated coverage is deferred; no test files were created or tests executed for this
task. At the owner's checkpoint, record commands/date, results, defects and retest outcomes.
All cases below are `PENDING`:

| Case ID | Scenario and expected result |
| --- | --- |
| T055-01 | User submission and different Admin approval/rejection require exact version/revision and rejection reason. |
| T055-02 | Self-review, User review, Super Admin and cross-tenant commands/reports are denied. |
| T055-03 | Schedule/timezone/material edits invalidate approval; equivalent ISO offsets preserve it. |
| T055-04 | Template edits block approval; save/new review binds the new material/template version. |
| T055-05 | Concurrent/retried starts compose each recipient once; changed request with the same key conflicts. |
| T055-06 | Final preflight is mandatory; failures block sends; scheduled campaigns recheck when due. |
| T055-07 | Outbox/worker/batch restarts recover without orphan or duplicate messages. |
| T055-08 | Full remaining quota is checked under the common lock; competing usage pauses expansion. |
| T055-09 | Pause/cancel serialize with SENDING claims; unclaimed work stops and claimed work may finish. |
| T055-10 | Paused jobs delay without provider attempts; resume rechecks policy and continues. |
| T055-11 | Opt-out, deleted records, revoked memberships/permissions and tenant/plan suspension block delivery. |
| T055-12 | Reports show current message states, reasons, pagination, timestamps and terminal history. |
| T055-13 | Browser review/schedule/confirmation/error/recovery states work at responsive widths. |
| T055-14 | Large audiences, multiple schedulers, deadlock recovery and UTC-month rollover preserve invariants. |
| T055-15 | Cancellation preserves usage/history; ambiguous SENDING is never blindly resent. |
| T055-16 | Preflight and webhook custom IDs pass the installed BullMQ validator; replay/publication remains idempotent. |


TASK-053 adds seven draft unit tests and three rollback-only PostgreSQL tests via
`pnpm --filter @whatsapp-platform/api test:campaigns:integration`. Coverage includes
User/Admin approval state, material invalidation, metadata preservation, stale revision/
version, tenant/deleted-reference isolation and atomic audit rollback. Campaign browser
tests cover mobile create/edit, mapping sources, failed-list recovery, stale-input
preservation and read-only/missing-options presentation. No sends are performed.

TASK-052 adds fake-response provider contract tests and worker tests for claim/acceptance
ordering, accepted duplicates, acceptance-persistence gaps, live dispatch policy,
bounded retries, Retry-After, permanent failure and template parameters. Real
PostgreSQL/Redis coverage runs with
`pnpm --filter @whatsapp-platform/worker test:messaging:integration`: persisted
acceptance, exhausted failure, tenant-safe single audited replay/outbox, live opt-out,
duplicate queue publication and new replay generation. Database fixtures roll back;
Redis uses a unique test prefix. No real Meta sends occur.
The real BullMQ processor also verifies service-directed retry delays and immediate
permanent-failure termination.

- The common outbound composer rejects Super Admin, missing source permissions,
  cross-tenant targets, inactive tenants/subscriptions/plans, disconnected accounts or
  credentials, deleted/opted-out/suppressed Contacts, closed-window text, unapproved or
  stale templates, invalid variables, and exhausted monthly quota.
- Accepted composition atomically creates one `CREATED` Message, one usage reservation,
  one identifier-only `message.outbound.created` event,
  and redacted audit evidence. Policy blocks against valid tenant resources persist one
  `FAILED` Message with a stable block code and no usage event.
- Identical tenant/client-key replay returns the existing Message and consumes no quota;
  key reuse with different normalized input conflicts. Later delivery errors cannot alter
  the immutable composition result used for replay.
- Preflight validates account, template, recipient, consent, variables, media, and quota.
- Durable preflight is identifier-only in Redis, idempotently reuses an active run, deduplicates
  Contact/Group overlap, persists explicit recipient skip reasons, supersedes stale material
  versions, exposes aggregate-only polling results, and blocks rather than truncates over quota.
- Duplicate campaign-start requests send once.
- Browser closure does not stop processing.
- Pause/cancel affects only work that can still be stopped.
- Retryable failures recover without duplicate messages.
- Permanent failures stop retrying and expose an actionable error.
- A User campaign cannot schedule/send until its exact current material version is Admin-approved.
- Audience, content/template, variable, account, or schedule changes by a User invalidate prior approval and require reapproval.
- User template creation/material edits require Admin approval before Meta submission or campaign use; Meta approval is tested separately.

### Shared inbox and automation

TASK-064 cases remain PENDING for TASK-065, with actual screen integration in TASK-066.
No automated tests or test files are changed during this task. Include the changed shared
authentication client in the existing login/Contacts/Campaign regression coverage.

| Case | Pending scenario / expected result |
| --- | --- |
| T064-01 | Eligible mount and 15-second-after-completion refresh; hidden/offline/disabled Inbox has no periodic requests. |
| T064-02 | Slow loads plus timer/focus/manual/local-action triggers coalesce, never overlap; callback uses GET only. |
| T064-03 | Context/selection/session changes and unmount abort requests; late responses cannot expose previous-key data. |
| T064-04 | Focus/visibility/reconnect refreshes immediately; disposal removes all timers/listeners, including React development remounts. |
| T064-05 | Transient failures retain last complete data, back off 30/60 seconds and reset after success; failed combined reads cancel siblings. |
| T064-06 | Non-retryable 4xx stops; 401/403 clears protected data and requires recovery, with no infinite refresh loop. |
| T064-07 | Concurrent same-runtime 401s share one token refresh; delayed old-token 401 reuses the new token; failed rotation clears token. |
| T064-08 | Login/logout generation changes reject old protected responses/refresh results; cookie-authenticated logout revokes normally. Review cross-tab rotation separately before launch; not implemented here. |
| T064-09 | Existing request callers and all HeadersInit forms retain behavior; abort propagates to GET, without cancelling another caller's shared rotation. |
| T064-10 | TASK-066 actually mounts the hook with user/tenant/filter/selection key, preserves drafts/pagination and invokes refresh after actions; measure multi-user request volume before rollout. |

TASK-063 cases remain PENDING for TASK-065; no test files changed or automated tests run
during implementation. Include collaboration in the later Shared Inbox UI tests (TASK-066).

| Case | Pending scenario / expected result |
| --- | --- |
| T063-01 | Super Admin, missing read/assign/reply permissions and foreign/deleted-Contact conversations are denied; role/tenant fields cannot be injected. |
| T063-02 | Assignment accepts only active same-tenant Admin/User or explicit null; missing/deleted/inactive/foreign member fails with generic assignee error. |
| T063-03 | Assign/unassign updates only assignee/time plus redacted audit; same-assignee retry produces no audit; status/unread/Contact assignment/window/automation stay unchanged. |
| T063-04 | Strict UUID/plain-text 1–4000 limits and unknown-field rejection; author/tenant/time are server controlled. |
| T063-05 | Exact concurrent note retry creates one row/audit; changed author/conversation/text or foreign ID collision yields generic conflict without data leakage. |
| T063-06 | Notes pagination preserves timestamp/UUID order/precision and tenant/deleted-Contact visibility, including inactive-author history. |
| T063-07 | Assignment and note writes roll back with audit on failure; all conversation statuses permit internal work without reopen/send/handoff. |
| T063-08 | No outbound Message/outbox/job/Meta call or unread/activity/window changes from notes; future UI renders note text safely and offers no edit/delete operation. |

TASK-062 runtime cases are PENDING under TASK-065. Update existing INBOX composer repository
doubles for lockInboxState/touchInboxActivity at that checkpoint; no test files were changed
or tests run in TASK-062, and prior passing composer results do not verify the new state guard.

| Case | Pending scenario / expected result |
| --- | --- |
| T062-01 | Deny Super Admin, missing read/reply permissions, foreign/hidden Contact/Conversation; reject injected routing/source fields. |
| T062-02 | Strict TEXT/TEMPLATE validation and unsupported types; exact template approval/parameters use common policy. |
| T062-03 | Closed/archived or ACTIVE-automation new replies persist a stable policy block without quota/outbox; explicit reopen/handoff is required. |
| T062-04 | Accepted text/template creates one Message/reservation/audit/outbox and activity update; unread/window/assignment/automation stay unchanged. |
| T062-05 | Same actor/key replay, concurrent duplicate calls and changed target/content conflicts; other actors have isolated key namespaces. |
| T062-06 | Accepted replay after thread close returns the existing result; blocked key replay remains blocked even after correction. |
| T062-07 | Account/consent/window/plan/quota policy blocks retain FAILED evidence; no direct provider call or duplicate queue path. |
| T062-08 | Atomic rollback on persistence failure and composition/close concurrency; preserve common message-key/quota/Conversation lock order. |
| T062-09 | Existing worker revalidation/retry/acceptance ambiguity and policy regressions pass with provider doubles; no live sends. |

TASK-061 cases are PENDING under TASK-065; static verification does not certify SQL/runtime
behavior. No test files are changed or automated tests run in this implementation task.

| Case | Pending scenario / expected result |
| --- | --- |
| T061-01 | All list/detail/commands deny Super Admin, missing permissions and foreign tenant IDs; deleted Contact history remains hidden. |
| T061-02 | Literal case-insensitive name/phone search, status/account/unread filters and limit bounds; reject unknown/array/malformed inputs. |
| T061-03 | Cursor pagination preserves timestamp precision and UUID ties, handles null activity; GET never mutates unread or calls Meta. |
| T061-04 | History is tenant/conversation scoped, newest stored first; no policy, secret or raw webhook envelope exposure. |
| T061-05 | Mark-read validates boundary ownership; later inbound arrivals stay unread, repeated/older acknowledgements never increase counts. |
| T061-06 | Mark-unread preserves existing count, flags inbound threads at one and leaves outbound-only/empty threads at zero. |
| T061-07 | Close/reopen requires both permissions, changes status only; assignment/window/unread/automation and queued messages remain unchanged. |
| T061-08 | State and redacted audit commit/roll back together; no-op repeats do not duplicate audit. |
| T061-09 | Concurrent inbound processing/read/close operations serialize on Conversation without lock-order deadlocks; later inbound reopens per TASK-060. |

TASK-060 implementation cases below are PENDING under TASK-065; no test files were updated
or automated tests run during TASK-060. Update existing webhook service doubles for the
service-owned transaction callback, account lookup and required phone metadata before
rerunning them; older passing worker results do not verify this changed implementation.

| Case | Pending scenario / expected result |
| --- | --- |
| T060-01 | New sender creates UNKNOWN-consent Contact, one account-scoped Conversation and one inbound Message atomically. |
| T060-02 | Existing Contact profile/consent and Conversation assignment/automation state are preserved; closed thread reopens. |
| T060-03 | Repeated/concurrent provider IDs create one message/unread/STOP audit effect; owner/direction collisions fail without writes. |
| T060-04 | Deleted-only sender fails with INBOUND_CONTACT_REVIEW_REQUIRED; no recreation/restoration/window or sibling-event writes. An existing active replacement is reused. |
| T060-05 | Missing/empty/non-integer/non-positive/out-of-range timestamp fails with INBOUND_TIMESTAMP_INVALID; raw event retained and no processing-time window. |
| T060-06 | Out-of-order valid inbound timestamps never regress last activity or reply window. |
| T060-07 | Persisted tenant/account and every message change phone metadata must agree; status events cannot mutate another account/tenant or inbound Message. |
| T060-08 | Whole-message STOP remains tenant-scoped, consent never auto-opted-in; replay after legitimate recovery uses existing FAILED/DEAD tooling. |
| T060-09 | Any write failure rolls back Contact/Conversation/Message/STOP/completion as one unit; safe error recorded through the processor and bounded retry path. |

- Inbound messages reach the correct conversation exactly once.
- Free-form/template composer rules are enforced in UI and backend.
- Authorized agent reply uses the common outbound pipeline.
- Assignment, notes, unread, close, and reopen behave correctly.
- Published automation versions are immutable and pinned to active runs.
- Concurrent/duplicate events advance a run once.
- Human handoff prevents unwanted automated replies.

## Responsive and accessibility checks

2026-10-18 CLAR-056 checkpoint: setup browser suite 12/12 passed, affected combined run
36/36 and shared API client 10/10. See SETUP_UI_TEST_REPORT.md for per-scenario coverage.
This is partial execution of T086-TPL, not blanket completion; session/tenant UI transitions,
authorization-error clearing, unsupported shape combinations and other listed residual cases
remain unverified. No live Meta validation was performed.

- Test primary flows at 375 px, 768 px, and 1440 px.
- Verify keyboard navigation, focus order, labels, dialogs, error messages, contrast, and screen-reader announcements for important dynamic states.

## Load and failure plan

Extended validation under TASK-085, not a gate for starting the next core feature. Before
a limited launch, verify the intended initial workload and representative recovery/safety
behavior under TASK-083/084/086. The larger targets below stay unverified until executed;
do not admit those loads solely because the initial pilot passed.

- 1,200 login attempts over one minute.
- 300 active sessions and 20-50 representative API requests per second.
- 100,000-recipient campaign expansion and queued processing.
- Webhook burst and duplicate delivery.
- 1,000 inbox polling/realtime clients under the selected transport.
- Large imports.
- Worker crash, Redis interruption, database restart, and provider timeout.

## Pre-production exit criteria

- All critical tests pass in CI and staging.
- No unresolved critical/high security findings.
- Backup restore and event replay are tested.
- Production configuration and secrets are reviewed.
- Monitoring and alerts detect API, queue, webhook, provider, database, Redis, and storage failures.
- Product-owner UAT covers onboarding, Contacts/Groups, templates, campaigns, inbox, automation, and handoff.

Detailed scenarios remain in `13-testing-and-acceptance.md`.
