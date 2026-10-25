# Testing and Acceptance

## Test strategy

| Level | Coverage |
|---|---|
| Unit | Policy gates, permissions, template/variable validation, state transitions, automation nodes |
| Integration | Database, queue, storage, webhook verification, provider adapter, realtime authorization |
| Contract | Provider payloads/responses, internal events, OpenAPI compatibility |
| End-to-end | Onboarding through contact, campaign, webhook, inbox, reply, automation, and handoff |
| Security | IDOR, privilege escalation, tenant isolation, token leakage, webhook spoofing, uploads |
| Load | Campaign dispatch, webhook bursts, imports, inbox queries, worker scaling |
| Chaos/failure | Provider timeout, duplicate/out-of-order events, worker crash, Redis/DB outage |
| UAT | Real client workflows, admin support, reports, and handoff |

## Critical acceptance scenarios

### Tenant and authorization

- A protected request succeeds only while its exact PostgreSQL session, user, role,
  membership, and tenant remain active; revocation takes effect on the next request.
- Permission checks require every declared key. Tenant-content routes reject Super Admin
  before any tenant repository call and accept only the authenticated membership tenant.
- Users can list only their active sessions and revoke only an owned current/remote
  session family; revocation and redacted audit evidence commit together.
- Client A cannot access Client B contacts, campaigns, conversations, messages, media, exports, or realtime channels.
- Role and permission checks apply in UI and backend.
- Super Admin may create/activate Tenant Admins and inspect approved user/account metadata, billing, operational health, global aggregates, and redacted audit metadata; those actions are explicit and audited.
- Tenant Admin and Tenant User each have exactly one active tenant membership and cannot switch to another business through API, UI, jobs, exports, files, or realtime channels.
- Super Admin is denied tenant contact records/PII, conversation and message content, recipient-level campaign results, customer media/downloads, raw provider payload content, content search, detailed customer-data exports, and tenant-content realtime channels.
- Super Admin projections and audit snapshots contain no fields or payload fragments that can reconstruct customer content.
- The MVP exposes no Super Admin break-glass customer-content route or screen.
- The authorization foundation is tested with two tenants and a Super Admin before
  tenant-content modules exist: cross-tenant token claims fail, Tenant User permission
  escalation fails, cross-user session revocation fails, Super Admin tenant-scope
  acquisition fails, and the Super Admin identity projection contains no other tenant
  identity fields. Each future content endpoint extends this matrix with its own data,
  export, storage, job, and realtime authorization tests.
- Package features and limits are enforced server-side.

### Onboarding and credentials

- A supported client completes the approved WhatsApp onboarding flow.
- Tenant, WABA, and phone mappings are correct.
- Webhook subscription and health check succeed or provide actionable failure.
- The browser never receives a permanent provider credential.
- Disconnect/revocation prevents future sends and preserves permitted history.

### Contacts and imports

- CSV/XLSX column mapping, default country, normalization, duplicates, consent, and invalid rows behave as documented.
- Large imports run asynchronously.
- Every rejected row has a reason and no record is silently discarded.
- Cross-tenant group membership is impossible.

### Campaigns and messaging

- Browser closure does not stop campaign processing.
- Preflight blocks disconnected account, unapproved template, invalid variables/media, or exceeded entitlement.
- Opted-out contacts cannot receive prohibited marketing campaigns.
- Duplicate campaign-start requests do not duplicate recipient sends.
- Pause/cancel semantics match what is actually stoppable.
- Provider acceptance, delivery, read, and failure states update correctly.
- User-created or materially User-edited campaigns schedule/send only after a different active Admin of the same tenant approves the exact current content version.
- A User change to audience, content/template, variables, sending account, or schedule invalidates approval and blocks API/worker dispatch until reapproved.
- User-created or materially User-edited templates require exact-version Admin approval before provider submission or campaign use, and Meta approval remains independently required.
- Self-approval, cross-tenant approval, stale-version approval, direct endpoint calls, job tampering, and replay cannot bypass the approval gate.
- Admin-authored or materially Admin-edited campaigns and templates need no second internal approver; routine permitted User operations do not incorrectly enter approval.

### Webhooks

- Invalid verification token or signature is rejected.
- Duplicate webhook events do not duplicate inbox messages, statuses, usage, or automation actions.
- Out-of-order events do not corrupt message state.
- Inbound events resolve to the correct tenant, account, contact, and conversation.
- Persisted events can be retried/replayed safely.

### Inbox and automation

- Authorized agent replies reach the provider/customer path.
- Outside the allowed service window, composer and backend enforce templates.
- Interactive response IDs follow the configured edge.
- Published version remains stable for an active run after edits.
- Two concurrent events do not advance the same run twice.
- Human handoff stops unwanted automation and routes the conversation.
- Account disconnection disables sending without erasing history.

### Reliability and operations

- Transient provider/API failures retry without duplicate messages.
- Permanent validation/policy failures do not retry endlessly.
- Worker crash recovery does not lose or duplicate accepted work.
- Queue, webhook, provider, database, and storage failures trigger monitoring.
- Backup restore meets the documented RPO/RTO during scheduled tests.

## Definition of done

A feature is complete only when authorization, tenant isolation, plan/policy gates, error states, auditability, metrics/logging, automated tests, API documentation, migrations, operational notes, and user-facing recovery behavior are implemented where relevant.

## Test data and environments

Use synthetic or explicitly approved test data. Keep test/staging provider accounts and credentials separate from production. Sanitize recorded provider fixtures. Never copy production conversation data into lower environments without an approved privacy process.
