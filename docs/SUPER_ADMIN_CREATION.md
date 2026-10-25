# Partner Super Admin creation

TASK-091 / CLAR-081 / ADR-034, approved2026-10-25. Local source implementation only;
not deployment or authorization for the agent to create an actual partner account.

## Owner workflow

Sign in as an existing Super Admin -> **Add Super Admin** -> enter name, email and strong
temporary password -> confirm same platform privileges. Success clears the form. Share login
URL/email/password securely outside the app; no invitation email or password response.
Partner must replace the temporary password before using the platform and sign in again.
The existing handover revokes all sessions/increments token version and expires the cookie.
Existing owners/bootstrap accounts are unchanged. Tenant contacts/message content stay private.
Creation only: no list/edit/delete/suspend/restore/reset or business membership controls.

## Contract and layers

POST /api/v1/platform/super-admins requires existing user.invite, approved Origin and a
non-pending system Super Admin with null tenant. Accept only display_name, email,
initial_password; shared account validation trims name/lowercases email and requires12–128
password characters with upper/lowercase, number and symbol. Unknown role/tenant fields fail.
Success201 uses the data envelope with user{id,display_name,email,role:SUPER_ADMIN,
status:ACTIVE,password_change_required:true}. Never returns password/hash/token/session.

SuperAdminController handles HTTP -> SuperAdminService orchestrates policy/rate/hash/
transaction -> SuperAdminRepository alone uses SQL. Existing actor-keyed Redis limiter fails
closed; Argon2id hash outside transaction. READ COMMITTED transaction takes the existing
user-authentication lock, then locks/rechecks live creator status, system role/null tenant,
no active membership, pending flag false and owned unexpired/unrevoked session. Reuse that
platform role and catalog, not a caller-selected role. No membership is created.

Named boolean-only isEmailReservedIncludingDeleted prevents promotion/reclaim of existing
identities, including deleted users. Email-key lock plus existing active-email uniqueness
handles duplicate attempts. Creation and redacted SUPER_ADMIN_CREATED audit commit together;
audit failure rolls back creation. No password/email/name in audit metadata or raw driver causes.
Errors:403 SUPER_ADMIN_FORBIDDEN,409 SUPER_ADMIN_EMAIL_UNAVAILABLE,429 SUPER_ADMIN_RATE_LIMITED,
503 SUPER_ADMIN_CREATE_UNAVAILABLE. Lost responses may mean success: retry never resets an
existing account; resolve uncertainty through separately authorized operator verification.

Full/preview register identical layers. Existing pending-password gate/screen now supports
new partner Super Admins; all other protected routes remain denied until handover. Bootstrap
remains first-only. UI provides labels, privilege/privacy warning, confirmation, disabled
saving, feedback, password clear on success and dirty navigation/sign-out/unload protection.

No migration, dependency, provider or Railway changes needed. CLAR-082 authorized the local
checkpoint: unit/auth, disposable PostgreSQL/Redis HTTP and mocked browser suites passed.
See SUPER_ADMIN_TEST_REPORT.md for results, the repaired row-lock SQL defect and remaining
T091 coverage boundaries; hosted/UAT acceptance is not claimed.
