# TASK-086 — Launch verification

Started: 2026-10-17, at the owner's request. Status: readiness review started;
staging UAT, real Meta journey and launch approval are pending. This task can start
before all other backlog tasks finish, but cannot waive launch-critical gates.

## Current execution choice: owner-only local walkthrough

Owner clarified that personal manual testing of all roles comes first. Friends, sharing,
Railway and customer launch are later, not prerequisites for inspecting the local app.
TASK-086.5 owns local startup/account verification and recording manual results; deployed
UAT rows below remain NOT RUN. Current preflight: Docker Linux engine unavailable and no
listeners observed on 3000/4000/5432/6379 (2026-10-17). Start Docker Desktop before continuing.
Preserve volumes and existing accounts; do not reset, migrate or seed blindly. Check queued
work/provider safety before starting the worker, whose defaults enable external delivery.

## What already passed locally

Reuse the exact evidence in `PHASE_8_LOCAL_REPORT.md`: full registered checkpoint,
33 browser tests with mocked API boundaries, 7 reporting SQL/HTTP integration tests,
synthetic PostgreSQL restore drill, lean image builds/artifact checks and web runtime
smoke. These are not deployed end-to-end or live provider results. Remaining partial
Phase 5/6 cases stay traceable through their reports and TASK-084.

Container scans completed but failed their high/critical gate. All three images report
1 critical and 60 high package occurrences. Applicability/remediation remains unresolved;
recording a scanner finding or owner wishing to postpone work is not security clearance.

## Dependencies: start versus finish

| Work | Needed to start this readiness review? | Required before customer launch? |
| --- | --- | --- |
| TASK-082 actual staging deployment | No | Yes: verified environment for staging UAT and production configuration |
| TASK-083 backups/monitoring/alerts | No | Yes: agreed objectives and verified operational controls |
| TASK-084 security and focused safety cases | No | Yes: close launch-critical findings and missing evidence |
| TASK-057 provider error mappings | No | Required before production delivery rollout; track verified provider behavior |
| TASK-085 full capacity/stress plan | No | Before admitting the workload it certifies; verify agreed initial workload for launch |
| TASK-015 GitHub CI | No | Owner-deferred; record local release checks, do not claim CI passed |
| TASK-067 legacy frontend lint cleanup | No | Track separately; any actual launch-critical defect still blocks |
| TASK-058 saved segments | No | No: post-MVP, static Groups/Contacts remain the audience model |

## UAT execution sheet

All rows below are NOT RUN for deployed end-to-end TASK-086 verification. Earlier unit,
SQL or mocked-browser checks do not silently change these statuses. Use synthetic data,
two isolated businesses, one Admin and User per business, and a Super Admin. External
messages require an explicitly consented test recipient and separate owner authorization.

| ID | Journey / expected result | Status |
| --- | --- | --- |
| L086-01 | Sign in as each role; revoked access stops; businesses cannot switch/access each other's data; Super Admin sees metadata/counts/billing but no customer content | NOT RUN |
| L086-02 | Business Admin manages team; permitted User manages Contacts/static Groups/import; soft deletion hides active records and import errors remain actionable | NOT RUN |
| L086-03 | Approved test-account connection and synchronization resolve the right WABA/phone; credentials remain server-only; disconnected state blocks sends without losing history | NOT RUN |
| L086-04 | Template Meta status and internal approval stay separate; User material edits invalidate internal approval; exact current version is required | NOT RUN |
| L086-05 | User creates Contacts/Groups campaign, Admin approves, preflight validates variables/consent/quota, schedule/send uses common pipeline; material User edit requires reapproval | NOT RUN |
| L086-06 | Consented test campaign continues after browser closure; duplicate action does not duplicate send; delivery status reaches the correct report through verified webhook | NOT RUN |
| L086-07 | Inbound test message appears once in the correct Inbox; permitted reply reaches test recipient; service-window/template gates hold | NOT RUN |
| L086-08 | Basic published automation advances on test input, explicit human handoff stops automated replies, and STOP blocks prohibited future messaging | NOT RUN |
| L086-09 | Reports/CSV/audit retain approved field privacy and tenant boundaries; manual billing records show exact amount/currency/reference without changing subscription/quota | NOT RUN |
| L086-10 | Representative retry/pause/cancel/recovery preserves durable work and never blindly resends uncertain provider acceptance | NOT RUN |
| L086-11 | Verify deployment health, controlled migration, secret/cookie/CORS configuration, rollback, backup recovery and actual alert delivery | NOT RUN |
| L086-12 | Check primary journeys at 375/768/1440 widths, keyboard/error recovery, agreed pilot workload, and owner acceptance | NOT RUN |

For each executed row record environment, code commit/image identity, date, sanitized fixture
identifiers, steps, expected/actual result, PASS/FAIL/PARTIAL, defect task and retest evidence.
Never attach credentials, phone numbers, raw webhook bodies or customer content to this file.
Fixes discovered during UAT must be numbered and approved under the existing scope rules.

## Next owner inputs

1. Is there already a Railway staging deployment? If yes, provide only public web/API URLs
   and non-secret project/region identifiers. If not, continue local readiness now and use
   TASK-082 when ready; no cloud resources are created by this checklist.
2. Before remote setup: approve domains, budget/cost controls, recovery/retention targets
   and alert destination through TASK-082/083. Never paste credentials into chat or Git.
3. Before Meta execution: explicitly authorize the test send scope and confirm consented
   test recipient/assets are configured locally or in staging variables, not in this file.
4. Before go-live: approve the initial pilot workload and sign off only after critical
   security, privacy, approval, consent, idempotency and operational checks are satisfied.

No customer launch, provider send, provisioning, production migration or seed is authorized
merely by starting TASK-086. The final go/no-go remains pending owner sign-off.
