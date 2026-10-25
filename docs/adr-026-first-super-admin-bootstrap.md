# ADR-026 — Protected one-time first-Super-Admin API

Approved2026-10-19, CLAR-067, TASK-082.4.3.

Add POST /api/v1/bootstrap/super-admin for explicit operator initialization after migrations,
disabled by default through optional API BOOTSTRAP_SECRET. Email/password only; create one
platform Super Admin and required catalog permissions, no tenant/demo accounts or sessions.
Use existing Argon2id, schema and permission catalog. Keep strict Controller -> Service ->
Repository; domain errors map to HTTP at controller. Existing full seed CLI remains separate.

Prefer fixed-secret operator control over unauthenticated first-caller takeover, automatic
startup seeds or credentials in Git. READ COMMITTED transaction, existing seed advisory lock,
users table write barrier, all-user existence check including soft-deleted rows and immutable
audit completion marker close concurrency and API-deletion reopening paths without a new
table. This is a narrowly named exception to ordinary soft-delete queries, not a recovery API.
Retain existing Origin checks and secure login cookies; bootstrap never logs in a caller.

Operator removes secret after success. Strict password checks, timing-safe secret comparison,
existing rate limiter for secret holders, redacted audit and normalized persistence errors
limit abuse/leakage. No new deployment service/dependency. Global write lock trades short
initialization blocking for correctness against all user insert paths. Deferred runtime tests
must validate this; no production readiness or hosted account creation claimed.

Account management and preview expansion remain separately owner-deferred. Removing the route
or secret disables future calls; rollback never deletes the initialized account/audit. See
FIRST_SUPER_ADMIN_BOOTSTRAP.md for operational contract, error behavior and pending coverage.
