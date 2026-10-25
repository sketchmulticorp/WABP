# Configurable WhatsApp onboarding

CLAR-071 / TASK-032.1/032.2, 2026-10-21. Direct Tech Provider connection workflow;
live Meta acceptance and messaging activation are separate.

## Current behavior

Set server-only WHATSAPP_ONBOARDING_MODE=development (default) or embedded_signup.
Set META_EMBEDDED_SIGNUP_CONFIG_ID to the numeric Facebook Login for Business configuration
ID when available; retain existing META_APP_ID, META_APP_SECRET and META_GRAPH_API_VERSION.
Do not paste a signup URL, token or app secret into the configuration-ID field.
No real values belong in Git. Apply settings to the API; no browser build-time secret needed.

GET /api/v1/whatsapp/onboarding requires existing tenant whatsapp.read authorization and
returns only mode, connection_available and status. No app secret/token is returned.
Development mode retains the existing manual mapping UI. Embedded mode hides that form and
server-side POST /whatsapp/connect rejects manual mapping before database writes.
Existing account listing/sync/local disconnect and account IDs are unchanged.
Changing modes does not migrate, reassign or replace existing credentials/accounts.

Embedded mode returns NOT_CONFIGURED unless Meta settings and credential keyring are present;
otherwise READY_TO_CONNECT means configured, not Meta-approved. Prepare explicitly loads
the official SDK and creates a session/tenant/config-bound attempt; Continue opens Meta via
a direct click. Browser sends code and selected asset hints, never a permanent access token.
POST /whatsapp/onboarding/start returns public SDK configuration and a one-use attempt/nonce.
POST /whatsapp/onboarding/complete strictly accepts those values plus code/WABA/phone IDs.
No startup/page-load Graph call, webhook subscription, sending or credit-line sharing occurs.
APP_MODE=preview restrictions for sending/background jobs remain independent.

## Secure connection lifecycle

Only a live authorized Tenant Admin with whatsapp.connect can start/complete. Attempts live
10 minutes in Redis and store only a hash bound to actor/session/tenant/nonce/configuration.
Atomic compare/delete permits one completion; incorrect foreign/session binding does not
consume the rightful attempt. Existing auth limiter is reused with separate actor-based signup
keys (current configured auth limits apply to both start and completion). Redis failure closes
signup. Expired/replayed completion requires refreshing accounts and restarting if needed.

Outside any DB transaction, the fixed-host adapter exchanges the code, inspects token validity,
expected app/permissions/expiry and WABA-targeted scope, then verifies WABA/phone access.
No browser business_id/display/status/token is trusted. Current phone membership verification
checks a bounded100-number page and fails closed if selection is absent; large-WABA paging
needs a follow-up, not arbitrary provider next-URL fetching. Provider failures are sanitized;
no OAuth URL/code/token/raw error escapes. No automatic exchange retry on an ambiguous failure.

After verification, one transaction locks tenant, upserts only its own matching WABA/phone,
preserves account ID on reconnect, stores encrypted credential and appends redacted audit.
Foreign phone reassignment is rejected. Credential/audit failure rolls back account changes.
No plaintext tokens are persisted in Redis/PG or returned. Verified access is CONNECTED but
does not prove messaging activation: registration, payment method and webhook subscription
are not performed. Existing local disconnect revokes local credential access and retains history.

If a completion response is lost, Refresh accounts before retrying. A used code/attempt cannot
be replayed; a fresh authorized flow reconnects the same same-tenant account safely. Cancellation
cleans browser listeners and leaves no DB writes; its unused Redis attempt expires naturally.

## Agency and client access

Client-owned and agency-managed businesses use the same tenant account records and downstream
workflows. Agency staff use a Tenant Admin identity inside the particular client's business;
Super Admin does not impersonate tenants or gain contact/message access. No Meta-password input.

## Approved credential persistence foundation

Owner approved encrypted PostgreSQL credentials with separate server keys (ADR-031).
Migration0010 adds encrypted_token while preserving existing reference-only records. Shared
API/Worker resolution supports opaque encrypted references and the existing development
reference. Internal persistence writes ciphertext/audit in one transaction; no public token
entry form/endpoint exists. Secure signup verifies Meta assets before calling persistence.

WHATSAPP_CREDENTIAL_KEYRING is a server-only JSON map, e.g. {"v1":"<32-random-bytes-base64>"};
WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID identifies a present key such as v1. Place real values only
in local .env or server variables. Keep identical keyring on API and Worker; no fallback key.
Retain older keys for older ciphertext/backups; changing active ID affects new encryption
only. No re-encryption command or hosted migration has run. Missing key fails safely.

Owner selected direct Tech Provider onboarding, without agency credit sharing or BSP services.
Phone registration, payment activation and webhook subscription remain explicitly separate.

## Activation and verification

Owner configures Meta app,
business verification, required access/reviews, HTTPS domains and login configuration. Then
select embedded_signup and explicitly authorize/verify a permitted real onboarding. Mode changes
cannot grant provider access or approvals. Hosted release, live tests, schema
migrations and any additional services/spend remain separately controlled.

Meta implementation pages returned HTTP429 during review. Meta's official Postman collection
was accessible, but includes partner-specific credit-sharing examples; it must not be treated
as an approved billing model or substituted for current flow-specific implementation details:
https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup

Meta's official Tech Provider sample became accessible during storage work:
https://github.com/fbsamples/business-messaging-sample-tech-provider-app
It demonstrates code exchange and optional registration/webhook steps. Owner selected direct
Tech Provider onboarding without credit sharing. Do not copy its plaintext
sample storage or provider error logging; our layering/tenant/encryption rules remain binding.

Owner chose combined foundation+secure signup tests. See WHATSAPP_ONBOARDING_TEST_REPORT.md
for local evidence and explicit remaining coverage. No live Meta/hosted acceptance is implied.
