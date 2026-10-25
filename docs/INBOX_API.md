# Inbox read and state APIs — TASK-061

Approved: CLAR-032, 2026-10-16. Backend APIs only; inbox UI, replies, assignment/notes,
realtime, media downloads and provider read receipts are not implemented by this task.

TASK-062 subsequently adds the backend reply route described in `INBOX_REPLIES.md`;
the TASK-061 read/state contract below is unchanged.

## Routes

All paths are under `/api/v1`; existing success/error envelopes and request IDs apply.
Every endpoint requires active tenant membership and `conversation.read`. Super Admin
is denied. `close`/`reopen` additionally require `conversation.close` in guards and service.
Assignment is not an access restriction: authorized readers see their tenant's shared inbox.
No new permission, schema, dependency, provider path or migration is introduced.

| Method/path | Input | Data |
| --- | --- | --- |
| GET `/conversations` | `limit`, `cursor`, `search`, `status`, `accountId`, `unread` | `conversations`, `nextCursor` |
| GET `/conversations/{id}` | `limit`, `cursor` | `conversation`, `messages`, `nextCursor` |
| POST `/conversations/{id}/read` | `{ "lastSeenMessageId": "<message UUID>" }` | Updated conversation summary |
| POST `/conversations/{id}/unread` | `{}` or absent body | Updated conversation summary |
| POST `/conversations/{id}/close` | `{}` or absent body | Updated conversation summary |
| POST `/conversations/{id}/reopen` | `{}` or absent body | Updated conversation summary |

POST commands return HTTP 200. Invalid input returns the existing 400 envelope;
unknown or hidden conversation IDs return `CONVERSATION_NOT_FOUND` (404).
A missing/foreign read boundary returns `CONVERSATION_READ_BOUNDARY_INVALID` (400),
without disclosing whether another conversation/tenant owns that message.
Unknown fields, malformed UUIDs/cursors, arrays and invalid filters are rejected.

## Search, ordering and projections

- Page size defaults to 25, maximum 100. Cursors are opaque base64url JSON markers,
  validated as untrusted input. They never grant tenant scope or access to an object.
- `search` is a trimmed, case-insensitive literal substring of Contact name or E.164
  phone (maximum 100 characters). `%` and `_` are escaped, not wildcard features.
  Phone searching uses stored normalized text; local-number normalization and message-body
  search are not included.
- Optional `status`: OPEN, PENDING, CLOSED or ARCHIVED; `accountId`: UUID;
  `unread`: exactly `true` or `false`. Omitted filters include all eligible records.
- Inbox order: `coalesce(last_message_at, created_at)` descending, then UUID descending.
  History order: stored `created_at` descending, then UUID descending. Provider timestamps
  are displayed separately; they do not reorder receipt history or read acknowledgements.
- Cursor timestamps retain PostgreSQL precision. Do not round-trip them through JavaScript
  Date conversion. Live inbox ordering is not a frozen snapshot: refresh from the first
  page to reconcile conversations moved by new activity.
- Conversation summaries include Contact identity/consent, account state, assignee ID,
  status, automation state, unread count, last activity, window expiry and a computed
  `serviceWindowOpen` hint. This hint is not authorization to send.
- History includes persisted content/type/direction/status, safe error code and timestamps.
  It excludes credentials, internal policy decisions, client idempotency keys and raw webhook
  envelopes. Media references already in stored content are not downloaded or signed here.
- Contact joins enforce tenant ownership and `is_deleted=false`. Deleted Contact history
  is hidden from ordinary inbox APIs, not deleted. Disconnected account history remains
  readable; outbound eligibility stays enforced separately by the common messaging service.

## Shared unread and close/reopen behavior

GET is read-only and never sends a Meta read receipt. Unread state is shared by the tenant
team; no per-agent read table exists in this MVP.

Mark-read validates the message belongs to this tenant/conversation, locks the Conversation,
counts inbound messages stored after that boundary and caps the result at the current
unread count. Older/repeated acknowledgements cannot increase unread. An inbound transaction
that is still waiting to increment the same Conversation row increments after the command
commits, so the acknowledgement does not consume that later arrival. No client timestamp
is trusted as a read boundary.

Mark-unread keeps any existing count, otherwise sets one when inbound history exists;
outbound-only/empty history stays at zero. It is a manual attention flag, not a reconstruction
of each agent's reading activity.

Close sets CLOSED; reopen sets OPEN. They preserve unread, message delivery, consent,
assignment, service window and automation state. New inbound activity still follows TASK-060's
existing reopen behavior. They neither cancel queued sends nor stop automation.

Commands run through one service-owned transaction, with repository-only SQL. Actual state
changes append redacted audit metadata atomically; no-op retries return state without another
audit entry. No new message content is copied into audits.

## Verification boundary

Formatting/lint/typecheck/build are the implementation gate. Runtime acceptance, concurrency,
SQL integration and permission tests remain PENDING for TASK-065 (see T061 cases in TEST_PLAN).
No automated test files are created/updated or tests executed during TASK-061.

Recorded static verification: API/contracts lint/typecheck/build passed (11 tasks including
dependency builds), formatting passed and `git diff --check` passed. Runtime cases remain pending.
