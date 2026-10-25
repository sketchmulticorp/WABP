# First Super Admin bootstrap — TASK-082.4.3 / CLAR-067

CLAR-081 adds separate authenticated partner creation via POST platform/super-admins and
the Add Super Admin screen; see SUPER_ADMIN_CREATION.md. Bootstrap remains first-only.
Earlier no-additional-Super-Admin statements describe the bootstrap-only checkpoint, not
the new partner flow. Deployment and runtime verification remain separate.

CLAR-068 / ADR-027 subsequently enables existing DB-only administration in preview. After
deploying that change, Super Admin uses PlatformWorkspace instead of the limited notice;
tenant privacy and all bootstrap guarantees below remain unchanged. No new Super Admin
creation/deletion operation is added. Earlier management-deferred wording below is historical.

This owner-controlled initialization is available in full and limited-preview API modes.
It creates one ACTIVE platform Super Admin, with no home tenant or tenant membership.
No tenant, plan, subscription, example Contact or additional user is created. Account
management stays separate and remains excluded from limited preview.

## Prerequisites and request

1. Apply the existing committed database migrations through the controlled workflow first.
   Deploying code does not create tables. This endpoint does not run migrations.
2. Deploy this implementation. Set API-only BOOTSTRAP_SECRET to a fresh, independent random
   secret of at least32 characters. Do not reuse JWT_ACCESS_SECRET/REFRESH_TOKEN_PEPPER.
   Missing/empty value disables bootstrap; a supplied short value fails startup validation.
   Never commit/share the value or put it in Web NEXT_PUBLIC_ variables.
3. From a trusted API client, send HTTPS POST to the Web same-origin endpoint:

```http
POST /api/v1/bootstrap/super-admin
Content-Type: application/json
X-Bootstrap-Secret: <your-private-bootstrap-secret>

{"email":"owner@example.test","password":"<your-private-strong-password>"}
```

Use the actual deployed HTTPS Web origin. Email is normalized like login; only email and
password fields are accepted. Password must have12–128 characters, uppercase, lowercase,
number and symbol, matching existing account-provisioning strength. Initial display name
is “Super Admin”. Caller cannot choose role, tenant, permissions or status. Do not paste
real payloads into chat, terminal command history, screenshots, tracked HTTP files or logs.

Success:201 with the normal data envelope containing user_id and role=SUPER_ADMIN. It
never returns a password/hash, bootstrap secret, access token or refresh cookie. Sign in
through existing login separately. In limited preview Super Admin sees the existing limited
notice; this does not enable platform management or tenant-content access.

4. Remove BOOTSTRAP_SECRET from API variables and redeploy after success. Store the account
   password securely. Repeated initialization never resets/replaces users or changes roles.

## One-time and concurrency guarantees

Secret verification precedes database/hash work using fixed-size SHA-256 digests and
timingSafeEqual. Only holders reach existing Redis authentication limits with isolated global
bootstrap keys; limits reuse configured login window/IP/email budgets. Wrong-secret requests
never hash passwords or query users. Existing Origin guard is retained; non-browser clients
without Origin still require the secret. Never put the secret in URL/query/cookies.

Hashing uses existing Argon2id outside the transaction. Service then starts a READ COMMITTED
transaction, acquires the CLI seed advisory lock, and locks users SHARE ROW EXCLUSIVE.
Transaction-local lock_timeout is5 seconds per lock wait; contention fails safely as
BOOTSTRAP_UNAVAILABLE rather than occupying a connection indefinitely.
That serializes bootstrap and seed, and prevents another ordinary INSERT from slipping
between the empty check and insertion. The global lock is intentionally limited to rare
initialization and is not part of routine user administration.

Repository explicitly checks ALL user rows, including inactive and soft-deleted users. This
named bootstrap safety query is the approved exception to ordinary is_deleted=false reads.
Any user closes bootstrap. A durable FIRST_SUPER_ADMIN_BOOTSTRAPPED audit marker also
closes it even if users later undergo authorized physical retention purging. Direct database
owners who erase both users and audit history are outside application guarantees.

Within that transaction the service reuses SeedRepository and existing SYSTEM_PERMISSIONS /
SUPER_ADMIN_PERMISSION_KEYS catalog to initialize the platform role and its exact approved
permissions. Existing compatible role is reused; an incompatible non-system role conflicts.
No tenant-content permissions are invented. User and redacted completion audit commit
together; failure rolls all changes back. No new schema or CLI seed behavior change.

## Failure contract and privacy

| Code | HTTP | Meaning |
| --- | --- | --- |
| VALIDATION_FAILED |400| Invalid payload/password; no submitted values echoed |
| BOOTSTRAP_DISABLED |403| No server secret configured |
| BOOTSTRAP_DENIED |403| Missing/incorrect bootstrap header |
| BOOTSTRAP_CLOSED |409| At least one user or completion marker exists |
| BOOTSTRAP_CATALOG_CONFLICT |409| Existing role/catalog incompatible |
| BOOTSTRAP_RATE_LIMITED |429| Existing bootstrap-global rate budget exhausted |
| BOOTSTRAP_UNAVAILABLE |503| Infrastructure/migration dependency unavailable; investigate safely |

Responses contain a generic safe message and request ID. Database exceptions are normalized
without their SQL/parameters/cause, avoiding credential-hash leakage. Existing serializers
omit request headers/bodies; explicit bootstrap header/config redaction is also added.
No GET count/status endpoint, public signup UI or automatic startup provisioning is added.

## Verification boundary

Tests remain owner-deferred. Pending T082-BS01–06 in TEST_PLAN cover disabled/bad input,
secret/Origin handling, first creation/login, deleted/existing/marker closure, simultaneous
HTTP/CLI/ordinary user insertion, catalog/transaction failure, redaction and full/preview
registration. Static checks do not prove these runtime invariants. No hosted POST, cloud
secret entry, migration, seed or account mutation is performed by this implementation.

2026-10-19 static checkpoint: API lint/typecheck/build, shared config/observability
lint/typecheck/build, source formatting/diff and unchanged35-table schema contract passed.
These are compile/static results, not evidence of successful bootstrap/locking/login.
