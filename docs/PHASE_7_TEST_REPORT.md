# Phase 7 local test report

Date: 2026-10-16. TASK-075 is **complete for the approved local checkpoint**, not production-certified.
Owner explicitly approved local testing. No live Meta calls or real sends are authorized.

## TASK-075.4 final local acceptance — 2026-10-16

This section supersedes the historical pending statements below. The final root quality gate
passed; do not infer production or exhaustive failure certification from local tests.

| Command / assertion | Actual result |
| --- | --- |
| `pnpm --filter @whatsapp-platform/api test:automation:integration` | PASS: 10 tests (8 runtime/concurrency, rollback authoring, full authenticated HTTP). |
| `pnpm --filter @whatsapp-platform/worker test:automation:integration` | PASS: 3 tests (database replay, four dispatch/control orderings, isolated Redis retry/exhaustion). |
| New `error-response.factory` tests | PASS: 2 tests; known Express size-limit errors produce a safe 413, arbitrary error status fields cannot override INTERNAL_ERROR. Registered in ordinary API tests. |
| Automation Chromium | PASS: 5 cases including successful form save/publish, keyboard submission, immutable history presentation, stale-input preservation and auth clearing. |
| Inbox Chromium | PASS: 16 cases including explicit takeover/allow without an outbound reply. Full root rerun follows. |
| Final `pnpm check` | PASS: schema (35 tables), formatting, configured lint/typecheck, registered unit/client tests, builds and all 29 Chromium cases. API includes both new error-mapping security tests; worker ordinary tests pass 25 cases. SQL/Redis integration suites were executed separately above. |

The authenticated HTTP fixture starts the actual API (not a delivery worker) against a
disposable migrated database, signs a test access token with a live persisted session and
uses actual authorization/controller/service/repository code. A valid 30-node graph with
28 full-length messages exceeds 100 KB: create, read and publish pass without composing a
Message. Injected tenant field, invalid token, unknown ID and revoked session are rejected.
Automation >2 MB and ordinary route >100 KB return 413.

Concurrent edits from one revision produce one winner; concurrent publication produces one
publication, and a second active account/keyword is rejected. Worker SQL replay locks a failed
event: four concurrent requests produce one replacement/audit. Injected audit failure rolls
back the replacement and original-status change. Processing a replacement for a handed-off
run neither resumes it nor creates an outbound Message.

Dispatch tests use real SQL repositories, independent transaction boundaries, real automation
services and deferred fake-provider acceptance. For both pause and takeover: a control
transaction holding its locks before dispatch blocks the queued message with zero provider
calls; a delivery transaction holding a SENDING claim before control may submit once and
persist acceptance after control finishes. Reprocessing that accepted Message does not send
again. These are controlled representative interleavings, not randomized stress or outage tests.

### Verified defect and repair — TASK-075.4.1

Initial full HTTP test failed: oversized body was rejected but mapped to INTERNAL_ERROR/500.
The raw Express `entity.too.large` Error is not a Nest HttpException, so the shared mapper
fell through to 500. Added a narrow check requiring Error + the exact parser type + status
413, returning the existing PAYLOAD_TOO_LARGE envelope with generic text and no parser/body
metadata. No arbitrary status trust, parser-limit change or webhook parser change. Both
unit security regressions and the full HTTP rerun pass. No schema/dependency changes.

New browser test initially used an exact label that did not match the native select's
computed accessible name. Corrected it to the actual named combobox and reran: PASS.
This was a test-selector correction, not a production behavior change.

## Executed results

Continuation: owner approved TASK-075.2/075.3. New fixture databases have independent committed
connections, unlike the earlier rollback-only authoring fixture. They are generated with an
exact validated `automation_test_<UUID hex>` identifier, migrated from reviewed migrations,
closed and dropped in finally. No application database is dropped or reset. The Redis test
uses an exact random test prefix and only cleans that prefix after closing its processor.

| Continuation command | Actual result |
| --- | --- |
| `node --env-file-if-exists=../../.env --test dist/automation/automation-runtime.integration.test.js` from apps/api | PASS: 7 cases, including concurrent persisted triggers/advances/current choices and pinned versions. |
| `node --test dist/automation/automation-transport.service.test.js` from apps/worker | PASS: 3 cases, publication release, identity tampering on processing/exhaustion, and log redaction. |
| `node --env-file-if-exists=../../.env --test dist/automation/automation-queue.integration.test.js` from apps/worker | PASS: 1 real BullMQ/Redis case, duplicate event ID, distinct continuations, second-attempt recovery and five-attempt exhaustion. Runtime effects are doubles in this transport test. |
| `pnpm --filter @whatsapp-platform/whatsapp-provider test` | PASS: 5 fake-fetch cases; includes BUTTONS/LIST official adapter payloads, no live HTTP. |
| `pnpm --filter @whatsapp-platform/worker test` before adding relay tests to ordinary script | PASS: 22 cases, including new automation dispatch gate regression. Ordinary script now also includes the 3 relay cases. |
| `pnpm exec playwright test tests/e2e/automation.spec.ts tests/e2e/inbox.spec.ts` then automation-only rerun | Inbox PASS: 15 cases. Automation PASS after selector corrections: 4 cases (readable history/no-send simulation, mobile stale-input preservation/confirmation, read-only controls and terminal-auth clearing). |
| `pnpm --filter @whatsapp-platform/api test:inbox:integration` | PASS: 9 PostgreSQL/live-authorization cases. |
| `pnpm exec turbo run lint typecheck build` | PASS: 30 tasks before the final dispatch test addition. Full phase gate rerun recorded below when complete. |
| `pnpm check` | PASS after all test additions: schema contract (35 tables), formatting, configured lint, typecheck, registered unit/client suites, production builds and all 27 Chromium tests. API now runs 62 tests; worker includes 22 delivery/existing plus 3 relay tests. SQL/Redis integration commands remain separate and are not implicitly covered by this root gate. |
| `pnpm format:check` after documentation updates; `git diff --check` | PASS. |

Runtime cases cover START, MESSAGE, BUTTONS, LIST, CONTACT_UPDATE, ASSIGN, HUMAN_HANDOFF,
END; six-way duplicate triggers/advances, four-way current choice processing, draft/new
publication preserving the original run version, literal trim/lowercase, one audit per action,
text acceptance ordering, early-choice receipt rollback then retry, stale reply context,
ignored active keyword, ten-step durable continuation and replay, publisher/plan/consent/
window change, original wait expiry, STOP/unexpected text without fallback messages,
permanent failure/quota, ambiguous SENDING with one composed message, and takeover race.
Provider acceptance in runtime tests is simulated by test SQL, not network or delivery.

Test-authoring failures corrected and retested: unsupported `SUSPENDED` user fixture replaced
with schema-approved `DISABLED`; flow-control argument order corrected at compile time;
browser assertions now distinguish application alerts from Next's route announcer and use
the actual Cancel editing label. Strict-lint optional chaining issues corrected. No production
feature change or schema change was needed. Authenticated large-body save and real queued-
message dispatch-claim races are not proved by these tests.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @whatsapp-platform/api test:automation` | PASS: 7 tests. Graph configurations/branches, simulation, structural rejection, protected Contact fields, strict DTOs, entitlement flag and isolated Nest parser. |
| `node --env-file-if-exists=../../.env --test dist/automation/automation.integration.test.js` from apps/api | PASS: 1 rollback-only PostgreSQL case with multiple assertions. Draft/publication/history/revision isolation, pure simulation, persisted keyword trigger, duplicate receipt, pinned version, takeover and allow cancellation/replay. Available through `test:automation:integration` as well. |
| `pnpm --filter @whatsapp-platform/api test` | PASS: 55 existing API regressions, including raw-signature verification and unauthorized-route boundaries. |
| `pnpm --filter @whatsapp-platform/worker test` | PASS: 21 existing worker regressions with provider doubles. |
| `pnpm --filter @whatsapp-platform/worker test:inbox:integration` | PASS: 8 existing PostgreSQL Inbox/webhook cases, including independent webhook transactions. |
| `pnpm --filter @whatsapp-platform/api lint` | PASS after correcting the new test module's class structure; no lint rule disabled. |

The parser harness accepts a 120,000-character JSON value under the automation path,
rejects a >2 MB body, rejects the same medium body on an ordinary route, and computes
the expected HMAC from exact Unicode/whitespace webhook bytes captured by Nest. It does
not authenticate or save a >100 KB valid graph through the full production controller:
that remaining T075-02 assertion is not certified by the transport harness.

The new SQL case uses random fixture IDs and an enclosing rollback, restricted to local,
non-production PostgreSQL. No delivery worker or provider is instantiated. Nested service
transactions use savepoints: this proves persisted behavior, **not independent-connection
automation concurrency or committed crash/restart recovery**. Existing webhook tests use
their existing disposable-database safety controls.

## Test authoring corrections

First SQL run failed because the new assertion expected `AUTOMATION_REVISION_CONFLICT`
instead of the implemented `AUTOMATION_REVISION_CHANGED`. Corrected the test to the actual
contract; rerun passed. Initial strict lint rejected an empty test module class; replaced
it with a test module that configures its transport rather than disabling the lint rule. No production
feature defect has been established or fixed in this checkpoint.

## Remaining launch and extended coverage

TASK-075.4's three named gaps are now covered above. Existing TASK-084/085/086 still own
broader security/user-flow acceptance, randomized race/stress, crash/outage recovery,
UTC-month rollover fault injection, full browser branch permutations and live Meta/deployed
acceptance. No test here proves all possible interleavings, exhaustive editor validation,
cross-tab/session coordination, deployment capacity, backup recovery or customer readiness.
The TEST_PLAN inventory is not an assertion that every exhaustive variant passed.
No live provider, deployed load/outage, customer acceptance or production readiness is claimed.
