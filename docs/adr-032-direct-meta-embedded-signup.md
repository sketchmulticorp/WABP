# ADR-032 — Direct Tech Provider connection

Approved2026-10-21, CLAR-071 / TASK-032.2. Extends ADR-030/031. Owner selected direct
Meta Tech Provider onboarding, not a BSP or agency credit-sharing arrangement.

Use official Facebook Login for Business code flow (SDK v4 configuration), public IDs from
the authorized API and server-only code exchange. Reuse existing auth/tenant scope, PostgreSQL,
Redis, provider adapter boundary and encrypted persistence; no new infrastructure/dependency.

Two explicit UI actions avoid popup blocking after asynchronous preparation. Third-party SDK
loads only after intent. Browser accepts approved exact Facebook event origins; all returned
asset IDs are merely hints. Server verifies token validity, app identity, required WhatsApp
scopes, expiry, WABA-targeted authorization and phone membership through fixed-host Graph calls.
Never follow arbitrary Graph next URLs or expose provider URLs/errors containing secrets.

Redis stores only a hash-bound attempt (actor/session/tenant/nonce/config),600-second TTL.
Atomic compare/delete prevents concurrent/replayed completion without a new durable table.
Reuse existing auth limiter with distinct signup actor keys. Consume before code exchange;
on ambiguous provider/network failure require new signup, never blindly retry the same code.
If DB committed but response was lost, refresh accounts first; a fresh flow reconnects the
same own account. Cross-tenant phone ownership cannot be reassigned by this path.

After external verification, one service-owned transaction locks tenant, upserts the account,
stores credential with authenticated encryption and appends audit. Account/token/audit roll
back together. Controllers own transport only; Redis and SQL live only in repositories.
No permanent token is accepted from a client or stored in Redis/browser. Tenant Admin remains
the operator for agency/client cases; Super Admin has no tenant-content access.

Connection is not messaging activation. No automatic phone registration, payment method,
WABA subscription, credit line, message send or preview worker/webhook enablement. These
require separate owner-directed work/activation. Existing development path remains default.

Combined local checks passed (see WHATSAPP_ONBOARDING_TEST_REPORT.md); live provider/hosted
acceptance, extended fault/rotation and large-WABA paging remain separate. No launch claim.
Reference: Meta's official fbsamples/business-messaging-sample-tech-provider-app; sample
framework/auth/plaintext storage/logging were not adopted. Direct docs returned429 during review.
