# Current state and document ownership

TASK-091 / CLAR-081: local source adds **Add Super Admin** for trusted partner provisioning,
mandatory initial-password handover and audited platform-only accounts. Not deployed or
used to create an actual account; runtime acceptance pending owner test choice. See
[partner creation](SUPER_ADMIN_CREATION.md). Existing hosted snapshots below remain historical.

Documentation reconciliation: 2026-10-25 (TASK-090 / CLAR-080). This is a dated reading
guide, not a live availability check or launch certification. Follow links for exact evidence.

## Recorded implementation and deployment

- Architecture: Next.js frontend, NestJS layered API/worker, PostgreSQL, Drizzle and Redis.
  Contacts/Groups included; Tags and Lead CRM excluded. The full MVP and the restricted
  hosted preview have different operational capabilities; do not confuse them.
- Current canonical schema: **35 tables**. Hosted migration checkpoint on2026-10-23 verified
  **11 applied migrations**, including0010 encrypted provider credentials. That count is not
  a statement about the ordinary local database, which must be checked separately.
  CLAR-077 retains separate SQL files per table; future structure changes use new versioned
  migrations and matching Drizzle/current per-table contract updates. Consolidation was withdrawn.
- Hosted preview checkpoint: https://web-production-92be3.up.railway.app; Web/API/PG/Redis
  were Online, login rendered and unauthenticated /api/v1/me was denied. API stays private,
  using the fixed Web proxy. Trial credit only; no paid upgrade or full-rollout approval.
- Preview exposes role-authorized administration, manual Contacts/Groups, reporting/direct
  CSV, WhatsApp setup, templates and campaign authoring/internal review. Optional direct
  Embedded Signup code is implemented and locally tested; actual Meta configuration,
  approvals/real-provider acceptance are distinct. Uploads/imports, Inbox, automation,
  sending/background jobs/webhooks and Worker/Scheduler are not enabled in hosted preview.
- Approved next deployment workflow: retain one Railway Pro project with isolated
  `development` and `production` environments. `development` follows `dev` and is the only
  environment authorized for current full-stack implementation/E2E/UAT preparation.
  `production` follows `main`; its current preview remains unchanged until the owner explicitly
  approves promotion after development acceptance. No Railway environment has been created or
  reconfigured merely by recording this workflow.
- First Inbox in the full application uses authorized REST polling (ADR-021), not SSE/WebSockets.
- Password handover and own Profile implementation are documented separately. Profile's
  automated/runtime acceptance remains pending owner test choice. Nothing in this cleanup
  changes deferred cases, pending safety work, real Meta authorization or customer launch gates.

## Which document answers which question?

| Question | Maintained reference |
| --- | --- |
| Scope and roles | [PRD](PRD.md), [roles and tenancy](02-roles-permissions-and-tenancy.md) |
| Architecture and layer boundaries | [Architecture](ARCHITECTURE.md), [backend LLD](../design-doc/MVP_BACKEND_LLD.md), [rules](../RULES.md) |
| Tables and schema change process | [Schema guide](DATABASE_SCHEMA.md), [machine-backed table manifest](../apps/api/database/schema/TABLE_MANIFEST.md), [database operations](DATABASE_OPERATIONS.md) |
| Current hosted preview configuration | [Railway limited preview](RAILWAY_LIMITED_PREVIEW.md) |
| Full development-to-production Railway plan, not current deployment | [Staging guide](RAILWAY_STAGING_GUIDE.md), [operations runbook](OPERATIONS_RUNBOOK.md) |
| WhatsApp connection/activation boundary | [Onboarding](WHATSAPP_ONBOARDING.md), [onboarding test evidence](WHATSAPP_ONBOARDING_TEST_REPORT.md) |
| Inbox transport and UI | [Refresh](INBOX_REFRESH.md), [Inbox UI](INBOX_UI.md), [ADR-021](adr-021-inbox-polling.md) |
| Profile and first-login credentials | [Profile](PROFILE.md), [initial password handover](INITIAL_PASSWORD_CHANGE.md) |
| Remaining tasks and test choices | [Tasks](../TASKS.md), [test plan](TEST_PLAN.md), [launch verification](LAUNCH_VERIFICATION.md) |
| Binding decisions and owner approvals | [ADR index](DECISIONS.md), [clarification log](CLARIFICATION_DECISION_LOG.md) |
| Dated work/verification history | [Memory](MEMORY.md), individual test reports |

## Reading and preservation policy

The numbered00–16 specifications remain baseline requirements; focused feature guides explain
implemented contracts and limitations. Where a baseline conflicts with an explicitly approved
later ADR/clarification, the later decision governs. Do not silently invent a new requirement
to reconcile a conflict: consult the recorded approval or ask the owner.

Memory, approval records, ADRs, proposals and test reports are evidence. Keep dates, outcomes,
failures, limitations and deferred cases intact. Historical counts and old URLs are not current
setup instructions. History is labelled in place so existing links remain valid; no evidence
files were moved or deleted. Static documentation checks do not verify application behavior.
