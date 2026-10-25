# Security Requirements

CLAR-081 / ADR-034: partner creation requires existing non-pending system Super Admin,
user.invite and approved Origin; live actor/session rechecked transactionally. Server owns
platform role/null tenant, no memberships; existing/deleted emails cannot be promoted.
Creation/audit atomic, temporary password never returned; pending platform accounts use
existing handover/revoke-all/fresh-login safeguards. No bootstrap/tenant-content change.
Contract/verification boundary: SUPER_ADMIN_CREATION.md.

CLAR-072: own-profile PATCH has strict name-only input and derives target/tenant from live
authorization. Ordinary password changes reuse the initial-password verification, rate limit,
user authentication barrier and atomic revoke-all/token-version/audit transaction for all roles.
Pending first-login users cannot bypass handover. No email/role/tenant changes or reset endpoint.
Cookie expires and fresh sign-in is mandatory. Details: PROFILE.md; runtime coverage pending.

TASK-032.2 now wires provider verification before encrypted persistence. Tenant Admin-only,
one-use10-minute actor/session/tenant/nonce/config state, existing limiter and fail-closed Redis;
strict DTO; token app/scopes/expiry/WABA/phone checked server-side outside DB transactions.
Same-tenant reconnect retains IDs, foreign asset conflict is generic; audited transaction rolls
back on credential/audit failure. OAuth URLs/provider errors never propagate. Browser accepts
only exact approved Facebook event origins and backend re-verifies every ID. No startup/page
Graph calls; SDK loads only on explicit Prepare. Real Meta/extended fault acceptance pending.

ADR-031 / CLAR-071 supersedes reference-only storage: provider_credentials may contain an
authenticated encrypted_token envelope, never plaintext/key material. AAD binds tenant/account/
credential/key/version. API/Worker share account-scoped active credential resolution and
server-only keyring; unknown keys/tamper/foreign references fail closed. Internal persistence
requires Tenant Admin/whatsapp.connect, account lock and transactional audit. No token input
endpoint is exposed; actual signup verification/replay defense is now implemented in032.2.
Combined local evidence is in the onboarding report; real-provider acceptance remains pending.

CLAR-071: server onboarding selector rejects manual development mapping outside development
before repository writes. Safe GET projection requires tenant whatsapp.read; no secrets/IDs
returned by this mode/readiness endpoint. Embedded readiness is configuration-dependent;
TASK-032.2 implements the protected completion path, not live provider certification.
Agency uses tenant Admin identity, never Super Admin impersonation. ADR-031/032 approve and
implement encrypted per-business storage; secret_ref remains an opaque reference, not plaintext token storage.

CLAR-070 / ADR-029 enables existing preview reporting/setup/authoring under unchanged
authorization. Campaign services reject preflight/delivery state commands before transactions/
outbox writes. No messaging/import/Inbox/automation/webhook entry point is registered. Explicit
sync uses server Meta settings; UI visibility is not the authorization/enforcement boundary.

CLAR-069 / ADR-028: new tenant account INSERTs require password change, read live from DB
on each protected request. Before change, only restricted own /me and change handler accept
access tokens; refresh/logout remain available, no workspace/subscription/tenant projections.
Current temporary password plus different strong replacement required. User-scoped lock
serializes login/refresh/change before session writes; atomic hash/flag/version/revoke-all/audit,
cookie expiration and fresh login. Existing accounts/restores not retroactively forced.
Apply0009 before new API traffic; no rollout rollback to flag-ignoring API while pending
accounts remain active. Runtime/concurrency tests deferred; see INITIAL_PASSWORD_CHANGE.md.

CLAR-068 / ADR-027: preview now registers existing DB-only platform administration/insights/
bounded CSV and Tenant Admin Team controllers. Current live role/permission/tenant guards,
same-tenant user limits, temporary-password handling, audit and soft deletion remain intact.
Super Admin gets aggregate/metadata projections only, never tenant Contacts/messages or
recipient exports. Files/provider/worker features and tenant reporting stay unregistered.
No new management operations/role grants. Runtime security/module tests remain deferred.

CLAR-067 / ADR-026 adds disabled-by-default first-Super-Admin POST with API BOOTSTRAP_SECRET,
strict email/password payload, timing-safe secret check, existing Argon2id/permission catalog,
and existing Origin policy. Users write barrier plus seed lock protects empty check/insertion;
all user rows including deleted and a durable completion audit close initialization. Named
bootstrap all-user safety query is an explicit soft-delete predicate exception. No anonymous
signup, auto-login, tenant bootstrap or preview management expansion. Remove secret after
success. See FIRST_SUPER_ADMIN_BOOTSTRAP.md; runtime security/concurrency tests deferred.

CLAR-066 / ADR-025: preview browser requests use Web HTTPS /api/v1 and a fixed Next.js
rewrite to private NestJS. Original Origin, bearer/session and tenant checks stay server-side;
refresh cookies remain host-only Secure/HttpOnly/SameSite=Strict with /api/v1/auth path.
No request-controlled target, cookie weakening, credential-bearing URL or arbitrary relay.
Proxy URL is non-secret configuration and may appear in build metadata. Trust-proxy 0 is
retained pending ingress verification; real HTTPS cookie/Origin/transport checks are pending.

CLAR-065 preview profile is a server-side module allowlist (auth/session/tenant Contacts/Groups/
health), not UI-only restriction. It does not instantiate upload/provider services or accept
webhooks/worker-dependent operations. Worker/Scheduler full loaders reject preview. Only safe
deployment_mode is added to /me; no secrets exposed. Full configuration remains strict. Preview
keeps tenancy, permissions, soft deletion, strong auth secrets, Redis login limits and production
Secure/Strict cookie/origin behavior. Tests/domain routing remain unverified until checkpoint;
this reduced profile is not a launch-safety waiver. See RAILWAY_LIMITED_PREVIEW.md.

Phase 8 local CLAR-043–045 checkpoint: full registered checks and 33 mocked-provider browser
tests passed; reporting SQL/authenticated HTTP passed 7/7 against disposable fixtures.
Production-only images preserve non-root execution and no secret build inputs. API/worker
Trivy rescans still have high/critical findings, including base OS and bundled npm; do not
call these approved for production. See PHASE_8_LOCAL_REPORT.md for evidence/remaining gates.
Duplicate manual-payment conflicts inspect a bounded Drizzle cause chain to recognize PG
23505 without exposing SQL, parameters or internal error messages. Concurrent-payment and
audit-rollback SQL coverage now confirms one payment/audit for a same-reference race and full
payment rollback when audit persistence fails; existing authorization/transaction rules are unchanged.

TASK-082 / CLAR-042 is local repository preparation, not remote deployment authorization.
Docker context excludes local environment files/Git/uploads and images accept no private
build ARGs. Only the public API URL enters the Next browser build/cache key. Staging retains
production-mode Secure/Strict cookies, exact CORS and isolated infrastructure/keys; DNS and
proxy trust must be verified before login traffic. Worker/scheduler health is private and
status-only with PG/Redis probes; it exposes no queue/job/customer/credential data. Existing
upload scanning and tenant permissions remain unchanged. No live Meta/seed/migration action
is authorized by the prepared manifest. See RAILWAY_STAGING_GUIDE.md and deferred T082 cases.

TASK-081 / CLAR-041: every CSV download resolves live auth and operation permissions. Tenant
recipient exports require campaign.read/export plus contact.read/export; Super Admin has no
customer/campaign export path. Allowlisted fields omit messages/variables/raw provider data,
and all payment exports omit notes. Active Contact/campaign and tenant-scoped joins apply.
CSV cells neutralize spreadsheet formulas, complete files are bounded before sending, and
audit failure blocks delivery. No stored public links; no-store attachment responses. Shared
browser auth generation/cancellation protects obsolete downloads. Local downloaded copies
cannot be revoked by logout. See REPORT_EXPORTS.md; runtime/security tests remain deferred.

TASK-080 / CLAR-040: insights services enforce tenant scope or explicit platform role plus
operation permissions independently of UI visibility. Separate platform aggregate/metadata
queries never return customer rows. Tenant payment SELECT omits operational notes; audit
SELECT omits metadata/before/after/entity IDs/PII/content. Audit filters are bounded and
paginated. Business selection is not impersonation. Manual payment validates a non-deleted
business under a lock in its existing audited transaction and does not grant access/change
subscriptions. Runtime/security acceptance is deferred, not certified by static checks;
see ESSENTIAL_REPORTING.md and T080-01–10.

Phase 7 (CLAR-038/039): automation authoring uses tenant-content guards and existing read/write/
test/publish permissions; publication/reactivation/pause additionally require Tenant Admin.
Inbox takeover/allow requires conversation.read/reply. Publisher identity comes from the
server and is revalidated without depending on their login session. Runtime/dispatch enforce
automation_enabled and common messaging policy. No consent/phone/ownership mutation through
CONTACT_UPDATE. Published graphs are immutable; choice tokens and reply context bind to the
current run/node/outbound Message, not display labels. Trigger/continuation receipts prevent
replay side effects, including unmatched inbound messages. Audit/logs omit graph text, contact
values, message bodies and provider secrets. The automation-only 2 MB parser uses a named
wrapper so Nest still installs its ordinary/raw-body parser elsewhere. TASK-075 must verify
HTTP/HMAC and authorization/replay/handoff behavior; static checks are not security certification.

TASK-075.4 verified and corrected size-limit error mapping: only an actual Error with
Express's exact `entity.too.large` type and 413 status maps to the existing safe
PAYLOAD_TOO_LARGE response. Parser messages/body/limit metadata are never copied to the
response; arbitrary status fields do not override internal error handling. Both default
route and automation limits were exercised through the actual API. See PHASE_7_TEST_REPORT.md.

## Authentication

TASK-064 coalesces token refresh in the current browser runtime, rejects responses/token
updates from an older login/logout generation and clears a failed refresh token reference
from memory. Polling clears protected snapshots and stops on 401/403; every GET still uses
backend tenant guards. No token/cookie lifetime, storage or server rotation policy changed.
This is not cross-tab/device refresh coordination; related acceptance/security review remains
pending under TASK-065/084. See `INBOX_REFRESH.md` and ADR-021.

- Use a modern approved password hash such as Argon2id.
- Bootstrap passwords are accepted only by the controlled seed command, validated for
  minimum strength, converted to salted Argon2id PHC hashes before the transaction, and
  never logged or automatically overwritten on rerun.
- Use short-lived access tokens and rotating opaque refresh sessions.
- Store refresh-token hashes only.
- Revoke token families after refresh reuse or material security events.
- Rate-limit login and password-reset attempts.
- Require stronger controls for platform administrators; 2FA is recommended.
- Return a 15-minute HS256 access token in JSON with only issuer, audience, user,
  session, tenant, issued-at, and expiry claims. Keep the opaque refresh token only in an
  `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`; add `Secure` in production.
- Give each refresh family one absolute 30-day lifetime. Rotation replaces the session
  row without extending that deadline. Reuse revokes every active member of the family
  and appends a redacted security audit event.
- Protect login with Redis-backed fixed-window limits for both normalized email and
  client IP. Return one generic invalid-credentials response for unknown, inactive,
  ineligible, and incorrect-password accounts. If Redis is unavailable, fail login closed.
- Validate browser origins on login, refresh, and logout. Accounts already marked for 2FA
  receive `TWO_FACTOR_REQUIRED` until the separately approved 2FA flow is implemented.
- On every protected request, verify the access token and re-resolve its exact session,
  account status, role, single-business membership, tenant status, and permissions from
  PostgreSQL. Never trust role or permission claims supplied by the browser.
- Session listing returns only the authenticated user's active sessions. Remote deletion
  uses the actor ID in the repository predicate, revokes the selected token family, and
  appends redacted audit evidence. Unknown and other-user session IDs are indistinguishable.

## Authorization and tenancy

TASK-082.4.5.3: new business/Admin provisioning atomically creates tenant-owned Admin
and User roles with existing catalog grants. Team create/restore resolves only its
tenant's active, non-deleted system TENANT_USER role. No request-supplied role/tenant,
global-role fallback or automatic existing-grant expansion. Live principal eligibility
continues requiring role tenant, home tenant and active membership to match.

TASK-063 internal collaboration requires active tenant context and conversation.read;
assignment also requires conversation.assign and note creation conversation.reply. Assignees
must pass the reused active same-tenant member check. Client note IDs never confer access:
creation retries validate tenant/conversation/author/text, with generic conflict on incompatible
or hidden IDs. Notes remain tenant content, separate from provider Messages; audit metadata
contains only operational IDs, never note text. See `INBOX_COLLABORATION.md`; runtime coverage
remains pending under TASK-065.

TASK-061 inbox APIs require conversation.read and active tenant context in guards and service;
close/reopen additionally requires conversation.close. Repository joins hide deleted Contacts
and constrain tenant/account relationships. Shared read acknowledgements accept only a Message
ID belonging to that same tenant/conversation; cursors cannot alter authorization. Customer
history excludes credentials, raw webhook envelopes and internal policy decisions. State/audit
writes are transactional and audits omit customer message content. See `INBOX_API.md`;
runtime coverage remains deferred to TASK-065.

- Enforce permissions and tenant scope in API guards and service/repository access.
- Permission guards require every declared permission. Tenant-content guards additionally
  reject Super Admin and require a non-null active Tenant Admin/User context before a
  service may call a tenant-owned repository.
- Never authorize from a request-provided tenant ID alone.
- Include tenant predicates in every tenant-owned query.
- Tenant-scope storage keys, Redis keys, queue jobs, exports, and realtime subscriptions.
- Explicitly permission and audit cross-tenant platform access.
- Treat Super Admin as the only platform role. Bind each Tenant Admin and Tenant User to exactly one active tenant membership in the MVP; neither role may switch businesses.
- Account creation follows the same boundary. Super Admin may atomically create a tenant and its first Tenant Admin through the platform administration path. Only an authenticated Tenant Admin with `user.read` / `user.invite` may list or create regular Tenant Users, and the server always derives the tenant and system Tenant User role rather than accepting either from the request. Local development uses an admin-entered initial password; plaintext passwords and password hashes are never returned or written to audit metadata. No email invitation or forced-reset lifecycle is implied.
- Scoped create-or-restore never makes a deleted identity globally claimable. User email restore requires the deleted account's home tenant to equal the authenticated tenant, replaces the password hash, derives the system Tenant User role/membership, increments token version and revokes existing sessions. Contact restore preserves opt-out/suppression and all consent evidence. Contact and Group restoration never revives deleted memberships. Ambiguous deleted identities fail closed for explicit review.
- Tenant User status/delete commands derive tenant and target role server-side. Only Tenant Admin may target a regular user in the same tenant; self, Admin, platform and foreign identities are unavailable. Deactivate/reactivate increments token version and revokes sessions. Delete additionally soft-deletes the matching membership in the audited transaction; an already fully deleted target returns idempotent success without rewriting deletion or audit evidence.
- Deny Super Admin access to tenant contact records/PII, message and conversation content, customer media, raw provider payload content, content-revealing search, signed content downloads, recipient-level results, and detailed customer-data exports. Platform administration is limited to approved account metadata, billing, operational state, aggregates, and redacted audit metadata.
- Do not provide an MVP break-glass customer-content path. Super Admin status alone never authorizes a tenant-content endpoint.
- Enforce User campaign/template approval on the server against an exact content version. Reject self-approval, cross-tenant review, stale approval, and all API/worker attempts to submit/use/schedule/send an unapproved or changed version.

## Secrets and provider credentials

- Keep secrets in Railway variables or an approved secrets manager.
- Never return permanent Meta credentials to the browser.
- Never log authorization headers, tokens, encryption keys, or secret payloads.
- Separate development, staging, and production credentials.
- Support credential validation, rotation, revocation, and authorization-failure alerts.

## API and webhook security

TASK-060 revalidates the persisted tenant/account and each message change's provider phone
metadata inside the processing transaction. Status lookup/mutation requires that same
tenant/account and OUTBOUND direction. Duplicate inbound identities are checked before
Contact/unread/STOP effects. Deleted-only sender identities and invalid inbound timestamps
fail safely through existing FAILED/DEAD review tooling without opening a reply window or
restoring/recreating a Contact. No raw payload/deleted identity review is exposed through
Super Admin application routes. See `INBOX_INBOUND_RESOLUTION.md`; runtime cases remain
pending under TASK-065.

- HTTPS/TLS everywhere.
- Validate request bodies, parameters, query filters, and output serialization.
- Verify Meta webhook signatures over the exact raw body.
- Persist and deduplicate provider events before asynchronous processing.
- Apply request-size, rate, and concurrency limits.
- Protect against injection, SSRF, unsafe redirects, and production stack-trace disclosure.

## Files and media

- Allow only configured types and sizes.
- Validate extension, MIME signature, and content where appropriate.
- Malware-scan untrusted uploads.
- Use random tenant-scoped object keys and short-lived signed downloads.
- Never trust filenames as storage paths.
- Delete temporary processing files.

## Messaging and compliance

TASK-062's reply endpoint requires conversation.read/reply and server-resolves Contact/account.
The common composer locks and checks new-reply conversation/automation state within its
transaction; CLOSED/ARCHIVED requires reopen and ACTIVE requires explicit handoff/pause.
Actor-namespaced keys reuse common tenant idempotency and immutable policy evidence.
No client-supplied source/tenant/account or direct provider path is accepted. Existing consent,
window/template/plan/quota controls remain in force. See `INBOX_REPLIES.md`; runtime tests
remain pending under TASK-065.

TASK-055 approval commands require an active tenant User requester and a different Tenant Admin
reviewer. Commands bind the saved campaign/template version and revision; the worker rechecks
sender and reviewer membership/permission before composition and provider claims. Campaign
row locks serialize pause/cancel with message claims. Reports require tenant `campaign.read`
and deny Super Admin. Start keys/hashes are not serialized in responses. See
`CAMPAIGN_LIFECYCLE.md`; automated security coverage remains pending under the owner's cadence.

Campaign draft operations require campaign.read/write plus active tenant context;
Super Admin is denied. Client-supplied tenant/status/approval/schedule fields are rejected.
Account/template linkage and explicit audience references are tenant/soft-delete scoped.
Material version and revision comparisons happen under the campaign row lock, with
approval invalidation and redacted audit in the same transaction. Draft-options responses
contain no credential references. See CAMPAIGN_DRAFTS.md.

Campaign preflight requires tenant `campaign.write` to start and `campaign.read` to poll;
Super Admin remains denied. Queue envelopes contain only the durable run identifier. Worker SQL
re-derives tenant/campaign/account/template/Contact relationships, checks the exact material
version, and returns aggregate reasons rather than recipient PII. Preflight does not reserve quota
or authorize sending. See CAMPAIGN_PREFLIGHT.md.

- Record consent source, category, time, and proof/reference where applicable.
- Enforce opt-out and suppression before dispatch.
- Enforce approved templates and service-window rules.
- Provide human escalation for automated support.
- Implement abuse monitoring and tenant suspension.
- Do not bypass Meta quality, throttling, template, or anti-spam controls.
- All current outbound composition enters through the backend-only Messaging Service.
  It derives tenant scope from live authorization, maps the trusted source to a required
  permission, verifies tenant-matched Conversation/Contact/account/template records, and
  records only safe policy codes in audit metadata. Cross-tenant/not-found attempts do
  not create Messages; Super Admin cannot acquire the required tenant repository context.
- Free-form text requires an open customer-service window. Opted-out or suppressed
  Contacts cannot receive any outbound type, and business-initiated templates require
  opt-in plus exact internal/provider approval and variable validation.

## Audit and privacy

TASK-052's worker derives tenant/account/Contact relationships from the persisted Message,
never Redis-provided tenant or content. It rechecks live dispatch policy before submission.
Credentials resolve only through the shared server-only provider. Acceptance ambiguity
cannot be replayed automatically. The private replay command requires an explicit tenant
and Message identifier and records a redacted atomic audit/outbox handoff. It is limited
to trusted deployment operators; it does not expose customer data to Super Admin routes.

- Append audit events for authentication, role, tenant, connection, send, export, and administrative changes.
- Mask sensitive values in before/after data and logs.
- Encrypt data and backups as required.
- Define retention and deletion/export workflows before production.
- Prevent Super Admin/platform-employee access to customer contacts and communication content through the application. Restrict and independently audit exceptional direct database operations outside application RBAC.

## Required security testing

- IDOR and cross-tenant access across API, files, exports, realtime, and jobs.
- Privilege escalation.
- Token reuse/revocation and secret leakage.
- Webhook spoofing/replay.
- Queue tenant tampering and duplicate processing.
- Upload bypass and malicious content.
- Rate-limit and abuse suspension behavior.
- Super Admin denial on every customer-content path, plus field-level verification of metadata/aggregate administration responses.
- Tenant Admin/User single-membership isolation and campaign/template approval-version bypass tests across API and workers.

The expanded security design is maintained in `10-security-privacy-and-compliance.md` and `../design-doc/MVP_BACKEND_LLD.md`.
