# Bounded report exports — TASK-081

Approved CLAR-041 / ADR-023, 2026-10-16. Implements direct CSV downloads for the first MVP.
No background export jobs, stored files, public/signed links, new tables or dependencies.
Large exports remain deferred rather than silently executed in the API.

## API and authorization

Both endpoints are authenticated POSTs under `/api/v1`, with JSON request bodies:

- `/reports/exports`: active Tenant Admin/User only; tenant scope comes from live identity.
- `/platform/reports/exports`: Super Admin platform identity only, with null tenant context.

| Kind | Required permission(s) | Additional request fields |
| --- | --- | --- |
| dashboard (tenant) | report.read | None |
| dashboard (platform) | platform.dashboard.read | None |
| usage | plan.read | Platform requires businessId UUID |
| payments | billing.read | Platform requires businessId UUID |
| audit | audit.read | Optional filters object |
| campaign-summary | campaign.read + campaign.export | campaignId UUID; tenant route only |
| campaign-recipients | campaign.read + campaign.export + contact.read + contact.export | campaignId UUID; tenant route only |

Examples: `{"kind":"usage"}`, `{"kind":"campaign-summary","campaignId":"<UUID>"}`,
`{"kind":"payments","businessId":"<UUID>"}` (platform), and
`{"kind":"audit","filters":{"from":"2026-10-01T00:00:00Z","to":"2026-10-16T00:00:00Z"}}`.

Audit filters reuse TASK-080's strict from/to/action/actorId/result rules and optional tenantId
on platform only: default last 30 days, maximum 90 days, half-open range. No cursor or limit
is accepted. Unknown fields, arrays, missing required IDs and cross-route fields fail 400.
Platform campaign kinds are rejected at parsing and independently denied in the service.
Missing permissions fail 403; foreign/deleted campaign or missing/deleted selected business
uses the existing non-disclosing not-found behavior. No new permission grants or impersonation.

## Columns and meaning

- Dashboard: UTC period start/exclusive end, metric and count. Reuses current inventory,
  campaigns-created-in-month and current status buckets of Messages created in that month.
  Platform adds current business/active business/Admin totals. Not invoices or cumulative
  delivered-plus-read totals. Current inventory metrics are not restricted by the month.
- Usage: UTC period, reserved messages, limit, remaining, subscription ambiguity, plan name/
  code/status, subscription status/eligibility/start/end. Empty allowance means unavailable,
  not zero/unlimited. Reservations are not monetary charges or delivered counts.
- Payments: payment ID, exact minor-unit amount, currency, paid timestamp and reference.
  Entire bounded history, not the visible page or inferred date filter. **No operational
  notes even for platform exports**, no mixed-currency sums or inferred balances.
- Audit: existing safe id/time/tenant/actor/role/action/entity-type/result/request-ID summary.
  Full matching bounded range across pages. No metadata, before/after, entity ID, IP, email,
  user agent, contact values or communication content.
- Campaign summary: campaign ID/status, report as-of time, current delivery-status bucket
  and recipient count. Empty campaigns emit NO_RECIPIENTS/0. No template text or variables.
  Reuses retained delivery-history totals, including historical deleted-Contact recipients.
- Campaign recipients: campaign ID, active Contact ID/current E.164 phone, current delivery
  status, safe error code, recipient created/updated timestamps and sent/delivered/read times.
  Same-tenant campaign/Contact/message joins; deleted Contacts and deleted campaigns are
  excluded. Thus detailed rows can be fewer than retained aggregate totals. No names, emails,
  message bodies, rendered variables, snapshots, provider IDs/raw errors or raw payloads.
  Error strings outside uppercase letters/digits/underscore (1–100 characters) become REDACTED.

Reports are on-demand read snapshots, not a single cross-query financial snapshot. Delivery
can advance while a report is prepared; export does not pause jobs or alter campaign state.
Timestamp values retain PostgreSQL precision/offset or existing ISO projection values; no
browser-local reinterpretation. Payment amounts remain strings through serialization.

## Bounded CSV and transport

Hard limits: 10,000 **data** rows (header excluded), 10 MiB of UTF-8 bytes including BOM,
header, escaping and CRLF. Bounded queries request at most 10,001 rows to detect overflow;
existing payment/audit read services receive a server-owned limit, not a client override.
Results over either bound fail `REPORT_EXPORT_TOO_LARGE` (422); no partial/truncated download
or successful preparation audit. Audit users can narrow existing filters; campaigns/payment
histories that exceed limits cannot be exported fully until a future async path is approved.

All cells are quoted, embedded quotes doubled, CRLF rows, UTF-8 BOM for spreadsheet import.
Leading =/+/-/@ after whitespace/control/format characters, and initial tab/CR/LF, are prefixed
with an apostrophe. This intentionally treats +91 phones as text and may show an apostrophe
in plain-text readers. Commas/newlines remain inside quoted cells. Treat recipient files as
private customer data; local copies are outside application revocation/retention controls.

Success is HTTP 200 `text/csv; charset=utf-8`, attachment with fixed server filename,
Content-Length, Cache-Control: no-store and nosniff. Controller owns the raw response like
the existing webhook text route; the global JSON envelope is unchanged. Errors still use
the standard safe JSON envelope. The normal x-request-id response header remains available.

CSV is fully prepared and bounded before response headers/body. A redacted
REPORT_EXPORT_PREPARED audit records live actor/role, owning tenant (null for platform),
selected business identifier as targetTenantId metadata, kind, CSV format, row count, byte
count and request ID; no CSV cell contents or other filter values. Platform audit filters may
name a nonexistent business and legitimately return a header-only CSV; that filter does not
become an invalid audit-row foreign key. Failure to insert audit
blocks delivery. Prepared means generated and ready to respond, not saved by the browser.
Disconnect/abort after preparation may leave an audit without a completed download; explicit
retries create another preparation event. No claim of exactly-once downloads. Failed/denied
requests retain ordinary request/error logging; there is no extra export-failure ledger.

## Ownership and browser behavior

`apps/api/src/insights/exports`: controllers parse/transport; tenant/platform services enforce
scope and orchestrate existing insights/campaign services. Platform cannot reach the tenant
recipient repository. CampaignExportRepository alone selects detailed recipient rows;
ReportExportRepository alone persists redacted preparation audit. CSV/projection functions
are pure and explicitly map columns; no generic serialization of raw entity objects.

`apps/web/features/insights/report-export-button.tsx` is shared by overview, usage, billing,
audit and campaign report screens. Platform has only aggregate/metadata controls. Downloads
use the existing authenticated API client with the same single-flight refresh, late-401 token
reuse and login/logout generation rejection for both JSON and Blob responses. No tokens in
URLs, direct browser navigation to protected endpoints or second authentication path.
Click guards prevent simultaneous requests per control. Unmount/target/filter changes abort
the old request; obsolete scopes cannot trigger a download. A temporary local Blob URL is
revoked after 30 seconds. Recipient downloads ask for privacy confirmation. Errors remain
visible with retry via the same button; success says download requested, not saved to disk.
Audit export uses applied filters, not unsaved form input or the current page cursor.

## Verification boundary and rollout

Only static/build checks are authorized for implementation. T081-01–10 in TEST_PLAN.md remain
pending; historical passing suites do not verify new CSV/SQL/auth-client/browser behavior.
No live provider calls, production exports, payment operations, migration, gateway, deployment
or Git commit. Before customer launch measure bounded-query/memory/concurrent-export behavior
and configure appropriate deployment abuse controls under TASK-084/085/086. Per-file limits
are not a concurrency/rate limit or a verified 1,200-user capacity claim. Large async exports
need a new owner-approved task with job persistence, private storage, expiry and authorization.
