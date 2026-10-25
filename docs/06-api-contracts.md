# API Contracts

## Standards

- REST/JSON under `/api/v1` with OpenAPI 3.1 generated from source.
- ISO-8601 timestamps with timezone.
- UUID/ULID public identifiers.
- Cursor pagination for large changing collections.
- Schema validation for every request.
- Stable machine-readable error codes.
- A `request_id` or `correlation_id` on every response and asynchronous workflow.
- Idempotency keys for campaign starts, manual outbound sends, imports where appropriate, and webhook processing.
- No provider access token or secret is ever returned to the browser.
- CI validates implementation and OpenAPI compatibility.

## Response shapes

TASK-081: POST `/reports/exports` and `/platform/reports/exports` return bounded CSV attachment
responses on success, not JSON envelopes. Errors retain the standard safe envelope and every
response retains x-request-id. Strict bodies, per-kind permissions/fields, limits and exclusions
are documented in REPORT_EXPORTS.md. No stored export/download-link API is introduced.

The API validates an optional inbound `x-request-id`. Values must begin with an ASCII
letter or digit, contain only letters, digits, `.`, `_`, `:`, or `-`, and be no longer
than 128 characters. A missing or invalid value is replaced with a UUID. The effective
ID is returned in the `x-request-id` response header and in the response envelope.

Successful responses should use a consistent envelope:

```json
{
  "data": {},
  "request_id": "req_01..."
}
```

Errors should use:

```json
{
  "error": {
    "code": "WHATSAPP_TEMPLATE_NOT_APPROVED",
    "message": "Selected template is not approved.",
    "request_id": "req_01...",
    "retryable": false,
    "details": []
  }
}
```

Do not expose stack traces, raw provider secrets, or sensitive internal payloads.

Response serialization is actor-aware. Super Admin routes return only approved account
metadata, billing, operational state, aggregate metrics, and redacted audit metadata.
They never reuse tenant-content DTOs. Tenant Admin/User routes require their single active
tenant membership and reject a mismatched tenant context.

The initial shared HTTP error mapping uses stable codes such as
`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`,
`CONFLICT`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`,
`GATEWAY_TIMEOUT`, and `INTERNAL_ERROR`. Domain modules may add stable codes through
the common application-error abstraction without bypassing the envelope.

## Health endpoints

Health probes are intentionally outside `/api/v1` so infrastructure configuration
does not depend on the customer-facing API version:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health/live` | Confirms that the API process can serve requests |
| GET | `/health/ready` | Confirms configuration, PostgreSQL, and Redis readiness |

Readiness currently checks PostgreSQL and Redis. It will add object-storage readiness when
that runtime client is introduced. Health responses use the same success envelope and
request-ID contract as other API responses.

## Core endpoints

### Identity

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Authenticate and create session |
| POST | `/auth/refresh` | Rotate/refresh session |
| POST | `/auth/logout` | Revoke current session |
| GET | `/me` | Current user, tenant, entitlements, permissions |
| GET | `/me/sessions` | List the caller's active sessions |
| DELETE | `/me/sessions/{sessionId}` | Revoke one owned session family |

`POST /auth/login` accepts `{ "email", "password" }`. Login and refresh return
`{ "access_token", "expires_in", "token_type": "Bearer" }` inside the standard success
envelope. The opaque refresh token is never returned in JSON; it is sent as the
`whatsapp_refresh` HttpOnly cookie scoped to `/api/v1/auth`. `POST /auth/refresh` rotates
that cookie. `POST /auth/logout` is idempotent, revokes the presented token family when
known, expires the cookie, and returns `{ "logged_out": true }`. Session listing and
remote-session deletion are authenticated bearer-token operations. `/me` returns the
caller's identity, system role, sorted permission keys, safe tenant metadata, and active
plan/subscription entitlements. Super Admin receives `null` tenant and subscription
fields. `/me/sessions` returns only the caller's unexpired, unrevoked sessions with the
current-session flag, user agent, IP address, creation time, and expiry. A caller may
revoke any owned session, including the current one; another user's or unknown session ID
returns the same `SESSION_NOT_FOUND` response.

Every protected request verifies the access-token signature and expiry and then resolves
the exact live session, active account, role, single tenant membership, and permissions
from PostgreSQL. A revoked session cannot continue using its previously issued access
token. Permission decorators require every listed permission. Tenant-content decorators
also require an active Tenant Admin/User context and always reject Super Admin.

### Contacts

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/contacts` | List or create contacts |
| GET/PATCH/DELETE | `/contacts/{id}` | Read, update, or delete under retention policy |
| PATCH | `/contacts/{id}/consent` | Record consent, opt-out, or suppression evidence |
| POST | `/contacts/imports` | Create asynchronous import job |
| GET | `/contacts/imports` | List recent tenant-scoped import jobs so monitoring can resume after a browser closes |
| GET | `/contacts/imports/{id}` | Progress and aggregate import counts |
| GET | `/contacts/imports/{id}/errors` | Tenant-only cursor-style row-error report (`after_row_number`, `limit`) |
| GET/POST | `/groups` | Group management |
| PATCH/DELETE | `/groups/{id}` | Rename or soft-delete a static group |
| GET/POST | `/groups/{id}/members` | List or add explicit Contact memberships |
| DELETE | `/groups/{id}/members/{contactId}` | Soft-remove one explicit membership |

`GET /contacts` is tenant-scoped cursor pagination with `limit` (default 25, maximum 100)
and an opaque `cursor`; it returns `{ contacts, nextCursor }`. `POST /contacts` accepts a
phone plus optional name, email, company, address, `custom_fields`, and `assigned_user_id`.
The API accepts an E.164 number or an Indian local number and normalizes local numbers with
the approved default `+91`. A duplicate active tenant phone returns `CONTACT_PHONE_EXISTS`;
the API never merges records implicitly. Manual contacts always start with consent
`UNKNOWN`. `PATCH /contacts/{id}/consent` accepts only `OPTED_IN`, `OPTED_OUT`, or
`SUPPRESSED`; opt-in requires source, timestamp, and proof reference, while suppression
requires a reason. An assignee must be an active Tenant Admin/User in the same tenant.
Contact deletion is an audited soft delete and no Contacts route is available to Super Admin.

Imports are multipart CSV/XLSX uploads, capped at 10 MiB and 10,000 rows. The request supplies
the required `mapping.phone` header plus optional profile (`name`, `email`, `company`, `address`),
custom-field JSON, consent-evidence headers, and an optional existing `group_id`. The API scans a
validated file before tenant-scoped storage, commits the import row and `contact.import.queued`
outbox event atomically, then returns immediately. The worker normalizes each number using the
given default country (India is preselected by the workspace), keeps only the first valid
in-file occurrence, never updates an existing active Contact, and writes protected row errors.
Import files and error rows are purged after the configured 30-day default retention period.
`GET /contacts/imports` returns the most recent tenant jobs (default 25, maximum 100),
including the safe original filename, status, row counts, completion time, and safe error
code. `GET /contacts/imports/{id}/errors` returns at most 200 row errors at a time and
supplies `nextAfterRowNumber` when another report page is available.

Groups are static manual lists only. They never accept cross-tenant contacts or dynamic criteria;
both Groups and memberships are soft-deleted and ordinary reads exclude deleted rows.

### WhatsApp and templates

| Method | Path | Purpose |
|---|---|---|
| GET | `/whatsapp/accounts` | List tenant connections |
| POST | `/whatsapp/connect` | Development-only manual test-WABA/phone connection |
| POST | `/whatsapp/accounts/{id}/sync` | Sync WABA, phone, templates, health |
| DELETE | `/whatsapp/accounts/{id}` | Disconnect/revoke |
| GET/POST | `/templates` | List/manage internal definitions |
| POST | `/templates/sync` | Synchronize provider templates |
| POST | `/templates/{id}/request-approval` | User submits the current content version for Admin review |
| POST | `/templates/{id}/approve` | Tenant Admin approves the exact current content version |
| POST | `/templates/{id}/reject` | Tenant Admin rejects with a reason |

`GET /templates` and `GET /templates/{id}/preview` return only active records for the
authenticated tenant. `POST /templates` and `PATCH /templates/{id}` write a complete
material template definition; updates require `expected_content_version` and increment
the version. Tenant User material writes reset internal approval to `DRAFT`; Tenant Admin
material writes use `NOT_REQUIRED`. Tenant User templates move to `PENDING` only through
`request-approval`; a different Tenant Admin approves or rejects the exact expected
version. Provider status is never used as a substitute for internal approval.

`POST /templates/sync` accepts `{ "whatsapp_account_id": "uuid" }`, reads the official
Meta template list through the server-side credential reference, normalizes supported
metadata/components, and persists provider status separately. The endpoint follows Meta
cursor pages up to 10,000 templates and returns a safe summary plus the synchronized
tenant records. It never returns provider credentials or raw provider error payloads.

Until the production Meta partner model and Embedded Signup exchange are confirmed,
`POST /whatsapp/connect` is an authorized Tenant Admin development route. It accepts the
test `waba_id`, `phone_number_id`, display phone/name, optional business ID, and an
opaque `secret_ref` URI such as `env://META_TEST_SYSTEM_USER_TOKEN`. It never accepts,
returns, or logs a provider token. The mapping and credential reference are committed
with a redacted audit event. Production client-initiated Embedded Signup remains deferred.

`GET /whatsapp/accounts` returns only the authenticated tenant's safe account health
projection. `POST /whatsapp/accounts/{id}/sync` calls Meta's supported WABA phone-number
listing endpoint using the server-only `env://META_DEVELOPMENT_ACCESS_TOKEN` reference,
then persists display metadata, quality-derived health, and synchronization time. Missing
or invalid development credentials return a safe provider error and update the account to
an actionable degraded/auth-failed state. `DELETE /whatsapp/accounts/{id}` is a local,
audited disconnect: it revokes the stored credential reference, disables future sending,
preserves history, and selects another connected default account when available. It does
not yet unsubscribe Meta webhooks or revoke the upstream token.

### Campaigns

TASK-053 implements draft list/create/read/update plus `GET /campaigns/draft-options`.
TASK-054 adds durable preflight start and polling with aggregate results; see
`CAMPAIGN_PREFLIGHT.md`. TASK-055 implements approval/lifecycle commands and paginated
reports described in `CAMPAIGN_LIFECYCLE.md`. Automated acceptance coverage is deferred.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/campaigns` | List/create campaigns |
| GET/PATCH | `/campaigns/{id}` | Read/update draft or allowed fields |
| POST | `/campaigns/{id}/preflight` | Validate audience, content, quota, policy |
| GET | `/campaigns/{id}/preflight/latest` | Read the latest tenant-scoped preflight run |
| GET | `/campaigns/{id}/preflight/{runId}` | Poll one durable preflight run |
| POST | `/campaigns/{id}/request-approval` | User submits the exact current campaign version for Admin review |
| POST | `/campaigns/{id}/approve` | Tenant Admin approves the exact current campaign version |
| POST | `/campaigns/{id}/reject` | Tenant Admin rejects with a reason |
| POST | `/campaigns/{id}/send` | Idempotently queue immediate send |
| POST | `/campaigns/{id}/schedule` | Schedule send |
| POST | `/campaigns/{id}/pause` | Pause queued work when supported |
| POST | `/campaigns/{id}/resume` | Resume after live policy/version checks |
| POST | `/campaigns/{id}/cancel` | Cancel remaining work where possible |
| GET | `/campaigns/{id}/report` | Aggregated and recipient-level results |

### Inbox and automation

| Method | Path | Purpose |
|---|---|---|
| GET | `/conversations` | Authorized inbox list |
| GET | `/conversations/{id}` | Conversation and message history |
| POST | `/conversations/{id}/messages` | Policy-checked human reply |
| POST | `/conversations/{id}/assign` | Assign/reassign |
| GET | `/conversations/{id}/notes` | Paginated tenant-only internal notes |
| POST | `/conversations/{id}/notes` | Add/replay an append-only internal note |
| POST | `/conversations/{id}/close` | Close conversation |
| POST | `/conversations/{id}/reopen` | Reopen without changing unread/window/automation |
| POST | `/conversations/{id}/read` | Shared acknowledgement through `lastSeenMessageId` |
| POST | `/conversations/{id}/unread` | Shared manual unread attention flag |
| GET/POST | `/automations` | Flow list/create |
| GET | `/automations/options` | Cursor-paginated safe account/team options |
| GET/PATCH | `/automations/{id}` | Read/edit draft |
| POST | `/automations/{id}/test` | Side-effect-free simulation of saved draft/current publication |
| POST | `/automations/{id}/publish` | Validate and publish new immutable version |
| POST | `/automations/{id}/pause` | Pause new/active execution as defined |
| POST | `/automations/{id}/reactivate` | Enable new runs only; exact saved revision and Admin permission |
| GET | `/conversations/{id}/automation` | Safe ownership/latest run status and reason |
| POST | `/conversations/{id}/automation/takeover` | Explicit human ownership; no implicit send |
| POST | `/conversations/{id}/automation/allow` | Permit future triggers without resuming an old run |

Phase 7 schemas, permissions, revision/graph validation, parser limits and operational
boundaries are maintained in `BASIC_AUTOMATION.md` (CLAR-038/039). No standalone automation
send endpoint or client-supplied runtime/publisher/tenant context exists.

### Operations

TASK-061's implemented inbox query, cursor, projection and state contracts are detailed in
`INBOX_API.md` (CLAR-032). GET does not mark read; read/unread requires conversation.read;
close/reopen also requires conversation.close. No provider read receipt is sent.

TASK-062 implements `POST /conversations/{id}/messages` with conversation.read/reply,
strict TEXT/TEMPLATE content and `clientMessageKey`; returns HTTP 202 with safe message
identity/status/idempotency fields. See `INBOX_REPLIES.md` for routing, state blocks and
actor-scoped retry semantics. It uses the common composer, not synchronous provider delivery.

TASK-063 implements assignment/unassignment (conversation.read/assign) and internal note
list/create (read and read/reply respectively). Client-generated note UUIDs provide safe
creation retries. These internal actions work without reopening or sending. See
`INBOX_COLLABORATION.md` for limits, error codes, pagination, audit and exact replay semantics.

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard` | Scoped metrics |
| GET | `/reports` | Report catalog/results |
| GET | `/audit-logs` | Authorized audit search |
| GET/POST | `/media` | Media library |
| GET | `/usage` | Current plan usage and limits |
| GET/POST | `/webhooks/meta/whatsapp` | Provider verification/events |

TASK-080 implements `/dashboard`, `/usage`, `/audit-logs` and `/billing/payments` with existing
tenant permissions. `/platform/dashboard` adds aggregate activity; `/platform/insights/`
contains paged business metadata, selected usage/payments and safe audit routes. See
ESSENTIAL_REPORTING.md for exact projections, permissions, 30/90-day bounds and timestamp/UUID
pagination. Tenant notes/customer payloads never enter platform metrics or audit summaries.

`GET /webhooks/meta/whatsapp` validates `hub.mode=subscribe` and the server-only
`hub.verify_token`; only a valid request receives the plain-text `hub.challenge` Meta
expects. `POST /webhooks/meta/whatsapp` requires a valid `X-Hub-Signature-256` calculated
over the exact raw body. A valid delivery receives a normal `200` acknowledgement only
after it is durably persisted or recognized as a duplicate. The endpoint never returns a
payload, account identity, tenant identity, or provider secret. Its event-processing and
replay operations are not public API routes and remain deferred to TASK-036.

### Platform administration boundary

The initial platform routes are `GET /platform/dashboard`, `GET/POST /platform/tenants`,
`PATCH /platform/tenants/{id}/status`, `GET/POST /platform/plans`,
`POST /platform/tenants/{id}/subscription`, and
`GET/POST /platform/tenants/{id}/payments`. They are separately permissioned and also
enforce the live Super Admin role in the service layer. Tenant Admin/User principals are
denied even where their own-tenant permission names overlap.

Platform administration routes must be separate from tenant-content routes and use
purpose-built projections:

- Super Admin may create/activate Tenant Admin accounts and view Admin/User identity,
  role, status, tenant membership, security activity, tenant/account operational health, subscription and
  usage data, global aggregate contact counts, aggregate campaign/message/send counts and
  statuses, and authorized audit/tracking metadata.
- Tenant Admin is not a platform role. It has full authorized tenant-content access only
  for its one business and manages Tenant Users in that business. Tenant Users access only
  granted operations in the same single tenant.
- `/contacts`, contact import errors containing row data, `/conversations`, messages,
  recipient-level campaign reports, customer media/downloads, raw webhook/provider
  payloads, content search, and detailed customer-data exports require an active Tenant
  Admin/User principal whose membership matches the tenant. Super Admin status alone is insufficient.
- Platform aggregate responses must not include names, phone numbers, email, custom
  fields, notes, consent evidence, message bodies, rendered message variables, recipient
  identifiers, media URLs, or payload fragments that can reconstruct customer content.
- The MVP exposes no break-glass platform content endpoint. Cross-role denial returns the
  normal `FORBIDDEN` envelope and creates security telemetry where appropriate.

### Internal approval contract

- Campaign and template representations expose `approval_status`, `content_version`,
  `approved_version`, request/review metadata, and a safe rejection reason according to
  the caller's permissions. Meta template status is a separate `provider_status`.
- Tenant Admin-created/materially Admin-edited work uses `NOT_REQUIRED`. User-created or
  materially User-edited work uses `PENDING` after submission and cannot trigger the
  protected external action until an Admin of the same tenant records `APPROVED` for the
  exact `content_version`.
- Approval/rejection endpoints require an expected content version and fail with
  `CONFLICT` if the resource changed. Requester and reviewer must be different users.
- A material User edit atomically increments `content_version`, resets approval metadata,
  and requires a new approval request. Campaign material fields are audience,
  content/template, variables, sending account, and schedule. Template material fields
  include name, language, category, components, and other send-relevant configuration.
- Campaign schedule/send and template provider-submission/use endpoints revalidate tenant,
  permission, approval status/version, provider status where applicable, policy, quota,
  and idempotency. Workers repeat the approval-version check before the external call.
- Contact/Group CRUD, permitted inbox replies, tracking, and other granted routine
  operations do not call approval endpoints.

## Idempotency

An idempotency key is scoped by tenant, actor/client, endpoint, and a normalized request hash. Reuse with the same input returns the original accepted result. Reuse with different input returns a conflict. Keys and results need an explicit retention period.

## Pagination and filtering

Use opaque cursor tokens, deterministic sort order, and a documented maximum page size. Search and filters must be tenant scoped. Super Admin search must be limited to approved account/operational metadata and must not search tenant customer content. Exports should become asynchronous jobs when result size is large, and Super Admin must not receive detailed tenant customer-data exports.

## API versioning

Breaking customer-facing changes require a new internal API version or an explicit compatibility path. Provider Graph API versioning is independent and belongs inside the provider adapter configuration.
