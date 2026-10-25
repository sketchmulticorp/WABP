# Shared Inbox inbound resolution (TASK-060)

Status: Implementation complete under CLAR-031, 2026-10-16. Runtime acceptance tests deferred to
the owner-approved Phase 6 checkpoint (TASK-065). No live Meta sends are needed here.

## One existing pipeline

Reuse TASK-035/036: verified raw webhook → persisted event/outbox → BullMQ identifier-only
job → WebhookEventService → WebhookEventRepository → PostgreSQL. There is no new ingestion
endpoint, parallel inbox processor, schema, dependency or queue.

The processor remains a thin transport adapter. The service chooses workflow/policy and
initiates a repository transaction callback; only the repository executes SQL. One event's
Contact, Conversation, Message, STOP/audit and completion writes commit together or roll back.
Failure state is recorded separately through the existing processor error handler.

## Resolution rules

- Resolve account ownership from the stored event's tenant/account pair and the database;
  every message-bearing payload change must match that account's provider phone identifier.
  Mismatch fails with `WEBHOOK_ACCOUNT_MISMATCH`; unresolved ownership fails closed.
- Serialize provider-message identity and tenant/phone resolution. An already persisted
  inbound provider ID for this tenant/account is a no-op before Contact/activity/STOP writes.
  A conflicting owner/direction fails with `WEBHOOK_MESSAGE_OWNERSHIP_MISMATCH`.
- Reuse and lock an active same-tenant Contact. Preserve existing consent and non-empty
  profile name. A previously unknown sender gets a Contact with UNKNOWN consent, not opt-in.
- If no active Contact exists but a same-tenant soft-deleted Contact matches, fail with
  `INBOUND_CONTACT_REVIEW_REQUIRED`. Never automatically restore it or create a replacement.
  The deleted-row lookup is explicitly internal to review; it is not a customer-data API.
  If an active Contact already exists, use it; do not revive older deleted identities.
- Require a valid positive integer Unix-seconds timestamp for every normalized inbound
  message. Missing/invalid values fail with `INBOUND_TIMESTAMP_INVALID`; do not substitute
  receipt/processing time. The raw verified event remains retained for investigation.
- Reuse one durable Conversation per tenant/account/Contact. New inbound messages reopen
  it, increment unread once and monotonically advance activity and the stored 24-hour
  window using provider time. Assignment/automation state is preserved.
- Whole-message STOP keywords retain the existing opt-out policy. Apply the Contact and
  audit effect only for a newly inserted message; duplicate delivery does not repeat it.
- Delivery-status lookup requires the same tenant/account and OUTBOUND direction;
  Message updates and recipient projections include tenant predicates. This closes the
  prior provider-ID-only cross-account status lookup without creating a new status path.

## Review and replay

“Hold for review” reuses existing FAILED/DEAD event states, safe error codes and private
replay tooling. Normal bounded retries still apply; persistent failures eventually reach
DEAD. There is no new HOLD state or review UI in TASK-060. One blocked message rolls back
the entire event, including otherwise valid siblings; it is not silently acknowledged as
processed or partially applied.

An authorized infrastructure operator investigates without exposing raw payloads or deleted
Contact PII through Super Admin application screens. Any Contact recovery requires the
separately authorized recovery procedure; this task does not add automatic restoration or
an application restore endpoint. Do not edit the original verified payload or invent a
timestamp to force success. Replay only after the underlying issue has been legitimately
resolved; an unchanged malformed timestamp will fail again.

Existing command: `pnpm --filter @whatsapp-platform/worker webhook:replay <webhook-event-uuid>`.
It accepts only FAILED/DEAD events and preserves the existing durable outbox handoff.

## Scope and verification

TASK-061 owns inbox read/history APIs, TASK-062 replies, TASK-063 assignment/notes and
TASK-064 transport updates. No customer-facing inbox UI is delivered by TASK-060.

Run formatting, worker lint, typecheck and build during implementation. Do not claim SQL
behavior verified merely because TypeScript builds. Pending cases and existing unit-double
updates are tracked under TASK-065 in `TEST_PLAN.md`; no test files are changed now.

Verification recorded: formatting and worker lint/typecheck/build passed (10 successful
tasks including dependency builds); `git diff --check` passed. No automated tests executed.
