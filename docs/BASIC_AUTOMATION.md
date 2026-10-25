# Basic automation — Phase 7

Owner approved CLAR-038 on 2026-10-16, supplemented by CLAR-039 for HTTP parsing. Implementation is sequential TASK-070–074;
TASK-075 testing requires a separate phase-boundary decision. No live Meta calls are authorized.

Testing update, 2026-10-16: the owner has approved TASK-075 local testing and continuation.
The historical implementation-only status below is superseded by PHASE_7_TEST_REPORT.md.
Local runtime/concurrency, provider-double, isolated Redis and browser checks have passing
evidence. TASK-075.4 closes the authenticated large-graph, SQL replay and representative
dispatch/publication race gaps. TASK-075 is locally complete with pnpm check passing all 29
Chromium cases; broader launch/stress/live-provider acceptance remains TASK-084/085/086.

## Approved product contract

- Form-based, responsive step/branch editor, readable preview and side-effect-free simulator.
  No drag-and-drop, JSON editor, new workflow engine or infrastructure dependency.
- Nodes: START, MESSAGE (text), BUTTONS, LIST, ASSIGN, CONTACT_UPDATE, HUMAN_HANDOFF, END.
  Maximum 30 nodes; acyclic graph; execution yields after 10 immediate steps to durable work.
- Users with existing permissions may read/write/test drafts. Only an active Tenant Admin
  with automation.publish may publish/reactivate. Super Admin never receives tenant content.
- One account per flow version. Trimmed case-insensitive whole-message keywords; duplicate
  active keywords for that account are rejected. No catch-all trigger.
- Published versions are immutable. Editing creates a new draft; running conversations remain
  pinned to their original version. Publication revalidates account and assignee ownership.
- One active run per conversation. While waiting, unrelated keywords never start another run.
  Correlated current button/list choices advance once. Stale choices and active entry keywords
  are ignored while waiting; other unexpected text hands off without repeated fallback messages. Waiting expires with the service window;
  a later fresh keyword may start a new run, but does not resume the expired run.
- CONTACT_UPDATE accepts validated literals for name/email/company/address only. No phone,
  consent, suppression, assignment, deletion, arbitrary variables or input collection.
- ASSIGN targets an active same-tenant team member; it never grants access.
- Permanent action/policy failure stops progress, records a safe reason and allows human work.
- Explicit takeover requires conversation.read/reply. It blocks new bot work and unclaimed bot
  sends. Already submitted provider requests may finish. No automatic bot resume.
- Admin flow reactivation enables new runs only. Explicit conversation allow-automation clears
  the takeover latch for future keyword starts; it does not restart an old run.
- Record publishing Admin. Before automated sends revalidate their live membership and publish
  permission, tenant/account/plan and existing consent/quota/window policy. No login dependency.

## Engineering boundaries

Reuse five existing SQL tables and Drizzle models. Flows are soft-deletable; versions, nodes,
edges and runs retain immutable/execution history. Repositories enforce tenant and active-parent
predicates, same-version relationships and locking; services own decisions and transactions.
Controllers/queue processors call services only. Compose every outbound effect through the
common MessagingService and transactional outbox; never send from an automation repository.
Provider-specific interactive payload construction stays in the official provider adapter.

The official adapter uses the existing messages endpoint for interactive reply buttons and
lists; it does not use WhatsApp Flows or browser automation. See [Meta's API collection](https://www.postman.com/meta/whatsapp-business-platform/request/x0kd1at/send-reply-button).

Inbound persistence and identifier-only automation outbox handoff must commit together.
Runtime advancement, node side effects, cursor/state and continuation outbox must commit
together. Database locks serialize conversation/run decisions; idempotency uses stable run/node
identities, not retry attempts. No external provider call inside a SQL transaction.

Use the existing worker/runtime reuse pattern rather than a parallel messaging implementation.
Queued automation messages revalidate run ownership/pause/handoff at the provider claim boundary.
Preserve existing lock ordering when combining message/quota/conversation/run locks.

## Implemented HTTP contract

All paths below use `/api/v1`. Existing access-token/live-session/tenant guards apply.
Super Admin is denied every route. No route accepts a tenant, publisher, runtime actor,
provider payload or status supplied by the client.

| Method/path | Permission / behavior |
| --- | --- |
| GET /automations?cursor=UUID | automation.read; 50-row UUID cursor pages |
| GET /automations/options | automation.read; safe account/team labels/IDs; separate accountCursor/memberCursor pages |
| GET /automations/{id} | automation.read; retained snapshots, safe graph projection and exact revision |
| POST /automations | automation.read/write; name and graph; new draft only |
| PATCH /automations/{id} | automation.read/write; name, graph, expectedRevision; append a new draft snapshot |
| POST /automations/{id}/test | automation.read/test; expectedRevision and selections (choice IDs); pure simulation |
| POST /automations/{id}/publish | automation.read/publish plus Tenant Admin; expectedRevision; publish latest saved draft |
| POST /automations/{id}/pause | same Admin/publish boundary; expectedRevision; stop new/current work |
| POST /automations/{id}/reactivate | same Admin/publish boundary; expectedRevision; new runs only |
| GET /conversations/{id}/automation | conversation.read; ownership state and latest safe run status/reason |
| POST /conversations/{id}/automation/takeover | conversation.read/reply; empty body; explicit human ownership |
| POST /conversations/{id}/automation/allow | conversation.read/reply; empty body; permit future triggers, never resume |

Graph shape: accountId, keywords, nodes `{key,type,config}` and edges `{from,to,choice}`.
Non-choice transitions use choice=null. MESSAGE config is `{text}`. BUTTONS/LIST use
`{text,choices:[{id,title}]}` with 1–3 buttons or 1–10 list rows. ASSIGN uses `{userId}`.
CONTACT_UPDATE uses `{fields:{name,email,company,address}}` with only the intended nonempty
fields; values are trimmed and emails lowercased on execution. START/HUMAN_HANDOFF/END have
empty config. Nodes/edges have bounded shapes even while a draft is incomplete. Publication
requires the complete valid, reachable acyclic graph. Keywords reserve STOP/UNSUBSCRIBE/
CANCEL/END/QUIT for existing tenant-wide opt-out processing.

The simulator follows only supplied choice IDs and returns steps/errors/outcome; it performs
no database/customer mutation, quota reservation, outbox insertion or provider call. It is a
structural simulation, not certification of live account/plan/provider readiness.

CLAR-039 declares Express 5.2.1 directly (already Nest's installed version) and its existing
type declarations. The automation prefix alone has a 2 MB JSON parser; other routes retain
the existing default limit and webhooks retain original-byte capture. A distinctly named
wrapper is necessary because this Nest version identifies an existing JSON parser by function
name. The boundary must be exercised under TASK-075, not presumed verified by compilation.

## Runtime and recovery

`trigger_config` schemaVersion=1 stores accountId/normalized keywords/publishedBy; the safe API
projection omits publishing identity. Run `state` schemaVersion=1 stores visited node keys,
safe reason, outstanding Message ID and original wait deadline. Existing lock_version protects
cursor updates. New runs pin an immutable version; runtime loads only that version, not every
historical draft. Operational/history tables are not assigned soft-delete columns. This slice
does not introduce a flow-delete/purge/restore API or change retention policy.

Each new persisted inbound Message atomically creates automation.inbound.received. Its
protected policy metadata records successful processing even for unmatched/ignored events.
Automation run advancement writes an event-processed marker in the continuation's protected
outbox payload, atomically with effects/state/next outbox. Redis envelopes contain only event
ID, target ID and event kind, re-resolved from PostgreSQL. Button/list responses require both
the run/node/choice token and the expected outbound provider Message ID in reply context.
An acceptance-persistence race retries instead of consuming a valid selection prematurely.

Flow -> sorted message keys -> UTC monthly quota -> Contact -> Conversation -> run is the
runtime lock order. Contact precedes Conversation to match inbound resolution. One captured
composition timestamp keeps quota locking/reservation in the same calendar month. Text
sequences wait for provider acceptance, not delivery/read acknowledgement. At most ten
immediate steps execute per job. Durable continuation waits five seconds while acceptance is
pending; interactive waits schedule their deadline. No customer-facing DELAY node is added.

An opted-out/suppressed Contact cannot receive automated messages. The existing
automation_enabled flag is strict boolean true on one eligible active/trial subscription's
active plan. New creation, publication, triggers, runtime mutations and delivery recheck it;
existing history/drafts remain readable and editable when disabled, without permitting sends.
No new commercial flow-count limit or pricing/grace rule is invented.

Provider claims revalidate version/run/publisher/account/ownership and current common policy.
Pause and takeover serialize with SENDING claims: unclaimed work is blocked, claimed requests
may finish. A permanent failed Message stops the run with safe Inbox evidence; failed delivery
webhooks notify the runtime. Flow pause latches current runs PAUSED. Reactivation does not
resume them. Explicit allow cancels the old latched run and records an audit time watermark;
older queued inbound events cannot restart it. Provider timestamps are second-granularity,
so a same-second/pre-watermark (or pre-publication) keyword is conservatively ignored; send a fresh keyword later.

Local worker startup registers automation processing by default; no worker was started as
part of implementation. Do not publish/enable flows against real accounts before approved
testing. This implementation approval is not permission for a live Meta test/send.

Transport jobs have five attempts with exponential backoff. Exhausted events are retained
as FAILED with an infinite *availability* sentinel (not a retention deadline) for operator
review. Run-job exhaustion relinquishes ownership where the database is available. Recovery
command, for trusted operators after resolving the cause:

```text
pnpm --filter @whatsapp-platform/worker automation:replay <failed-outbox-event-uuid>
```

Replay creates an audited replacement event once; it does not send directly, restore data,
resume handed-off runs or bypass policy. Use explicit allow and a fresh keyword after human
handoff; replay cannot restart that old run. A database outage during terminal-failure
persistence requires operator inspection of the retained BullMQ failed job/outbox state;
extended outage recovery remains an unverified TASK-075/085 scenario. Already accepted or
ambiguous SENDING messages are never blindly resent. All replay CLIs disable consumers,
relays and campaign scheduling in their own process. No customer queues are purged.

## Acceptance / execution status

TASK-070–074 implementation complete on 2026-10-16; TASK-075 awaits the owner's separate local
testing decision. Changed ownership locations: apps/api/src/automation (HTTP/services/SQL),
apps/worker/src/automation (queue/relay/recovery), apps/web/features/automation (authoring and
Inbox controls), packages/contracts/src/automations.ts, plus the existing messaging/provider,
webhook, module wiring, parser, dependency importer and permanent documentation boundaries.

Verification performed: pnpm schema:verify (35 tables); pnpm exec turbo run lint typecheck build
(30/30 tasks); pnpm format:check; git diff --check. Initial lint/type/format findings were fixed
without weakening rules. No test files changed or automated tests executed, no migration
applied, no worker/provider test started, no customer data/queues deleted and no Git commit.

Pending cases are maintained in TEST_PLAN.md. Static checks are not runtime acceptance or
production readiness. Local SQL/queue/provider-double/browser regressions, particularly
parser/HMAC, races, retries, version pinning, same-second boundaries and handoff, remain pending.

Deferred: media, delays, arbitrary conditions, INPUT, WhatsApp Flows, AI, external integrations,
advanced analytics, live Meta verification and deployed capacity certification.
