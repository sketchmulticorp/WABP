# ADR-022 — Basic automation runtime reuse

Status: Accepted by CLAR-038 (2026-10-16). Extends ADR-019/020; replaces no stack decision.

## Context and decision

Basic automation needs durable triggers and version-pinned advancement, but the application
already has a common composer, outbox and provider-delivery worker. Use the existing five
automation tables and protected JSON contracts, not a new workflow engine or microservice.

Expose server-only `@whatsapp-platform/api/automation-runtime` application services to the
worker, following the campaign-runtime precedent. Thin BullMQ adapters delegate to those
services. Reuse the shared MessagingService, policy/quota locks and outbound delivery worker.
Extend the existing official provider adapter for neutral BUTTONS/LIST messages. Alternate
adapters may omit this capability; delivery fails closed rather than falling back to a
different send mechanism. The browser never imports this runtime or provider package.

## Durability and security

- Inbound Message and identifier-only trigger outbox are atomic. Protected inbound policy
  metadata stores the processed receipt; OUTBOUND composition policy remains immutable apart
  from existing delivery metadata. Unmatched/ignored events are deduplicated too.
- Run continuation outbox payloads retain a processed marker in the same transaction as
  advancement; Redis envelopes contain IDs and event kind only. Services re-resolve the
  persisted event and reject mismatched envelopes.
- Published versions are not rewritten. Draft saves append snapshots and retire only prior
  DRAFT snapshots. Flow row locks plus tenant-authoring advisory lock serialize edits and
  active-keyword uniqueness. Historical graph rows are never hard-deleted.
- Runtime locks flow, sorted message keys, monthly quota, Contact, Conversation, then run.
  Contact precedes Conversation to match inbound ingestion. Use one captured composition
  timestamp per job so the quota lock and reservation month cannot diverge at midnight.
- Provider claims lock flow/Conversation before Message, coordinating pause/takeover before
  SENDING. No provider request holds SQL locks; already-claimed requests may finish.
- Text sequences wait for durable provider acceptance before composing their next message.
  Ambiguous SENDING is never resent. Bounded jobs yield through durable outbox continuation;
  failed transport jobs retain operator-review/replay evidence after five attempts.
- A publishing Admin's live membership/permission authorizes execution, not an interactive
  login session. Super Admin cannot obtain tenant content or act as runtime publisher.

## Consequences

API build precedes worker build. Account for all instantiated bounded database pools in
deployment connection budgeting; this is not a measured capacity claim. Continuation polls
use a five-second transport retry interval while provider acceptance is pending; interactive
waiting schedules its service-window deadline durably. No customer-facing delayed node is
introduced. No new workflow dependency, table or infrastructure service is required for the runtime.
CLAR-039 separately approves declaring Nest's already-installed Express version and its types
directly for the automation-only 2 MB HTTP parser; other route limits/raw webhook capture stay unchanged.

Automated runtime/SQL/provider-double/browser acceptance remains pending TASK-075. Live Meta
validation and deployment/load readiness retain separate authorization and task ownership.
