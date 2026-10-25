# Essential reporting, usage, billing and audit — TASK-080

Approved: CLAR-040, 2026-10-16. Implementation uses existing PostgreSQL tables, permission
catalog, shared browser authentication client and manual-payment workflow. No new dependency,
infrastructure, migration, pricing policy, invoice system or gateway.

## Ownership and authorization

`apps/api/src/insights` is strict Controller -> Service -> Repository. Thin controllers parse
bounded query DTOs and invoke services; services require live authorization/permissions,
derive periods and map usage/pagination; repositories and SQL read fragments alone query
PostgreSQL. `packages/contracts/src/insights.ts` is browser-safe. Tenant repositories require
the branded TenantRepositoryContext and explicit tenant predicates. Platform services require
SUPER_ADMIN, platform identity, null tenant context and the operation permission; they use a
separate platform repository, never a tenant-content repository. Shared SQL fragments contain
only the approved aggregate/usage/payment/audit projections, not customer DTOs or payloads.

Existing `/platform/dashboard` delegates to the new read service and preserves its three
existing count fields while adding aggregate activity. Active Admin counting now requires
non-deleted roles, tenants and matching active membership. Existing administration APIs remain
available; the new business selector is a bounded metadata-only projection, not tenant switching.

| Method/path under /api/v1 | Permission / scope |
| --- | --- |
| GET /dashboard | report.read; own active tenant only |
| GET /usage | plan.read; own active tenant only |
| GET /billing/payments | billing.read; own tenant, operational note never selected |
| GET /audit-logs | audit.read; own tenant only |
| GET /platform/dashboard | platform.dashboard.read; Super Admin aggregate-only |
| GET /platform/insights/businesses | tenant.read; Super Admin paginated id/name/status |
| GET /platform/insights/businesses/{id}/usage | plan.read; Super Admin selected non-deleted business |
| GET /platform/insights/businesses/{id}/payments | billing.read; Super Admin payment metadata including operational note |
| GET /platform/insights/audit-logs | audit.read; Super Admin safe summaries, optional business filter |
| POST /platform/tenants/{id}/payments | Existing plan.manage + billing.read and platform boundary; reused manual recording API |

Users receive no new permissions. Existing default User roles have report.read/plan.read but
not billing.read/audit.read; an Admin may grant permitted tenant capabilities through the
existing authorization model. Super Admin cannot call tenant routes. Platform membership is
not a bypass granting access to Contacts, conversations, message content or recipient details.

## Metric definitions

- Contacts and Groups: current non-soft-deleted inventory under non-deleted businesses.
- Open conversations: OPEN/PENDING threads with an active Contact; closed/deleted-Contact
  history is excluded from this current-work count.
- Campaigns: non-deleted campaigns created during the current UTC calendar month.
- Outbound statuses: Messages created during that month, grouped once by **current** status.
  SENT means provider acceptance; DELIVERED/READ remain distinct buckets, not duplicated totals.
  These historical aggregate counts preserve Messages even if their Contact is later deleted.
- Platform adds non-deleted tenant count, ACTIVE tenant count and active Tenant Admin count.
  It returns only aggregate numbers/statuses, never individual customer/message/recipient rows.
- Requests are on-demand, not continuously polling. No caches, materialized views or read
  replicas added. These are informational read snapshots, not transactional enforcement or
  verified deployment capacity. Dashboard filters/charts beyond this period are deferred.

## Usage, subscription and money

Quota comes from SUM(quantity) for OUTBOUND_MESSAGE_RESERVED in usage_events during [UTC
month start, next month start). This matches existing composition policy: reservation at
eligible Message creation, no double reservation for idempotent retries and no automatic
refund after provider failure. Message counts and reserved quota are intentionally different.

Usage returns the currently eligible subscription first, otherwise the latest recorded
subscription. Eligibility requires active business/plan, ACTIVE or TRIAL subscription and
effective dates. More than one eligible subscription produces an explicit ambiguity warning
and no calculated allowance. A non-negative safe integer monthly_message_limit on a single
eligible subscription produces remaining=max(0,limit-reserved). Otherwise the allowance is
shown as unavailable; this read model does not introduce/change the composer's enforcement
rules, infer commercial entitlements or grant sending permission.

Tenant billing is read-only. Histories show amount in original **minor units** as a string,
currency, paid timestamp and reference. Platform alone additionally receives the operational
note. There is no cross-currency sum/conversion, amount due, estimated Meta bill, tax, invoice,
refund, proration or automatic renewal. The non-commercial MVP_INTERNAL plan is not launch pricing.

Super Admin records a positive safe-integer minor-unit amount, ISO currency, UTC paid date,
reference and optional note through the existing API after explicit confirmation. Inputs are
retained on failed submissions; the UI instructs checking history/reusing the reference after
uncertain submission. The existing unique (tenant,reference) constraint is retained. This is
not a new payment-attempt/idempotency system and does not infer whether different references
represent one real-world payment. Successful recording confirms subscription dates/status
were not changed. A selected business is locked and checked as non-deleted inside the same
recording transaction; suspended businesses can still receive urgent manual records.

## Audit and pagination

Audit responses contain id, timestamp, tenant ID, actor ID/role, action code, entity type,
result and request ID. No entity ID, raw metadata, before/after data, email, IP, user-agent,
contact values, message bodies or notes are returned. Filters use exact action, actor UUID,
result and from/to timestamps. Only platform audit accepts tenantId. There is no customer-
content free-text search. Scope comes from authorization, never a request tenant override.

Audit defaults to the last 30 days and accepts at most a 90-day half-open interval. The UI
freezes the chosen interval across pagination. Invalid/unknown/array fields, malformed cursor,
UUID, timestamp/calendar or bounds fail validation. Audit/payment/business pages default to
50, maximum 100. Opaque cursors retain PostgreSQL timestamp precision plus UUID tie-breaking;
they never confer access. First-page reset and forward pagination are exposed in the UI.
Deleted businesses are hidden from these ordinary views; this is not an infrastructure
restore/compliance audit export or a retention/purge policy change.

## Frontend

`apps/web/features/insights` owns API reads, keyed/abortable loading, overview cards, usage,
payment history/form, filters and platform composition. Every read uses the shared API client;
path changes/unmount abort requests and do not render another scope's cached snapshot. Failed
reads clear their data and expose retry. A terminal payment-write auth failure clears its
history and removes the form. Payment recording never calls a gateway/provider.

Tenant navigation adds permission-aware Overview, Plan and usage, Billing and Audit log;
the previous tenant landing view is retained. Super Admin gets a separate PlatformWorkspace
before any tenant content screen is mounted. It supports platform summary, paginated business
selection, selected subscription/payments, recording and safe audit search. Business selection
does not impersonate the tenant. Tables scroll at narrow widths; forms/cards wrap, use labels,
semantic headers, status/error messages and confirmation for the payment write.

## Verification boundary

Implementation static verification is recorded in MEMORY.md. No TASK-080 test files were
created/updated and no automated tests, migrations, live Meta calls, payment requests,
customer-data operations or Git commits were performed. Existing Phase 7 passing results
remain historical and do not verify these changes. TASK-080 cases in TEST_PLAN.md are pending
at the owner-approved phase checkpoint. Exports are documented under TASK-081; deployment/launch acceptance
and measured scale remain separate tasks. Full tenant/plan-management UI is not introduced.

TASK-081 / CLAR-041 now implements bounded CSV controls for these views, using the same
projections and permissions. Payment exports exclude notes even for platform users. Audit
exports use applied filters across all bounded matching records, not only the current page.
See REPORT_EXPORTS.md and ADR-023; automated/runtime acceptance remains deferred.
