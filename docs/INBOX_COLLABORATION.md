# Inbox assignment and internal notes — TASK-063

Implemented under approved CLAR-034, 2026-10-16. Backend APIs only, reusing the existing
Conversation and conversation_notes tables. No migrations, new permissions or dependencies.

## Routes

Paths are under `/api/v1`; use the existing request-ID success/error envelopes.
All routes require conversation.read and active tenant membership; Super Admin is denied.
Conversations with deleted Contacts remain hidden, just as in TASK-061.

| Method/path | Additional permission | Input / result |
| --- | --- | --- |
| POST `/conversations/{id}/assign` | conversation.assign | `{ "assignedUserId": "<UUID>" }` or `{ "assignedUserId": null }`; returns conversationId/assignedUserId |
| GET `/conversations/{id}/notes` | None | limit/cursor; returns notes/nextCursor |
| POST `/conversations/{id}/notes` | conversation.reply | `{ "id": "<client-generated UUID>", "note": "Internal plain text" }`; returns note/idempotent |

POST returns HTTP 200 for new work and identical retries. UUIDs must be v4; unknown fields,
arrays, absent required fields and malformed input return 400. Note IDs and assignee IDs
are normalized to lowercase. Tenant, author, timestamps and provider/source routing cannot
be supplied by the caller.

Unknown/hidden conversations return CONVERSATION_NOT_FOUND (404). Invalid assignee IDs
return CONVERSATION_ASSIGNEE_INVALID (400), without exposing another tenant's user data.
Incompatible note ID reuse returns CONVERSATION_NOTE_ID_CONFLICT (409).

## Assignment

The service locks the tenant-scoped Conversation and reuses the existing Contact repository
member-validation query: assignee must be an active, non-deleted Admin/User with a non-deleted
same-tenant membership/role. This validates eligibility at request time, not a promise that
the account will remain active forever. A null assignee explicitly unassigns; omission is
not unassignment. Assigning the same eligible member again is a no-op without another audit.

Only assigned_user_id and updated_at change. Contact assignment, unread, status, window,
automation and queued messages remain unchanged. Assignment neither grants access nor
restricts the shared inbox, and does not perform handoff. Queue assignment is not included.

## Internal note history

- Notes are plain text, trimmed to 1–4000 characters. Clients must render them as text,
  not HTML. No attachments, edit or delete routes are included.
- A new user action generates a note UUID; retries retain that UUID and the same text.
  Existing primary-key conflict handling makes creation atomic without a new dedupe table.
  Exact same tenant/conversation/author/trimmed-text replay returns idempotent=true, with
  no second row or audit. Different authors/targets/text or a hidden ID collision conflicts.
- List notes separately from Message history, newest stored first by timestamp/UUID.
  Default limit 25, maximum 100; reuse validated opaque cursors with full timestamp precision.
  Each note returns id, conversationId, authorId, note, createdAt. Author identity is retained
  even if an account later deactivates; ordinary note listing never exposes other tenants.
- Creation locks the Conversation, then inserts/replays the note and writes a redacted
  audit atomically. Notes remain append-only history, not soft-deletable business records.
- Notes and assignment work on OPEN/PENDING/CLOSED/ARCHIVED and during automation, without
  reopening the thread or authorizing a customer reply. Notes do not alter unread, last
  customer/message activity, service window, assignment or automation.
- Neither action creates an outbound Message, outbox event, BullMQ job, Meta call or read
  receipt. There is no messaging/provider dependency in the collaboration service.

## Layering and audit

ConversationCollaborationController handles HTTP/parsing; its injected service owns
permission/state/idempotency decisions and transaction orchestration. ConversationRepository,
ConversationNoteRepository and the reused member validator alone execute persistence queries.

Actual assignment changes record CONVERSATION_ASSIGNED with previous/new assignee IDs.
New notes record CONVERSATION_NOTE_ADDED with note ID only. Never copy note text, Contact
PII or message bodies into audit metadata. Retry/no-op audit deduplication is intentional.

## Verification boundary

Formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies).
No test files changed, automated tests run or live provider calls. T063 cases in TEST_PLAN
remain PENDING for TASK-065, including SQL/concurrency/rollback/security acceptance.
Inbox UI remains a separately tracked implementation gap, not delivered by these APIs.
