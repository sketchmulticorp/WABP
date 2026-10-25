# Mandatory initial password change — TASK-082.4.5 / CLAR-069

CLAR-081 / ADR-034 extends the same handover to new partner Super Admins through POST
platform/super-admins. Bootstrap/existing owners and historical test evidence below remain
unchanged. Partner platform handover acceptance is pending, not covered by older tenant tests.
See SUPER_ADMIN_CREATION.md; the restricted password screen applies to all three roles.

Testing checkpoint2026-10-19: TASK-082.4.5.3 repaired tenant-role provisioning.
New business creation transaction includes tenant-owned Admin/User roles and existing
catalog grants, first Admin/membership and audit. Team resolves only its tenant's
active system User role. Authorization remains unchanged. Actual Admin/User creation,
handover, restore and foreign-role denial pass in the disposable regression suite.
30 unit,11 integration (including parent) and3 mocked browser tests pass. Broader
coverage remains open; see INITIAL_PASSWORD_TEST_REPORT.md. No hosted migration/deploy.

## Approved behavior

New Tenant Admin and Tenant User accounts must replace their temporary application password
before accessing any workspace. This applies to INSERTs through platform business/Admin
creation, Team creation and the explicit seed CLI. Super Admin bootstrap is unchanged.
Migration default false preserves all existing accounts, including their sessions. Restore
of an existing soft-deleted account retains its previous flag; no retroactive reset mandate.
This does not change Meta credentials or add invitation/email/forgot-password recovery.

1. Sign in with temporary credentials using existing login.
2. Server reads users.must_change_password on each protected authorization, not from JWT/UI.
3. When true, only GET /me (restricted own identity) and the password-change route may use
   that access token. Existing refresh and logout remain available. All other authenticated
   workspace/platform/session-list routes return403 PASSWORD_CHANGE_REQUIRED.
4. /me reports password_change_required=true, empty permissions, null tenant/subscription.
   Web mounts only the dedicated change form, not workspace components or feature requests.
5. Enter temporary password, a different strong new password and matching confirmation.
6. Transaction updates the Argon2id hash, clears the flag, increments token_version, revokes
   ALL refresh/access sessions and appends redacted INITIAL_PASSWORD_CHANGED audit.
7. Response expires the existing Secure/HttpOnly/SameSite=Strict auth cookie. Browser discards
   its in-memory token and shows completion, then sign-in. No replacement session is issued.
8. Sign in normally with the new password. Temporary password and prior sessions no longer work.

## Endpoint and implementation boundaries

POST /api/v1/auth/change-initial-password (normal200 data envelope):

```json
{"current_password":"<temporary-password>","new_password":"<new-private-password>"}
```

Requires a current authenticated pending session (tenant or partner platform) and existing approved Origin. New
password must be12–128 characters with uppercase, lowercase, digit and symbol. Current
password is required, never trimmed, and verified server-side. New password may not verify
against the old hash. Only those two JSON fields are accepted. Confirmation is a UI check.
Success data is {password_changed:true, login_required:true}; no password, hash or new tokens.
Do not copy real passwords into docs/logs/URLs/terminal history or chat.

Controller owns parsing/status/cookie expiration; service owns policy/hashing/transactions;
repository alone locks/queries/writes. Dedicated domain errors are mapped at transport:
NOT_REQUIRED409, CURRENT_PASSWORD_INVALID403, NEW_PASSWORD_REUSED400,
PASSWORD_CHANGE_SESSION_INVALID401, RATE_LIMITED429, UNAVAILABLE503 (full codes use
PASSWORD_CHANGE_ prefix except CURRENT_PASSWORD_INVALID/NEW_PASSWORD_REUSED).
Existing Redis limiter uses isolated user-keyed password-change budgets; failure is closed.
Database failures normalize without logging SQL/hash parameters. Existing body/header
omission remains; explicit old/new password log-redaction keys are also included.

## Concurrency and authorization

Login, refresh and credential change acquire the same user-scoped PostgreSQL advisory
transaction lock before session writes. Refresh first looks up the immutable session owner,
then acquires that lock before locking/revalidating the refresh row. Login rechecks the live
principal/password/version inside its lock. All three explicitly use READ COMMITTED so lock
waits do not retain a stale pre-change credential snapshot. Password hashing stays outside
the transaction. This lock order avoids credential-change/session-rotation lock inversion.

Password change locks active non-deleted credentials, rechecks original hash/required flag,
live tenant membership/role/eligibility and owned active session, then updates credentials,
revokes sessions and audits atomically. Concurrent login/refresh completes before revocation
or observes new credentials/revoked sessions after it; no old-password session is reissued.
The focused real contention scenarios passed; wider scheduling/status/rollback variants
remain unverified. This task does not claim to fix unrelated pre-existing races.

Restricted metadata is allowed only on explicit server handler metadata, not URL strings,
client flags or provided roles. Other guards retain normal default-deny policy. Refresh
cannot clear the mandatory-change state. Full and preview share the same implementation.

## Migration and rollout

Canonical070_users.sql and Drizzle users mapping add must_change_password boolean NOT NULL
DEFAULT false. Generated0009_initial_password_change.sql and snapshot/journal add the column;
table count35 and all relationships/deletion policies remain unchanged. No plaintext storage.

Apply this migration BEFORE the new API serves traffic, using an explicitly approved API
pre-deploy node dist/database/migrate.js workflow. The deployed migration count becomes10.
No hosted migration is authorized/executed by source implementation. Do not blindly push an
auto-deploy release without arranging migration first; live authorization reads the new column.
Existing rows remain false; only creation paths explicitly set true. Seed reruns do not
force old accounts or replace their passwords. New seeded tenant identities now use this flow.

Rollback must preserve the restriction for pending accounts: do not deploy an older API
that ignores this flag while such accounts remain active. Prefer forward repair, or separately
approved suspension of affected accounts before rollback. Never reset/drop/reseed users.

## Pending verification

Owner deferred tests. T082-PC01–07 in TEST_PLAN include invalid requests, first login/restore,
old/new session behavior, disabled/deleted/foreign principals, real login/refresh/change races,
rollback/duplicate requests, UI keyboard/error/reload and migration/default/full/preview cases.
Existing auth mocks and account-provisioning E2E fixtures need updating at that checkpoint;
static checks are not substitute evidence. No live account mutation, migration or tests here.

2026-10-19 static checkpoint: API/Web lint/typecheck/production builds, contracts lint/build,
observability lint/typecheck/build, Worker typecheck, source/metadata format/diff,35-table
verifier and drizzle-kit check passed. No automated/runtime security acceptance performed.
