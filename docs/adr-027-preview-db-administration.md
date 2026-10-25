# ADR-027 — Enable existing database-only preview administration

Approved2026-10-19, CLAR-068; TASK-082.4.4. Amends ADR-024's preview allowlist only.

## Reason and decision

The bucket is for files, not business/user administration. The original preview excluded
more than its actual dependency constraints required. Reuse existing PlatformController,
PlatformInsightsController, PlatformReportExportController and UserController with their
existing services/repositories in both full and preview composition. No new persistence,
service, dependency, business workflow, role or grant. No full-mode registration change.

Super Admin gets the existing dedicated PlatformWorkspace: business/first Tenant Admin
creation, business activation/suspension, metadata/aggregate overview, subscriptions/usage,
manual payment records, redacted audit and bounded platform CSV. Existing plans/subscription
administration APIs are also registered; no new UI controls are invented. CSV is generated
directly from bounded DB projections, not stored in a bucket or dispatched to a worker.
Tenant Admin gets existing Team controls for same-tenant regular users. Tenant Users cannot
manage accounts. Existing password, audit, session-revocation and soft-delete rules remain.

Do not infer a new ability to create/delete Super Admins, delete business Admins, create
default plans, seed demo identities or perform payments automatically. Only implemented
operations are exposed. Manual payment recording is not a payment gateway or financial transfer.

Platform services still require live platform identity/permissions and expose only authorized
metadata/aggregate projections, never customer Contacts, message bodies/history or recipient
exports. Super Admin never mounts the tenant workspace. Tenant Admin/User remain bound to one
business. Preview UI explains capabilities accurately and does not grant permissions.

## Dependencies and limits

Keep the same Web/API/PostgreSQL/Redis layout. No bucket/scanner/mail/provider/workers needed
for these paths. Imports, files/media, WhatsApp setup/templates/provider calls, campaigns,
Inbox, sending, automation, webhooks and tenant reports stay absent server-side and hidden
in preview. Full/local mode and secure cookies/origin/proxy controls remain unchanged.

## Verification and rollback

Tests remain owner-deferred; pending T082-AD01–04 cover real module boot without external
dependencies, live permissions/tenant/PII boundaries, account flows/exports and full regressions.
Static builds do not certify those runtime cases. No hosted user/payment mutations performed.
Rollback is a source redeploy with the previous preview allowlist/UI; no data is deleted.
