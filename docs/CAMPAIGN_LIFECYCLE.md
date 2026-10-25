# Campaign approval and delivery — TASK-055

Implementation status: static/build verification only; automated acceptance coverage is deferred
under CLAR-026. This document describes the implementation, not production verification.

## Review and material version

Drafts store the UTC `schedule_at` and IANA `schedule_timezone` before approval. An empty
schedule means immediate delivery. A changed instant, timezone, audience, account, mapping, or
template selection invalidates User approval and increments `content_version`. Timestamp
comparisons use the actual instant, so equivalent ISO offsets do not create false edits.

A User submits the saved material version for review. Submission pins the selected template's
`content_version`. A different active Tenant Admin approves or rejects the pending version;
rejection requires a reason. Admin-created/materially Admin-edited work uses `NOT_REQUIRED`.
Editing a previously pinned template requires saving the draft and reviewing the new material
version. Approval and version transitions are audited in the same transaction.

Once accepted for delivery, the campaign is no longer editable. A template change blocks
remaining sends. Existing recipient/message history is retained; changing content after a start
requires cancelling remaining work and preparing a new campaign for a new review, rather than
rewriting queued or accepted messages.

## API and permissions

All routes use `/api/v1`, live tenant authentication, and deny Super Admin customer-content
access. Commands require `expectedContentVersion` and the latest opaque `expectedRevision`.
Unknown command/body fields are rejected.

| Route | Permission | Additional payload |
| --- | --- | --- |
| `POST /campaigns/{id}/request-approval` | `campaign.write`, Tenant User | — |
| `POST /campaigns/{id}/approve` | `campaign.approve`, Tenant Admin | — |
| `POST /campaigns/{id}/reject` | `campaign.approve`, Tenant Admin | `reason` |
| `POST /campaigns/{id}/send` | `campaign.send` | `idempotencyKey`; draft has no schedule |
| `POST /campaigns/{id}/schedule` | `campaign.send` | `idempotencyKey`; saved future schedule |
| `POST /campaigns/{id}/pause` | `campaign.send` | — |
| `POST /campaigns/{id}/resume` | `campaign.send` | — |
| `POST /campaigns/{id}/cancel` | `campaign.cancel` | — |
| `GET /campaigns/{id}/report?cursor={uuid}` | `campaign.read` | 50-row UUID cursor page |

All command routes also require `campaign.read` for returning the refreshed representation.
Start identity is retained on the campaign for its lifetime. Reusing a start key with the same
actor/action/version/revision returns the existing campaign; a changed request conflicts. A
different key cannot start an already-started campaign again. The UI retains a key for retries
of a saved revision/action. Recipient message keys are deterministic and messages are linked to
recipients atomically with their usage reservation and message outbox record.

## Durable execution and final preflight

Send/schedule acceptance sets `QUEUED`. PostgreSQL retains the request even if the browser,
worker, or Redis restarts. The worker scheduler calls `CampaignExecutionService`; its
repository alone accesses Drizzle/SQL. A campaign row lock serializes schedulers, review,
pause/cancel, composition, and provider claims. Multiple worker processes cannot compose the
same recipient concurrently.

The scheduler creates a fresh final preflight run and identifier-only outbox event. The existing
BullMQ preflight relay/processor resolves the audience. A diagnostic preflight is never reused
as authorization to send. Blocked/failed final preflight pauses the campaign with a visible
reason. After a successful final preflight, future delivery becomes `SCHEDULED`; when due, a
fresh preflight runs again before expansion. No Message is created before this succeeds.

Live sender membership/permission and, where required, active Admin reviewer/permission are
checked again. A background send does not depend on an expired browser access/refresh session.
Template version and exact campaign approval remain mandatory throughout execution.

The scheduler composes at most 25 recipients per transaction through the existing
`MessagingService.createOutboundMessage`. A service-supplied transaction makes message creation,
usage reservation, outbox, and recipient link atomic. It creates/reuses the tenant/account/Contact
conversation needed by the common composer. It does not create another provider-sending path.

The full uncomposed remainder must fit the available UTC-month quota before each batch. This
check shares the existing tenant/month advisory lock with the composer. Quota is reserved only
by actual Message creation. If another operation consumes quota between batches, expansion
pauses rather than truncating the selected audience silently. Policy failures roll back that
composition batch and pause the campaign; already-committed batches retain their evidence.

`RUNNING` becomes `COMPLETED` once no pending recipients or CREATED/QUEUED/SENDING messages
remain. Completion means dispatch finished, not that every recipient received a message;
reports retain individual failures and later delivery/read webhook updates. Ambiguous SENDING
messages retain the existing manual-review boundary.

## Pause, resume, and cancellation

The provider submission boundary is the committed `SENDING` claim. Pause prevents later claims;
an already-claimed submission may finish. Paused jobs move to BullMQ delayed state without
spending provider retry attempts. Resume rechecks campaign/template approval, sender access,
and quota. If no expansion started, it creates a new final preflight. Existing snapshots are
not replaced after messages have been composed.

Cancel permanently marks unclaimed CREATED/QUEUED messages and remaining pending recipients
`CANCELLED`. It does not recall a provider-accepted or already-claimed message. Rows, usage,
and audit evidence remain available. Provider failures do not automatically refund usage.

## Reports and UI

Integration review corrected preflight audit parameter types and changed custom preflight job
IDs to `campaign-preflight-{runId}`: the installed BullMQ validator rejects a two-part colon ID.
The delivery-webhook queue uses `webhook-event-{eventId}` for the same reason. These corrections
are included in TASK-055; the separate Contact-import correction remains TASK-059.

The Campaign workspace opens drafts and running/terminal campaigns. It provides saved-version
review, rejection reasons, schedule fields, confirmation, pause/resume/cancel, actionable
failure states, and report refresh/pagination. Reporting joins recipient rows to the current
Message state so it shows SENDING/SENT/DELIVERED/READ/FAILED/CANCELLED accurately without
waiting for a separate aggregate projection. Responses include `asOf`; refresh is explicit.
Recipient pages expose IDs, states and safe reasons, not message bodies or rendered variables.

## Runtime and migration

Apply migration `0008_campaign_lifecycle` with the existing controlled `pnpm schema:migrate`
command before starting updated services. The table count stays 35. No live Meta call is needed
to apply the migration.

The worker imports the server-only `@whatsapp-platform/api/campaign-runtime` module, which
exports the application service and common composer without starting HTTP/auth controllers.
The API must be built before the worker; the workspace dependency and Turbo graph enforce it.
This reuses the approved application logic while keeping background execution in the worker.
The runtime database module owns an additional bounded PostgreSQL pool alongside the worker's
existing raw-SQL pool; account for both when budgeting connections.

The owner authorized the Phase 5 testing checkpoint on 2026-10-15. Local results and remaining
recovery/load coverage are in `PHASE_5_TEST_REPORT.md`; partial coverage is not production
certification. The real database test exposed unsupported schema-qualified `FOR UPDATE OF`
SQL in the common composition gate. Its supported joined-query `FOR UPDATE` now locks both
campaign and recipient rows; lifecycle and concurrent-expansion retests passed.
