# Product Requirements Document

## Product

WhatsApp Marketing + Contacts + Shared Inbox + Automation SaaS.

## Problem

Businesses need a compliant way to connect official WhatsApp Business accounts, organize contacts, send approved-template campaigns, receive and answer customer messages, and automate common conversations without depending on browser-based sending or unofficial WhatsApp Web automation.

## Target users

- Small and medium businesses using WhatsApp for customer communication.
- Tenant Admins—the client/business owners—who manage their single business workspace, contacts, groups, templates, campaigns, automation, billing view, and team access.
- Tenant Users—employees, assistants, or agents—who perform permitted workspace operations and submit campaign/template work for Admin approval.
- Super Admins—the application owner and trusted platform partners—who manage business accounts, plans, billing, aggregate usage, and operational health without access to tenant contact PII or message content.

## Primary outcome

Give each tenant one secure workspace for compliant WhatsApp campaigns, contact organization, automated conversation flows, and human support.

## MVP capabilities

CLAR-070 / ADR-029 supersedes earlier preview exclusions for tenant reports/direct CSV,
development WhatsApp setup, templates and campaign drafts/internal review. Existing features
work without S3/SMTP; preflight/delivery, Inbox, automation and uploads stay off.

CLAR-068 / ADR-027 added database-only platform and Tenant Admin team administration,
metadata/aggregates, manual billing and bounded platform CSV. Later CLAR-070/071 expand
authorized reporting/authoring/onboarding without S3/SMTP; imports, messaging and background
work remain disabled. See RAILWAY_LIMITED_PREVIEW.md for the current scope and evidence.

CLAR-065 adds an opt-in test preview, not a reduction of full MVP scope: login/session roles
and manual tenant Contacts/Groups on PG/Redis/API/Web, subsequently expanded as noted above.
Full local/default retains the capabilities below. See ADR-024 and
RAILWAY_LIMITED_PREVIEW.md. No customer launch or hosted authentication verification implied.

Delivery priority: finish the essential end-to-end workflows below using the existing stack.
Do not add advanced features or speculative scale infrastructure ahead of a usable product.
See `MVP_DELIVERY_PRIORITIES.md` (CLAR-030) for the approved sequence, focused launch checks,
Meta test-account validation and separately tracked extended hardening. Basic automation
remains included; existing exclusions and security/data-integrity requirements are unchanged.

1. Authentication, sessions, RBAC, and tenant isolation.
2. Super Admin platform oversight plus single-business Tenant Admin and Tenant User access.
3. Plans, subscriptions, feature flags, and usage limits.
4. Official Meta Embedded Signup and WhatsApp account health.
5. Contacts, Groups, consent, opt-out, suppression, and CSV/XLSX import.
6. Template synchronization, separate Admin/Meta approval states, validation, and preview.
7. Campaign drafts, Admin approval for User-authored material versions, audience selection, preflight, scheduling, queue-based dispatch, and reports.
8. Verified webhooks and idempotent message-status processing.
9. Shared inbox, conversation history, agent replies, assignment, notes, close/reopen, and unread state.
10. Basic versioned automation, interactive choices, contact updates, assignment, and human handoff.
11. Audit logs, usage ledger, operational dashboards, and basic exports.
12. Railway deployment for a verified initial workload, with 1,000-1,200 registered/daily users as the capacity target; validate representative deployed load before expanding to that workload.

## Explicitly out of scope

- Tags.
- Lead CRM or sales pipeline.
- AI features.
- White-labeling.
- Public customer API and broad third-party integrations in the first MVP.
- Mobile native applications.
- Payment gateway integration unless separately approved.
- Unofficial WhatsApp Web automation or policy bypasses.

## Critical user journeys

CLAR-081: existing Super Admin -> Add Super Admin -> trusted partner metadata/temporary
password -> audited platform-only account -> restricted first login -> mandatory password
change -> fresh login. No tenant membership/content access, invitation email, role editing
or reuse of first-account bootstrap. Existing owners unchanged; SUPER_ADMIN_CREATION.md.

CLAR-071: agency-managed/client-owned onboarding uses the same tenant account model.
Agency operators act through that client's Tenant Admin, not Super Admin. Server selects
development or embedded_signup. Foundation exists; secure Embedded Signup completion and
per-business credential persistence remain pending. See WHATSAPP_ONBOARDING.md.

CLAR-069: newly created Tenant Admin/User signs in with temporary password -> restricted
change form -> verifies temporary password and replaces it -> all sessions revoked -> fresh
login. No workspace access before completion; existing users are not retroactively forced.

### Tenant onboarding

Login -> complete business profile -> connect WhatsApp through approved onboarding -> validate account -> synchronize templates -> add/import contacts -> create Groups -> create a campaign or automation.

### Campaign

Create draft -> select account -> select Contacts/Groups -> choose an internally and Meta-approved template -> map variables -> if authored/materially edited by a User, obtain Admin approval -> run preflight -> schedule/send -> process in workers -> receive webhook statuses -> view report.

### Customer support

Customer message -> verified webhook -> correct tenant conversation -> optional automation -> human handoff -> assigned agent reply -> delivery status.

## Success criteria

- Cross-tenant access is prevented in API, database access, storage, realtime, and jobs.
- Super Admins receive only authorized identity/account metadata, billing, aggregate customer-activity metrics, and redacted audit/operational metadata; customer contact records and communication content remain available only to the owning tenant's authorized Admin and Users.
- Each Tenant Admin and Tenant User is bound to one business in the MVP and cannot switch to another tenant.
- A User-created or materially User-edited campaign/template cannot cause an external publish/send until the owning Tenant Admin approves its exact current version; material changes invalidate approval.
- A campaign continues after the initiating browser closes.
- Duplicate requests and webhooks do not duplicate sends or inbox messages.
- Opt-out, template, service-window, package, and provider rules are enforced server-side.
- An inbound message appears in the correct tenant inbox.
- An authorized agent can reply through the application.
- Interactive responses advance the correct published automation version once.
- Human handoff stops unwanted automated replies.
- The deployment is validated for its agreed launch workload; the 1,200-user target requires measured representative load evidence before capacity is claimed or admitted.

## Detailed requirements

The maintained feature-level specification is `01-functional-requirements.md`. Acceptance and traceability are maintained in `13-testing-and-acceptance.md` and `15-requirements-traceability.md`.
