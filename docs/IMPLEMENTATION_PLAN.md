# MVP Implementation and Sign-off Plan

Status: Ready for product-owner review  
Execution backlog: `../TASKS.md`

## Purpose

This document defines the build order, the outcome of each stage, the evidence required for acceptance, and the approval point before dependent work proceeds. `TASKS.md` remains the task-level execution tracker.

## Sign-off rules

- A stage is complete only when its listed deliverables and acceptance evidence exist.
- Automated checks must pass for the affected applications and packages.
- Security or tenant-isolation failures block sign-off.
- A demo is not a replacement for tests, migration evidence, or operational documentation.
- Product-scope changes must update the PRD, affected detailed documents, acceptance criteria, and task backlog before implementation.
- Approval records must include approver, date, accepted exceptions, and links to evidence.

## Gate 0 - Planning baseline

**Outcome:** The product, architecture, data, UX, security, testing, deployment, and build sequence are understandable before implementation.

**Deliverables**

- Approved PRD and explicit exclusions.
- Fixed MVP stack and deployment model.
- Critical application flows and design system.
- Backend/PostgreSQL low-level design.
- Security requirements and test strategy.
- Stage plan and task backlog.

**Acceptance evidence**

- The six-artifact mapping in `PRE_BUILD_READINESS.md` has no undocumented item.
- Contacts and Groups are included; Tags and Lead CRM remain excluded.
- Open decisions are assigned to the stage where they become blocking.

**Approval:** Product owner and technical owner approve the baseline before Gate 1.

## Gate 1 - Repository and local foundation

**Outcome:** A developer can install, configure, run, test, and build the monorepo consistently.

**Tasks:** `TASK-010` through `TASK-015`.

**Deliverables**

- pnpm/Turborepo workspace with `web`, `api`, `worker`, and shared packages.
- Strict TypeScript, linting, formatting, configuration validation, and root commands.
- Local PostgreSQL, Redis, and S3-compatible services.
- Structured logging, request IDs, health checks, standard error envelope, and CI.

**Acceptance evidence**

- Clean installation and documented local startup from a new checkout.
- Lint, typecheck, test, and production builds pass in CI.
- No real secret is committed; `.env.example` matches validated configuration keys.

**Approval:** Technical owner approves foundation stability before feature development.

## Gate 2 - Identity, tenancy, and database foundation

**Outcome:** Authentication and tenant isolation protect every later vertical slice.

**Tasks:** `TASK-020` through `TASK-026`.

**Deliverables**

- Approved ORM/query and migration tooling.
- Initial PostgreSQL migration, seed strategy, transaction helper, and outbox repository.
- Login, secure password storage, token/session rotation, logout, and revocation.
- Single-business Tenant Admin/User context, permission guards, scoped repositories, and aggregate-only Super Admin administration baseline.

**Acceptance evidence**

- Migrations work forward on a clean database and the documented rollback/recovery path is tested.
- Cross-tenant, tenant-switching, Super Admin content-denial, and privilege-escalation tests pass.
- Revoked sessions cannot access protected data.
- Audit evidence exists for sensitive administration actions.

**Approval:** Technical/security owner approves the authorization boundary before provider or customer data is added.

## Gate 3 - Official WhatsApp foundation

**Outcome:** A tenant can connect an approved WhatsApp account and the platform can receive durable, verified provider events.

**Tasks:** `TASK-030` through `TASK-036`.

**Deliverables**

- Internal provider interface and Meta adapter.
- Embedded Signup completion and secure credential references.
- Account/phone health, disconnect behavior, template synchronization, separate internal/provider approval, and exact material-version invalidation.
- Raw-body webhook verification, durable event persistence, idempotent processing, and replay tooling.

**Acceptance evidence**

- A staging tenant completes approved onboarding and template synchronization; User template submission/use is blocked until exact-version Admin approval and independent Meta approval.
- Invalid webhook signatures are rejected; duplicate valid events do not duplicate effects.
- Provider credentials never appear in browser payloads or logs.
- Disconnect and degraded-account behavior matches `APP_FLOWS.md`.

**Approval:** Product and technical owners approve the staging connection before messaging features depend on it.

## Gate 4 - Contacts and Groups vertical slice

**Outcome:** A tenant can safely create, organize, import, and suppress Contacts.

**Tasks:** `TASK-040` through `TASK-046`.

**Deliverables**

- Tenant-scoped Contacts and Groups schema, APIs, and UI.
- Consent, opt-out, suppression, and STOP handling.
- Secure asynchronous CSV/XLSX import with mapping, normalization, deduplication, and row-level results.

**Acceptance evidence**

- CRUD, membership, import, duplicate, opt-out, permission, and cross-tenant tests pass.
- Large imports continue after browser closure and expose accurate progress/results.
- Removing a Group membership never deletes the Contact.
- No Tags or Lead CRM behavior is introduced.

**Approval:** Product owner accepts the complete Contacts/Groups workflow before campaign audience work proceeds.

## Gate 5 - Messaging and campaigns vertical slice

**Outcome:** An authorized tenant can safely send an approved-template campaign with reliable tracking.

**Tasks:** `TASK-050` through `TASK-056`.

**Deliverables**

- Common outbound policy/quota gate, outbox publishing, BullMQ worker, retries, and dead-letter handling.
- Campaign draft, Contacts/Groups audience selection, material versioning, exact-version Admin approval for User work, recipient snapshot, preflight, scheduling, dispatch control, and reporting.

**Acceptance evidence**

- A confirmed campaign survives browser closure and process restart.
- Duplicate confirmation, jobs, and webhooks do not create duplicate sends or states.
- Suppressed/opted-out/invalid recipients are not sent messages.
- Pause/cancel and provider-failure behavior matches documented dispatch boundaries.
- Self/cross-tenant/stale approval and post-approval User edits cannot bypass API or worker campaign/template gates.

**Approval:** Product, technical, and compliance owners approve controlled staging sends before inbox/automation expansion.

## Gate 6 - Shared inbox vertical slice

**Outcome:** Authorized agents can receive, manage, and answer customer conversations.

**Tasks:** `TASK-060` through `TASK-065`.

**Deliverables**

- Inbound message resolution, conversation list/history, unread state, close/reopen, assignment, notes, replies, and realtime/polling updates.

**Acceptance evidence**

- Inbound messages reach only the correct tenant/account/conversation.
- Agent replies use the common outbound policy and message pipeline.
- Service-window/template restrictions are enforced server-side and explained in the UI.
- Duplicate events and reconnects do not duplicate visible messages.

**Approval:** Product/support owner accepts the agent workflow before automation handoff is enabled.

## Gate 7 - Basic automation vertical slice

**Outcome:** A tenant can publish a safe basic flow that processes supported events and hands off to an agent.

**Tasks:** `TASK-070` through `TASK-075`.

**Deliverables**

- Flow/version/node/edge/run persistence.
- Draft validation, immutable publishing, supported triggers/nodes, idempotent advancement, and human handoff.

**Acceptance evidence**

- Invalid graphs cannot be published.
- Active runs remain pinned to the version on which they started.
- Duplicate events, retries, and concurrent processing do not repeat completed side effects.
- Handoff reliably stops unwanted automation responses.

**Approval:** Product and technical owners approve supported nodes and handoff behavior.

## Gate 8 - Production readiness and launch

**Outcome:** The MVP is secure, observable, recoverable, capacity-tested, and approved for its initial workload.

**Tasks:** `TASK-080` through `TASK-086`.

**Deliverables**

- Usage/plan enforcement, audit search, dashboards, and basic exports.
- Railway staging/production configuration, private networking, backups, restore process, monitoring, alerts, and runbooks.
- Security review and the documented 1,200-user load/failure test.

**Acceptance evidence**

- Security and tenant-isolation release gates pass with no unresolved critical/high finding.
- Backup restore and incident response are exercised.
- Capacity tests meet the accepted latency/error/queue-drain thresholds.
- Production smoke test, rollback path, and support ownership are documented.

**Approval:** Product, technical, security/operations, and business owner give launch approval.

## Approval record

| Gate | Status | Approver(s) | Date | Evidence/exceptions |
|---|---|---|---|---|
| 0 - Planning | Pending review |  |  |  |
| 1 - Foundation | Not started |  |  |  |
| 2 - Identity/tenancy | Not started |  |  |  |
| 3 - WhatsApp foundation | Not started |  |  |  |
| 4 - Contacts/Groups | Not started |  |  |  |
| 5 - Messaging/campaigns | Not started |  |  |  |
| 6 - Shared inbox | Not started |  |  |  |
| 7 - Basic automation | Not started |  |  |  |
| 8 - Production launch | Not started |  |  |  |
