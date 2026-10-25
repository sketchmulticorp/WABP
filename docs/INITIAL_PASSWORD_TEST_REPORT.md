# Initial password handover: local test checkpoint

Date:2026-10-19. TASK-082.4.5.2–3 / CLAR-069.
Status: **focused checkpoint passed; broader deferred coverage remains**.

## Executed evidence

- Unit/auth regression command: `npm run test:password-change --prefix apps/api`.
 30/30 passed: DTO, service policies/lock order, gate, login/refresh, cookies and me.
- Browser command: `node_modules/.bin/playwright.cmd test --config playwright.password-change.config.ts`.
 3/3 Chromium tests passed against production Next build, mocked APIs only: reload gate,
 mismatch without request, success/fresh-login handover, safe server error and sign-out.
 No Contacts/Groups/workspace requests occur before completion in these scenarios.
- Real integration command: `npm run test:password-change:integration --prefix apps/api`.
 Requires fresh disposable services below and explicit PASSWORD_TEST_DATABASE_URL.
 Final expanded suite: **11/11 passed** (10 scenario subtests plus parent).

Passing real PostgreSQL16/Redis7 scenarios:

1. Apply first nine migrations, insert existing account, apply migration10 twice:
 existing account stays false,10 migration records,35 application tables.
2. Real Argon2id replacement clears flag/increments version, revokes all sessions,
 writes exactly one redacted audit; old login/access/refresh fail, new login succeeds.
3. Inject audit INSERT failure: credential hash, flag, version and session state roll
 back together. Trigger/function removed in finally.
4. Hold real user advisory lock, observe three waiters for login/refresh/change,
 release: change succeeds and no old session remains active.
5. Duplicate concurrent changes: exactly one succeeds, one audit, one version increment.
6. Preview Nest HTTP: restricted me, protected route denials, foreign Origin/overpost
 rejection, cookie expiry, old session rejection and new-password login.
7. Same HTTP scenario through the full module registration. No provider calls initiated.
8. Actual platform service creates a new business/Admin with scoped roles; Admin login,
 password handover and exact catalog grants pass. Admin creates Team User; User login,
 handover and exact User grants pass (no platform/dashboard or campaign approval).
 Soft-delete and restore keeps the same UUID and prior false password-change flag.
9. Distinct businesses have distinct User roles. Foreign role/membership corruption
 fails both login and existing-token authorization; foreign Admin cannot delete user;
 Team lookup with no role in its tenant fails rather than selecting another tenant.
10. Duplicate Admin email rolls back new tenant/roles/grants and leaves existing user
 credential/session state unchanged.

## Failure found and approved repair

The original PlatformRepository business/Admin creation threw:
`The system Tenant Admin role is missing.`

Fresh bootstrap supplies only Super Admin. Platform creation selects global TENANT_ADMIN;
Team creation similarly selects global TENANT_USER. CLI seed and existing live principal
eligibility instead use tenant-owned roles. Merely inserting global roles would not meet
the existing tenant-role eligibility rule. Fixtures for handover tests deliberately use
valid tenant roles; their success does not establish real onboarding success.

Owner approved TASK-082.4.5.3. PlatformService now orchestrates tenant creation,
TenantRoleProvisioningService using existing SeedRepository/catalog for two scoped
roles/grants, Admin/membership persistence and audit in one transaction. Team resolves
its own tenant's active system User role. Existing authorization and restore flag remain
unchanged; no old-account reassignment, new schema or cloud/backfill operation. Regression
now passes. This corrects the existing architecture, not a global-role policy exception.

Original diagnostic run:9 total/7 pass/2 fail (including parent); final expanded run:
11 total/11 pass. Previous fixtures and failure evidence are retained as history.

## Reproduction and isolation

The integration file rejects any database URL except this disposable endpoint:

```powershell
docker run --detach --name whatsapp-password-test-pg --label codex.task=TASK-082.4.5.2 --publish 127.0.0.1:55439:5432 --env POSTGRES_USER=password_test --env POSTGRES_PASSWORD=disposable_test_only --env POSTGRES_DB=password_test postgres:16.15-alpine
docker run --detach --name whatsapp-password-test-redis --label codex.task=TASK-082.4.5.2 --publish 127.0.0.1:56439:6379 redis:7.4.11-alpine
docker exec whatsapp-password-test-pg pg_isready -U password_test -d password_test
$env:PASSWORD_TEST_DATABASE_URL='postgresql://password_test:disposable_test_only@127.0.0.1:55439/password_test'
npm.cmd run test:password-change:integration --prefix apps/api
```

Wait until pg_isready reports accepting connections. Requires fresh PG container for
each suite run. These are test-only values, not application credentials. No .env read,
application DB migrations, main volumes, Railway, live Meta or account mutations.
After this checkpoint the two labeled test containers and their throwaway anonymous
volumes were removed. Disposable fixture data is discarded; application data unchanged.

Initial failures repaired in test code: UUID/text parameter reused in fixture SQL;
starting before PostgreSQL readiness; invalid silent log level; missing mock data
envelope; alert locator also selecting Next route announcer. Sandboxed Playwright
could not cleanly stop its own Windows server; clean rerun with process permissions
exited0. API compilation/full lint,35-table verifier, Drizzle metadata check,
test/source formatting and diff checks passed. The separate insights integration
constructor fixture was updated for required DI but that suite was not executed.

## Remaining coverage

- Real Admin/User provisioning-to-login and completed-account restore now pass.
 Pending-account restore and CLI seed idempotence/flag permutations are not fully covered.
 No claim that all PC01–07 cases passed.
- HTTP password-change limiter boundary/Redis outage, account/membership mutation
 timing variants, complete log redaction capture and stale client generation remain.
- Browser slow/duplicate-submit, network-loss-after-commit recovery, responsive and
 keyboard matrices remain beyond the three focused cases.
- Earlier bootstrap, preview transport/HTTPS, account-management and Templates deferred
 inventories remain open. No hosted launch/security/capacity certification.
