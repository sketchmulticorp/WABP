# Partner Super Admin automated checkpoint

2026-10-25 — TASK-091.1, CLAR-082. Local source only; no Railway deployment,
real partner accounts, ordinary development database changes or provider calls.

## Results

- Focused creation unit suite: 25 passed, zero failures/skips.
- Affected password/auth/authorization/current-user regressions: 32 passed, zero failures/skips.
- Disposable PostgreSQL/Redis integration: Node reports 15 passed (14 subtests plus
  their parent), zero failures/skips. Fresh database migrated to 11 migrations / 35 tables.
- Mocked Chromium browser suite: 11 passed, zero failures/skips; includes four existing
  initial-password cases and seven partner creation cases.
- API TypeScript build, API lint and diff whitespace checks passed after repairs.

Commands from repository root:

```powershell
npm run test:super-admin --prefix apps/api
# Integration requires fresh disposable services, not the ordinary local database:
$env:PASSWORD_TEST_DATABASE_URL='postgresql://password_test:disposable_test_only@127.0.0.1:55439/password_test'
npm run test:super-admin:integration --prefix apps/api
node_modules/.bin/playwright.cmd test --config playwright.super-admin.config.ts --workers=1
npm run lint --prefix apps/api
git diff --check
```

The actual integration execution used the compiled integration file directly from apps/api
after a successful API build. Its URL guard rejects other databases. Redis was bound to
127.0.0.1:56439. Only named, labelled test containers were used, with cached PostgreSQL
16.15 and Redis 7.4.11 images. The browser suite used synthetic API responses and port3107;
no browser-to-real-database end-to-end run was performed. Windows sandbox server teardown
hung after assertions; the final browser rerun outside that sandbox exited cleanly with code0.
After verification, both labelled disposable containers and their test volumes were removed.
Normal local Docker application services were not stopped or modified.

## What was exercised

Unit cases cover DTO rejection/normalization, unprivileged or pending callers, hash-before-
transaction orchestration, creator recheck, reserved identity denial, wrapped unique errors,
safe limiter/hash/persistence/audit failures and HTTP domain-error mapping. Existing auth
regressions now permit an eligible pending platform partner, not non-pending or inconsistent
principals.

Both preview and full HTTP apps exercise anonymous/tenant/pending denial, bad Origin,
overposting and weak password rejection, actual Argon2 password storage, server-derived
platform role, null tenant, no memberships and redacted audit metadata. Active/tenant/deleted
email collisions cannot promote or reclaim identities. Concurrent duplicate creation commits
once; injected audit failure rolls back the account; a revoked creator context fails live
recheck. Bootstrap remains first-only and the existing owner remains non-pending.

Partner login returns restricted identity/permissions. Wrong/reused passwords fail; valid
handover clears the flag, increments token version, audits once and revokes both sessions.
Old access, refresh and temporary password fail; new-password login works while tenant
Contacts remains forbidden. Existing tenant handover, creation rollback, authorization,
storage-free preview and encrypted onboarding regression subtests also pass.

Browser checks cover desktop1280/mobile390 creation, confirmation/cancellation, request
shape, success/password clearing, horizontal overflow, dirty navigation cancellation, safe
email conflict/retry state, clearing, duplicate-submit protection, role/permission navigation
denial and restricted partner handover to fresh sign-in.

## Defects found and repaired

Real PostgreSQL rejected Drizzle's schema-qualified `FOR UPDATE OF` target, causing503.
The repository now locks the creator user row with a standalone single-table `FOR UPDATE`
before eligibility joins, within the same service-owned transaction and authentication-lock
order. No schema, permission or product behavior changed. Full/preview creation and concurrency/
rollback assertions passed after repair.

Browser harness fixes wait for authenticated shell hydration before opening mobile navigation
and scope the error assertion to the feature region, excluding Next.js's route-announcer alert.

## Remaining coverage boundaries

T091 is not blanket production acceptance. Still not executed: real browser-to-database UAT,
all creator role/status/membership mutation races, expired/deleted creator combinations,
disabled-email-specific SQL case, real Redis/DB transport interruption during creation,
captured-log redaction assertions, lost-response recovery, exhaustive sign-out/unload dirty
guards, keyboard/screen-reader audit and additional browsers/tablet widths. Unit failure
injection is not a real infrastructure outage test. Separate profile/password-eye and older
deferred suites are not implicitly verified by this checkpoint. No load, hosted or live Meta
validation is claimed.
