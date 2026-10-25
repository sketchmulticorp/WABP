# Phase 6 local test checkpoint

Date: 2026-10-16. Owner authorized TASK-065 testing after TASK-066 implementation.
TASK-066 is implemented. The owner subsequently approved TASK-065.3 local concurrency and
polling/error-recovery testing, explicitly excluding live Meta tests. The expanded local
checkpoint is recorded below; it is not deployed full-stack or capacity certification.

## Verified results

| Command | Result and boundary |
|---|---|
| `pnpm check` | Passed after the follow-up: 35-table schema contract, formatting, configured lint, typecheck, unit/client suites, production builds and all 23 Chromium browser tests. |
| `pnpm --filter @whatsapp-platform/api test:inbox:integration` | 9/9 passed: PostgreSQL service queries, independent transaction races, rollback injection and real authenticated HTTP routes. |
| `pnpm --filter @whatsapp-platform/worker test:inbox:integration` | 8/8 passed: PostgreSQL inbound/status effects, independent concurrent duplicate events and actual private replay persistence. |
| `pnpm test:client` | 7/7 client tests: existing TypeScript source compiled in memory using the installed compiler; fetch boundary doubled. Included in root `pnpm test` and `pnpm check`. |
| `pnpm schema:test:integration` | 10/10 passed: migrations, transaction/outbox, tenancy, identity, Contacts/Groups and common messaging regressions. |
| `pnpm --filter @whatsapp-platform/worker test:messaging:integration` | 3/3 passed: PostgreSQL persistence, Redis deduplication and BullMQ retry behavior; provider doubles, no Meta sends. |
| `pnpm --filter @whatsapp-platform/worker test:phase5:integration` | 2/2 passed: existing 100,000-recipient local preflight regression and Redis job-ID/import relay case. Preflight approximately 34.5 seconds; not deployed capacity certification. |

The root gate's nonempty unit suites pass API 55, worker 21 and provider 4 tests.
Other packages currently report zero unit tests; that is not additional coverage.
The general database, messaging transport and 100,000-recipient preflight rows retain the
earlier checkpoint's results; this test-only follow-up did not rerun those expensive suites.
The original gate passed 15 browser cases. Expanded browser coverage has 15 Inbox cases and eight existing
Contacts/Groups/import/Campaign cases. The new SQL suites are explicit commands, not silently
included in the normal unit command. Run them separately with local development services.

## New Inbox coverage

### API and database — nine cases

- Literal wildcard search, microsecond-preserving history cursor pages and explicit read
  acknowledgement boundaries; older acknowledgement does not increase unread.
- Tenant, permission, Super Admin and deleted-Contact visibility rejection; safe assignee
  projection contains IDs and display names, not email or credentials.
- Assignment eligibility and idempotent note retries/conflicting key reuse, single audit
  effect and no outbound Message from notes; unchanged unread/status.
- Accepted common reply creates one usage/outbox effect; accepted replay after closing
  returns the same Message, while a new reply requires reopen and changed content conflicts.
- Active automation and closed text window reject new sends through common policy.
- Strict parsers reject routing/tenant/author injection and malformed pagination/content.
- Independent connections issue four identical replies and four identical notes; one Message,
  usage reservation, outbox and note/audit effect remain. Close-versus-compose accepts only
  serialization-consistent outcomes. Read-versus-a-locked inbound persistence transaction
  retains one later unread message (the inbound side here is SQL, not the webhook service).
- Injected note/assignment/state audit failure and reply outbox failure roll back their writes.
- Exact template internal approval/variable/quota gates; blocked-key replay stays blocked after
  approval changes. Different actors can reuse their client key without sharing a Message.
- Notes paginate timestamp/UUID ties; assignee pages do not repeat members. Inactive author
  notes remain visible; inactive assignee is rejected. No-op assignment/close avoids extra audit.
- A real child API reads the disposable DB: owner GETs and note/reply POSTs succeed; every
  Inbox route rejects unauthenticated access; every Inbox content/action route denies Super
  Admin. Tenant injection fails, deleted history returns 404, and a live role downgrade
  immediately denies privileged actions with the unchanged access token.

### Inbound and status SQL — eight cases

- UNKNOWN-consent sender resolution, sequential duplicate provider-ID protection, one unread
  increment and one STOP audit effect.
- Invalid-timestamp sibling causes transaction rollback; phone routing mismatch and
  deleted-only sender hold do not recreate Contacts or retain sibling effects.
- DELIVERED advances to READ; late SENT/FAILED events cannot regress READ or attach a failure
  code. A foreign-account provider message ID cannot mutate the original Message.
- Four independently committed copies of the same inbound STOP create one Message/unread/
  opt-out audit effect. Private FAILED-event replay emits one durable outbox event, rejects
  a second replay, and processes successfully after a reviewed replacement Contact exists.
- Missing/null/empty/zero/negative/fractional/non-numeric/overflow timestamps never create a
  processing-time service window. Old inbound does not regress activity/window; closed
  history reopens without replacing existing profile, consent or automation state.
- Injected completion failure rolls back Contact/Conversation/Message/STOP effects together.
- An active replacement is reused without restoring a soft-deleted identity. Provider-ID
  outbound/inbound direction collisions fail; status cannot mutate an inbound Message.
- CampaignRecipient DELIVERED-to-READ and late failure metadata are directly asserted too.

Ordinary fixtures use outer rollback transactions (worker effects use savepoints). Concurrency
fixtures instead create fresh `inbox_test_<UUID hex>` databases on localhost, apply reviewed
migrations and exercise real commits on bounded pools. Cleanup validates the exact generated
name, stops the child API, closes the pool and drops only that disposable database. These
fixtures require local CREATEDB permission; they refuse remote hosts and production mode.
No application/customer data is deleted. They do not prove process-crash recovery or scale.

### Browser — fifteen cases

- Text reply, assignment, internal note, explicit read and close/reopen; literal script-like
  text remains text rather than executable markup.
- Mobile drill-in/back, older history and draft restoration across conversation changes.
- Uncertain network outcome retains the exact request key; unchanged retry is deduplicated
  by the API double. Real SQL reply replay is separately covered above.
- Read-only mode disables/hides operational mutations.
- Eligible template selection, parameter field, retained template-text preview and send.
- Timer refresh, hidden-tab pause and visibility resume preserve draft text.
- Parallel protected reads share one same-runtime token rotation.
- 503 retains data/drafts, waits 30 then 60 seconds, recovers and resets to 15 seconds.
- 401/403 clears protected data and stops; 404 stops without clearing the retained snapshot.
- Offline pauses reads; reconnect resumes. Focus bursts during a held load coalesce to one
  pending refresh, with no overlapping history requests in that context.
- Selection/unmount disposes polling; a delayed previous selection cannot replace the new
  selection's draft. Empty search recovers; older notes and team options paginate independently.

### Authentication client — seven cases

All HeadersInit forms, delayed old-token rejection using the newer token, failed refresh
clearing/recovery, logout discarding delayed protected data and stale refresh-token results,
new-login generation discarding old payloads, and GET AbortSignal forwarding. Fresh module
state per test; the production client is unchanged. Cross-tab coordination is not implemented.

## Defects found and corrected

1. The SQL status CASE treated DELIVERED as terminal before handling READ. Reordered both
   Message and CampaignRecipient transitions and prevented late failure metadata from
   attaching to delivered/read evidence. Both Message and CampaignRecipient transitions now
   have direct PostgreSQL assertions.
2. Wrapping labels inherited dynamically restored textarea/option text during exact label
   lookup. Added explicit unique label/control associations for reply text, template and note.
3. Updated existing common-composer/webhook service test doubles to the current interfaces.
   A browser alert assertion now scopes to the composer instead of also selecting Next's
   empty route-announcer alert; no production assertion was weakened.

An early parallel API test run timed out in the existing application startup check. The
isolated check passed, and the final complete root gate passed with the original timeout.
No retry, assertion or timeout was relaxed to hide the failure.

## Local checkpoint versus remaining launch acceptance

The focused TASK-065.3 concurrency/polling/error-recovery checks above are implemented.
T060–T064 remain a broader scenario inventory, not a claim that every permutation passed.
These boundaries remain explicit under the existing launch/security/extended-hardening tasks:

- TASK-084/086: browser-to-real-API-to-queue/worker-to-Meta-to-verified-webhook flow with
  consented test assets. Browser tests here use API doubles, SQL tests call actual services,
  and HTTP tests exercise actual guards/controllers; these are separate layers, not one full
  deployed end-to-end path. Live sends still need explicit authorization.
- TASK-084: cross-tab refresh-cookie rotation/reuse review; exhaustive authenticated HTTP
  role/tenant/field matrices, all input and consent/template/version permutations, and
  deployment-origin/cookie behavior. Existing common policy and authorization suites remain
  regression evidence, not proof of every Inbox-specific combination.
- TASK-085: repeated adverse-order races (including actual webhook consumer versus read),
  every injected persistence-failure location, process-kill recovery and measured workload.
  This checkpoint exercises bounded concurrent starts, not exhaustive lock/fault schedules.

During this follow-up only test files, test commands and records changed; no production
implementation, schema, dependency or policy was altered. Initial test failures were fixture
errors (default timestamp substitution, tied transaction timestamps, invalid user/log-level
values, strict tuple typing and TypeScript strip-only loading). Fixtures now follow the
existing contracts and compile the client with the installed TypeScript compiler. Assertions,
timeouts and security rules were not relaxed.

Focused security, consent/approval, data-integrity and full-stack gaps must close before real
customer use under TASK-084/086. Extended scale/fault permutations belong to TASK-085; no
1,200-user measured capacity claim follows from these local runs. No live Meta API request,
production deployment, customer fixture or credential export occurred.

TASK-067 separately records legacy workspace-app lint debt discovered during a wider lint
trial. Configured lint passes without weakening rules and covers all new Inbox files plus
the shared API client; the legacy workspace integration is typechecked/built, not fully linted.
