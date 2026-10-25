# My Profile

TASK-086.8 / CLAR-072, approved 2026-10-22.

## Scope and navigation

All signed-in roles have **My profile** in the sidebar in full and preview modes.
Mandatory first-login password handover still takes precedence: pending users cannot
open Profile or call its mutation endpoints. The shared screen displays own email,
role and business (Platform account for Super Admin); only display name is editable.
No avatar, upload, email change, role change, business switching or administrative
password reset is introduced. Super Admin cannot access tenant content through Profile.

## Contracts and layers

Routes below are relative to `/api/v1`, require bearer authentication and use existing
success/error envelopes and approved-origin checks.

- `GET /me`: existing safe identity projection; reused without a new read endpoint.
- `PATCH /me`: body `{ "display_name": "Your name" }`; no target ID. Strict field
  allowlist, trimmed 1–255 characters, no control characters. Returns `{ "display_name": "Your name" }`.
  MeController parses transport, MeService orchestrates an atomic update/audit, and
  MeRepository alone queries active, non-deleted actor rows in the authenticated tenant
  (or platform/null tenant). Audit `PROFILE_UPDATED` contains field names, not old/new PII.
  SQL failures become safe domain errors without driver causes. No other identity field changes.
- `POST /auth/change-password`: body `{ "current_password": "...", "new_password": "..." }`.
  Existing password DTO requires 12–128 characters with uppercase/lowercase/number/symbol;
  passwords are never trimmed. Confirmation is UI-only. Wrong current password and reuse
  fail without writes. Existing first-login endpoint is retained separately.

PasswordChangeController delegates to PasswordChangeService; both initial and ordinary
changes share verification, actor rate limiter (fail closed), Argon2id hashing outside the
transaction, then user authentication advisory lock before credential/session row locks.
The READ COMMITTED transaction rechecks unchanged hash, expected handover flag, eligible
principal/role/tenant and active caller session. Password/hash, handover flag, incremented
token version, revoke-all and redacted audit commit together. Ordinary changes audit
`PASSWORD_CHANGED`; initial handover retains `INITIAL_PASSWORD_CHANGED`.

On success the refresh cookie expires, the browser drops its in-memory token/increments
session generation, protected UI unmounts and sign-in displays confirmation. No automatic
replacement session is issued. All old sessions must sign in again. Password inputs are
not persisted in browser storage or included in audit/error causes. Lost success responses
may require signing in with the new password; the error guidance explains this possibility.

## UI and verification

One feature under `apps/web/features/profile` serves tenant and platform shells, with
shared API adapter, readable labels, responsive identity details, disabled saving state,
error/success feedback, password confirmation, cancel/clear controls and dirty navigation/
sign-out/unload protection. Name updates refresh the shell identity immediately. Save/cancel
a pending name change before changing password to avoid losing it during forced sign-out.

No migration, new package, S3, SMTP, provider call or Railway change is required.
Automated Profile coverage awaits owner checkpoint authorization; see TEST_PLAN.md.
