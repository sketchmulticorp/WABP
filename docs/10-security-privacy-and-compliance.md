# Security, Privacy, and Compliance

## Security objectives

- Prevent cross-tenant access and privilege escalation.
- Protect provider and user credentials.
- Verify that inbound provider events are authentic.
- Prevent duplicate or unauthorized outbound sends.
- Preserve auditability and recoverability.
- Minimize exposure of customer identity and conversation content.
- Enforce messaging policy in product behavior, not only documentation.

## Application security baseline

- TLS 1.2 or newer and HTTPS everywhere.
- CDN/WAF and endpoint-specific rate limits.
- Strong schema validation and output filtering.
- Parameterized queries/ORM protections.
- CSRF protection where cookie-based authentication requires it.
- Secure cookie/session settings and controlled CORS.
- SSRF defenses for externally supplied URLs.
- Request/body/file size limits.
- No production stack traces or secrets in errors.
- Dependency, secret, code, container, and infrastructure scanning in CI/CD.
- Regular authorization and tenant-isolation tests.

## Authentication and authorization

Use Argon2id or another approved modern password hashing method. Rotate refresh tokens and revoke them on reuse, password reset, or material security events. Require stronger controls for Super Admin, including recommended mandatory 2FA. Every protected request re-resolves its exact live PostgreSQL session, active account, role, membership, tenant, and current permission keys. Permission requirements use all-of semantics. Tenant-content operations require a non-platform Tenant Admin/User context and an explicit repository tenant predicate; Super Admin cannot obtain that context. All protected operations require authenticated identity, permission, tenant scope, plan entitlement, and relevant object authorization.

Super Admin status is not tenant-content authorization. Super Admin may use purpose-built
administration queries for account identity, role/status/membership, billing, operational
health, subscription/usage, aggregate contact/campaign/message/send metrics, and authorized
redacted audit metadata. Super Admin must be denied contact PII and custom fields,
message/conversation content, recipient-level delivery data, customer media, raw provider
payload content, content-revealing search, signed content downloads, and detailed
customer-data exports. Tenant Admin and Tenant User are bound to one tenant in the MVP;
only those active tenant principals may access authorized tenant content. The application
has no MVP break-glass customer-content mode.

Campaign/template approval is a server-side authorization and integrity control, not a UI
state. A User cannot approve their own work. Approval must name an active Admin in the same
tenant and the exact material content version. Material User edits invalidate approval in
the same transaction as the edit. API and worker paths revalidate the version immediately
before template submission/use or campaign scheduling/sending to prevent stale-approval
and time-of-check/time-of-use bypasses. Meta template approval remains independently
required.

## File and media security

- Initial imports: CSV and XLSX only, capped at 10 MiB and 10,000 rows.
- Explicit allowlist for media types and sizes.
- Validate extension, MIME signature, and content as appropriate.
- Validate CSV/XLSX signatures, reject unsafe XLSX archive expansion, and scan untrusted uploads through ClamAV before storage.
- Use randomized object keys; never use the user filename as a storage path.
- Preserve original display filename separately from normalized/internal name.
- Use short-lived signed download URLs.
- Retain protected import files and protected row-error data only for the configurable 30-day default, then delete them in the import worker.
- Enforce tenant and user permission at upload and download time.

## Messaging policy controls

Product behavior must implement, subject to current official rules:

- Record meaningful WhatsApp-specific opt-in and its source/time/category.
- Honor opt-out/block/stop requests through suppression and campaign exclusion.
- Require approved templates for business-initiated conversations where required.
- Allow eligible non-template replies only in the customer-service window.
- Provide clear human escalation for automated support flows.
- Maintain accurate business/support information.
- Provide abuse detection, tenant suspension, and operational review.
- Do not design around evasion of quality, throttling, template, or anti-spam restrictions.

Regulated industries and sensitive workflows require product/legal review. The application should warn against collecting prohibited payment-card, bank-account, government-ID, or other unnecessary sensitive information through WhatsApp.

## Privacy

- API deletion of approved user-managed entities is recoverable soft deletion. The
  application records `is_deleted`, deletion time, and deletion actor in an audited
  transaction and excludes those rows by default.
- Operational evidence such as audit, usage, webhook, outbox, session, message,
  campaign-recipient, and immutable automation history must not be hidden through a
  generic soft-delete flag.
- Soft deletion does not satisfy permanent erasure by itself. Legal/privacy erasure and
  retention expiry require a separately approved purge workflow that accounts for
  foreign keys, audit evidence, provider obligations, backups, and restoration windows.
- Publish privacy policy, terms, support, and data-deletion information before production onboarding.
- Document collected data, purpose, legal basis/consent where applicable, subprocessors, storage regions, and retention.
- Minimize conversation/content storage and employee access.
- Prevent Super Admin/platform employees from viewing tenant customer content through the application; do not rely on auditing alone as the access control.
- Support tenant export and deletion workflows where legally required.
- Encrypt databases, object storage, secrets, and backups as appropriate.
- Redact phone numbers, tokens, message content, and sensitive fields from routine logs.
- Keep audit logs separate from mutable business records.

## Audit log

Audit entries should include ID, tenant, actor/service, actor role, action, entity type/ID, selected before/after data, result, IP/device where appropriate, request ID, and timestamp. Ordinary users must not be able to modify audit records. Highly sensitive values must be masked even in before/after data.

Platform audit views expose only metadata needed for security, administration, and
tracking. Before/after snapshots must be allowlisted or redacted so they cannot leak
contact PII, message bodies, rendered variables, media locations, or raw provider content.
Direct production database access is an infrastructure operation outside application
RBAC; restrict it to dedicated credentials, log it independently, and never surface it as
an application backdoor.

## Security events and response

Alert on repeated login failures, refresh-token reuse, unexpected cross-tenant denials, webhook signature failures, provider credential failures, unusual send volume, queue anomalies, export spikes, and administrative changes. Maintain an incident runbook covering containment, credential rotation, tenant communication, provider coordination, recovery, and evidence retention.

## Required security tests

- IDOR across every tenant-owned resource.
- Privilege escalation across role and scope boundaries.
- Realtime channel subscription isolation.
- Signed URL and export authorization.
- Queue job tenant tampering.
- Webhook spoofing/replay and duplicate delivery.
- Token/secret leakage in responses and logs.
- Upload bypass, malicious content, and path handling.
- Rate-limit behavior and abuse suspension.
- Super Admin denial across contact, inbox/message, media, raw-payload, content-search, signed-download, recipient-detail, and detailed-export paths.
- Super Admin aggregate projections cannot be combined with identifiers or payload fragments to reconstruct customer content.
- Single-tenant enforcement for every Tenant Admin/User API, job, realtime subscription, file, and export path.
- Self-approval, cross-tenant approval, stale-version approval, post-approval material edits, direct send/schedule, worker replay, and template submission/use bypass attempts.
