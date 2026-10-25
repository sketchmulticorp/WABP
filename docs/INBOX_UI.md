# Shared Inbox UI — TASK-066

Approved CLAR-036, 2026-10-16. Inbox is mounted in existing tenant workspace navigation,
with desktop list/detail panes and mobile drill-in/back behavior. Existing backend permissions
and policies remain authoritative; no provider, schema or dependency change.

## Delivered flow

- Conversation name/phone search, status/unread filters and cursor pages.
- Selected thread with account/consent/automation/unread/window states, stored message order,
  safe text/template display, delivery/error codes and explicit read/unread/close/reopen.
- TEXT and eligible TEMPLATE composer with parameter fields and persisted template text.
  Confirmation precedes submission. Closed/active-bot/disconnected/suppressed/window guidance
  disables obvious invalid sends; the server still revalidates every attempt.
- Assignment/unassignment with active same-tenant name/ID options and bounded option pages.
- Internal plain-text notes with their own pagination; no edit/delete/send affordances.
- One keyed, visible/online polling hook; focus/reconnect/manual/action refresh. Hidden,
  offline, unauthorized and disposed views follow ADR-021 cancellation/recovery rules.

GET /conversations/assignees is a static route before /:id, guarded by conversation.read/assign.
Controller delegates to the collaboration service, which uses the existing member repository.
Returns assignees[{id,displayName}]/nextCursor only; no emails, customer data or auth fields.
Uses existing 25/default, 100/max timestamp/UUID cursor semantics and eligibility checks.

## Deliberate MVP behavior

Read acknowledgements are explicit, never triggered by polling/opening. Older message/note
pages are separate from the latest polled snapshot; return-to-latest controls reconcile current
state without replacing older pages unexpectedly. These are receipt-history pages, not a
continuous infinite-scroll transcript or instant server push.

Reply/note drafts are retained per conversation in memory while Inbox remains mounted.
Nothing is written to localStorage; leaving the Inbox/logout discards drafts. Uncertain reply
failures retain the request key for unchanged retry. Editing starts a new action; users are
warned to check history first. A known server rejection may use a new key after correction.
Notes similarly retain the UUID for unchanged retries. Accepted replies show asynchronous
status, not a claim of delivery; errors remain inline.

Template options reuse template.read; lack of that permission shows guidance, not a new
permission bypass. Missing/inactive/not-yet-loaded assignee names display an ID fallback,
never a guessed identity. Historical note authors other than the current user have an ID
fallback. Attachments/unsupported interactive content show a labeled placeholder; media
download/rendering remains outside these approved provider capabilities.

## Scope and verification

API/web lint/typecheck/build passed 12 tasks including dependencies. A wider lint trial found
legacy workspace-app form/effect lint debt; TASK-067 records it separately. Rules were not
disabled: the complete new Inbox module and shared API client remain linted; workspace
integration is typechecked/built. Do not claim the legacy workspace file has a clean lint run.

TASK-065.3 expands local coverage to nine API SQL/HTTP cases, eight webhook SQL cases,
fifteen Inbox browser cases and seven isolated authentication-client cases. See
`PHASE_6_TEST_REPORT.md` for mocked-versus-real boundaries and remaining launch acceptance;
neither this UI nor passing local checks certify production or authorize live Meta sends.
