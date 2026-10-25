# Storage-free preview — local checkpoint

2026-10-21: TASK-082.4.6 / CLAR-070 / ADR-029.

Existing reporting/bounded direct CSV, development WhatsApp setup/explicit sync, templates
and campaign drafts/internal approval/report reads now register without S3/SMTP/scanner.
Campaign services block preflight and all non-review commands before queued writes. Imports,
Inbox, automation, webhooks and MessagingService remain absent. Full mode unchanged.

## Results

- Configuration: 10/10 tests, including production preview without storage/email/Meta,
  optional invalid Meta rejection and full-loader preview rejection.
- Focused campaign/template/WhatsApp/report unit regressions: 29/29.
- Disposable PostgreSQL/Redis: 12/12 tests (11 scenarios plus parent), including prior
  password/migration/role onboarding checks and expanded preview HTTP scenario. Actual API
  boots without storage/email settings; reports, mapping, template/draft inserts and CSV
  succeed; foreign campaign/template access fails; delivery/preflight return 503 with no
  outbox writes; Inbox/automation/webhook GET paths absent. Missing Meta credentials fail
  locally; mocked successful sync enables template creation. No real provider requests.
- Chromium mocked API: 4/4, including preview navigation/disabled links/requests and prior
  mandatory-password handover regressions. Not browser-to-real-DB E2E.
- Config/API/Web builds passed. Initial Web font download failed under network restriction;
  network-enabled retry passed. Schema remains 35 tables; no migration introduced.

Internal approval logic is covered by existing focused unit tests, not a new complete
real-HTTP approval/invalidation matrix. Extended preview role/UI/tenancy matrices, hosted
verification and live Meta validation remain separate. No launch/capacity/cost guarantee.

## Isolation and reproduction

Build config/API via npm run build --prefix. Run node --test for config dist/runtime-config.test.js
and API dist campaign/template/WhatsApp/insights test files. Integration uses the existing
test:password-change:integration suite, a fresh disposable PG database and Redis only, with
the source's exact guarded PASSWORD_TEST_DATABASE_URL. Never load .env or use the application
database. Test ports 55439/56439 bind only loopback. Verify pg_isready before execution.
Browser: playwright test --config playwright.password-change.config.ts, using production Web.

Early new fixture failed correctly on creating templates before sync; fixed by explicit
mocked sync. One retest started before PG readiness and failed connection checks; the
passing run followed readiness confirmation. No application DB/queues, hosted migration,
Railway mutation, live Meta call, commit or push. Disposable containers removed after tests.

Registered API/config/Web lint is the normal gate. Ad-hoc lint of workspace-app.tsx exposes
pre-existing findings excluded by the Web script; root browser-test lint lacks project-service
configuration. Expanded ad-hoc lint is not claimed as passing or silently fixed in this scope.
