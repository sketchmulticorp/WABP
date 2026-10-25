# Phase 5 local verification report

Date: 2026-10-15. Owner authorized Phase 5 tests before TASK-060 (CLAR-029).
Scope: TASK-050–055 messaging/campaign implementation, plus TASK-059 queue compatibility.

This is local development verification, not production certification. No live Meta sends
were made. Provider responses are doubles. Browser tests use API doubles; they are not
full-stack browser-to-provider tests. PostgreSQL and BullMQ integration suites use real
local services. Database fixtures roll back; the concurrency suite creates, migrates and
drops only its uniquely generated `phase5_<uuid>` database. Redis fixtures use a unique
prefix and remove only their own jobs. No application data or normal queues are purged.

## Commands and results

| Command | Result and boundary |
| --- | --- |
| `pnpm check` | PASS: schema verification, formatting, lint, typecheck, workspace tests and builds; API 55/55, worker 21/21, provider contracts 4/4, Chromium 8/8. Other workspace tests also passed; some packages have no unit tests. |
| `pnpm schema:test:integration` | PASS: 10 real PostgreSQL regression tests, including migration inventory, outbox commit/rollback, tenant boundaries and outbound composition/quota. |
| `pnpm --filter @whatsapp-platform/api test:campaigns:integration` | PASS: 9 real PostgreSQL tests, including isolated concurrent starts/expansion. |
| `pnpm --filter @whatsapp-platform/worker test:messaging:integration` | PASS: 3 PostgreSQL/Redis/BullMQ tests for acceptance/failure/replay, deterministic queue identity, transient/permanent handling and paused-job delay without attempt consumption. |
| `pnpm --filter @whatsapp-platform/worker test:phase5:integration` | PASS: 2 tests covering 100,000-contact preflight and real queue-ID validation/deduplication. Import relay failure/retry uses a persistence double with a real Redis queue. |

The measured load fixture plus preflight and SQL assertions took 44,755 ms locally.
It produced 100,000 recipient snapshots: 60,000 eligible and 40,000 skipped, removed one
Contact/Group overlap, blocked insufficient quota without truncation, wrote one completion
audit on repeated processing, and reserved no send usage. This does **not** measure
100,000 outbound messages, provider throughput, multi-tenant capacity or hosting capacity.

## Acceptance evidence and remaining coverage

`PASS` applies to the stated local scenario. `PARTIAL` means part of the broader planned
case remains unverified; it is not a passing claim for that entire case.

| Case | Status | Evidence / remaining work |
| --- | --- | --- |
| T055-01 | PASS | Lifecycle units and SQL cover exact-version submission/approval, rejection reason validation and resubmission. |
| T055-02 | PASS | Units cover User/Super Admin/self-review denial; SQL covers cross-tenant reporting; existing draft/security suites cover tenant restrictions. |
| T055-03 | PASS | SQL verifies schedule/timezone invalidation and equivalent ISO-offset preservation; existing units cover other material edits. |
| T055-04 | PARTIAL | SQL rejects review after a template version change; complete edit → rebind → reapproval workflow remains pending. |
| T055-05 | PASS | Isolated SQL database: concurrent identical starts, competing different keys and concurrent expansion create one message/reservation; units reject changed input under an existing key. |
| T055-06 | PASS | SQL verifies final-preflight outbox handoff, due-time rerun and failed final-preflight pause without messages. |
| T055-07 | PARTIAL | Repeated expansion, outbox retry units and message queue replay pass; actual process-kill recovery across batch boundaries remains pending. |
| T055-08 | PASS | SQL verifies insufficient remaining quota pauses without messages or reservations; common composer regressions verify atomic reservation/idempotency. |
| T055-09 | PARTIAL | SQL cancellation and worker claim/policy checks pass; simultaneous cancel-versus-provider-claim stress remains pending. |
| T055-10 | PASS | Real BullMQ processor delays a paused job and resumes it with one consumed attempt; policy rechecks and lifecycle resume pass. |
| T055-11 | PARTIAL | Units cover opt-out, tenant suspension, template/version and reviewer/sender access changes; SQL covers composition tenant/policy boundaries. Exhaustive live campaign membership/deletion/plan-change permutations remain pending. |
| T055-12 | PARTIAL | SQL verifies cancelled report counts and tenant isolation; browser verifies refresh/empty report. Multi-page mixed terminal-status history remains pending. |
| T055-13 | PARTIAL | Chromium covers responsive drafting, stale-edit recovery, missing permissions, submission, confirmation and lifecycle controls. Reviewer rejection UI, report pagination and broader accessibility/browser coverage remain pending. |
| T055-14 | PARTIAL | 100,000-contact preflight and two concurrent execution calls pass. Full queued dispatch load, deadlock fault injection and UTC-month rollover remain pending. |
| T055-15 | PARTIAL | Cancellation retains existing usage; acceptance-persistence-gap unit prevents blind resubmission. Concurrent terminal-history stress remains pending. |
| T055-16 | PASS | Real BullMQ accepts preflight/webhook identifiers and identifier-only payloads; duplicate preflight publication creates one waiting job. |
| T059-01–02 | PASS | Real Redis accepts deterministic import ID and duplicate publication leaves one job. |
| T059-03 | PARTIAL | Relay retries a simulated publication failure with a persistence double; actual process restart and durable PostgreSQL recovery remain pending. |
| T059-04 | PARTIAL | Identifier-only payload passes; comprehensive import retry/tenant/outcome behavior remains in Phase 4 coverage rather than being recertified here. |

## Defects and retests

1. **TASK-056.1 — actual SQL defect:** the Drizzle campaign gate emitted
   `FOR UPDATE OF "app"."campaigns"`, which PostgreSQL rejects. Use the supported
   joined-query `FOR UPDATE` form, locking campaign and recipient rows. The lifecycle
   and concurrent-expansion SQL tests pass after the fix. No schema/API change.
2. **TASK-056.2 — stale test inventory:** the regression expected seven migrations/34
   tables, predating approved migrations 0007/0008. Updated to nine migrations/35 tables
   after checking the migration journal and schema verifier. All 10 database tests pass.
3. The metadata-only draft unit fixture lacked persisted schedule/template fields.
   Aligned the fixture with current storage; preserved the approval-preservation assertion.
4. Updated campaign browser doubles to return the actual report contract; added lifecycle
   controls/submission and scheduling coverage. These doubles verify UI behavior only.

## Completion boundary

CLAR-030 supersedes the previous in-progress sequencing: the local testing checkpoint is
finished, but TASK-056 remains pending for the listed unverified cases. They do not block
TASK-060 development. Focused launch-safety and critical user-flow checks link to TASK-084/086;
exhaustive recovery/race/full-dispatch/month-boundary stress links to TASK-085 before relevant
capacity expansion. All case results above are unchanged; PARTIAL is not PASS.

TASK-057 (official numeric provider-code verification before production delivery) remains
pending. TASK-058 (saved-segment design) is post-MVP, not a first-release requirement.
TASK-060 is not started by this documentation update. See `MVP_DELIVERY_PRIORITIES.md`.
Do not describe this checkpoint as complete production readiness.
