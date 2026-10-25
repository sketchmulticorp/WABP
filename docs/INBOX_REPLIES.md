# Agent reply API — TASK-062

Implemented under CLAR-033, 2026-10-16. This is backend-only; no inbox UI, attachments,
new provider message types, handoff UI or automation engine is added.

## Request and response

`POST /api/v1/conversations/{id}/messages` requires active tenant membership plus both
`conversation.read` and `conversation.reply`, checked by guards and the application service.
Super Admin is denied. The server resolves Contact/account from the authorized Conversation;
the body cannot supply tenant, Contact, account, campaign, source or approval state.

Text request:

```json
{
  "clientMessageKey": "reply-unique-per-user-action",
  "content": { "type": "TEXT", "text": "Hello, how can we help?" }
}
```

Template request:

```json
{
  "clientMessageKey": "another-unique-user-action",
  "content": {
    "type": "TEMPLATE",
    "templateId": "00000000-0000-4000-8000-000000000001",
    "variables": { "1": "Example" }
  }
}
```

Return HTTP 202 with the existing success envelope containing `id`, `idempotent`,
`messageType`, `status`. Initial acceptance normally returns CREATED; retries return the
stored message's current status. HTTP acceptance does not mean Meta delivered the message.
GET conversation history exposes subsequent states through the existing API.

Text is trimmed and limited to 1–4096 characters. Keys match the existing 1–128-character
composer format. Templates require a UUID and an explicit variables object (empty if none);
at most 100 named/positional string values, with bounded names/values and no prototype keys.
Unknown fields, malformed content and unsupported types return 400. The existing common
template checks enforce the exact variables and approved/supported template configuration.
TEXT and TEMPLATE text parameters are the current supported pipeline, not a new media API.

## One messaging path

Controller parses transport → ConversationReplyService resolves trusted targets →
MessagingService applies common policy and owns the transaction → MessagingRepository
persists Message, usage and redacted audit → existing outbox/BullMQ worker submits to Meta.
No controller/reply service queries SQL or calls a provider directly.

The common pipeline retains tenant/Contact/account checks, consent/suppression, service
window, template/version approval, subscription/plan/quota, durable handoff and delivery
retry/ambiguity rules. Routine permitted replies do not need separate Admin approval;
the selected template itself must already satisfy its approval rules.

## State and idempotency

- New replies are allowed only in OPEN/PENDING conversations with automation state
  NONE/PAUSED/HANDED_OFF. CLOSED/ARCHIVED returns `CONVERSATION_REOPEN_REQUIRED`;
  ACTIVE (or unrecognized automation state) returns `CONVERSATION_HANDOFF_REQUIRED`.
- State validation occurs inside the common composition transaction, under a Conversation
  row lock acquired after the existing message-key/quota locks. It is not an endpoint-only
  preflight vulnerable to a close/handoff race.
- State policy blocks follow the existing immutable FAILED Message/audit behavior: no
  reservation/outbox/send. They return the normal policy error envelope. After correcting
  a rejected action, submit a new user-action key; replaying the old key preserves its block.
- The server hashes actor ID plus client key into an `inbox:` namespace. Common tenant/key
  locking and normalized request fingerprints enforce one result. Different actors are
  isolated; reusing a key for a different conversation/content conflicts rather than sends.
- For an existing accepted key, the original result is resolved before new-reply state
  gates. Retrying after close does not create a second message or lose the accepted result.
  Ordinary authorization and target visibility still apply at the endpoint.
- Accepted new replies advance Conversation last activity using stored Message time in
  the same transaction, without changing unread, status, service-window expiry, consent,
  assignment or automation. Replays do not repeat activity/reservation/audit effects.
- Close/reopen still does not cancel previously accepted messages. New-reply automation
  checks do not implement a future bot start/handoff protocol; TASK-074 owns that workflow
  and must coordinate ownership with queued/in-flight messaging before enabling automation.

No real environment values, credentials, message bodies or template variable values are
copied to logs or reply audit metadata. No migration, permission or dependency was added.

## Verification boundary

Formatting and API/contracts lint/typecheck/build passed (11 tasks including dependencies).
No automated tests, test-file changes or live Meta calls were performed. T062 cases remain
PENDING under TASK-065, including concurrency, SQL behavior and provider-double verification.
Existing common INBOX composer unit doubles need the new inbox-state/activity repository
methods at that checkpoint; old passing test results do not verify these changes.
