# ADR-028 — Restricted first-login sessions and mandatory password handover

Approved2026-10-19, CLAR-069; TASK-082.4.5 and required concurrency subtask082.4.5.1.

Persist must_change_password on users, false by default for existing identities. New tenant
account INSERTs set true. Super Admin and restoration of existing identities are not newly
forced. Use existing signed access/opaque refresh sessions, but enforce the flag from live
PostgreSQL authorization before granting workspace access. /me exposes only own restricted
identity plus flag; dedicated handler metadata permits only that endpoint and password change.
No weak front-end-only check, reset token in localStorage or full permissions while pending.

Existing password hashing remains Argon2id. Require temporary password and different strong
replacement. Successful transaction clears flag, updates hash/version, revokes all sessions
and records redacted audit; expire refresh cookie and require fresh login. Owner explicitly
rejected automatic replacement-session handover in favor of fresh sign-in.

Serialize login, refresh and credential update by user with the same transaction advisory
lock/READ COMMITTED; refresh resolves owner before session locking. This closes the in-flight
old-password session-creation/rotation window without adding session/version columns or
another token model. Global user-table locks are unnecessary for routine credential changes.
No Meta onboarding, provider secret, new dependency or agency impersonation feature.

See INITIAL_PASSWORD_CHANGE.md for contract/migration ordering/rollback limitations. Tests
are owner-deferred and concurrency guarantees are not yet runtime-verified. Existing accounts
are never blanket-reset. Hosted migration and deployment require separate authorization.
