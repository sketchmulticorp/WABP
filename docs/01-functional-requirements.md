# Functional Requirements

## Super Admin

The Super Admin must be able to:

- View global business-account, Admin/User, WhatsApp connection, subscription, billing, usage, operational-health, and recent-activity metrics.
- View aggregate contact counts and aggregate campaign/message/send counts and statuses without receiving customer contact records, recipient details, message content, or conversation history.
- Create, update, activate, deactivate, reset credentials for, and remove Tenant Admins as policy permits.
- Create and manage business tenants and their initial Admin; inspect Admin/User account identity, role, status, tenant membership, connections, subscription, billing, usage, aggregate activity, and authorized redacted audit metadata.
- Create, duplicate, update, activate, deactivate, and retire plans.
- Configure price, validity, user, phone-number, contact, message, campaign, template, storage, and feature limits.
- Monitor provider accounts, operational health, abuse indicators, and audit logs.
- Suspend tenants when policy, security, payment, or abuse controls require it.

## Admin

The Tenant Admin is the client/business owner and must belong to exactly one tenant in the MVP. The Admin cannot switch into another business. Within the owning tenant, the Admin has full authorized access to contacts, groups, messages, inbox, templates, campaigns, automation, media, reports, settings, and team management. The Admin creates, activates, deactivates, and grants permissions to Tenant Users. Admin-created campaigns/templates may proceed directly, subject to Meta policy, plan, quota, and other server-side gates. The Admin reviews User-submitted campaigns and templates and cannot approve work outside the Admin's tenant.

## Tenant User

A Tenant User is an employee, assistant, or crew member who belongs to exactly one business tenant and receives permissions from its Tenant Admin. Within those permissions, a User may add, edit, soft-delete, manage, and track contacts, groups, inbox conversations, messages, and other tenant operations without per-operation Admin approval. A User may create and edit campaigns and templates, but the exact current material version requires Tenant Admin approval before it can be scheduled, sent, submitted to Meta, or used for sending. A User cannot approve their own work, manage another tenant, become an Admin, or expand their own permissions.

## Platform administration privacy boundary

- Super Admin is the only platform role. Tenant Admin and Tenant User are tenant workspace roles.
- Super Admin screens and APIs may expose Admin/User identity and account metadata, role, status, tenant membership, authentication/security activity, tenant operational health, billing/subscription/usage, aggregate contact counts, aggregate campaign/message/send counts and statuses, and authorized redacted audit/tracking metadata.
- Super Admin screens and APIs must not expose contact names, phone numbers, email, custom fields, notes, consent evidence, message bodies, conversation history, recipient-level delivery records, customer media, raw webhook/provider payload content, detailed customer-data exports, or search results that reveal that content.
- Tenant Admin and permitted Tenant Users may access customer details only within their one tenant and granted permissions.
- The MVP has no platform break-glass customer-content view. A future exception requires a separately approved security and privacy design with immutable auditing.
- Direct database administration is outside application authorization and requires restricted infrastructure credentials and independent auditing; it must not create an application-access path.

## Client dashboard

The dashboard should summarize connection health, contacts, campaigns, conversations, usage, plan limits, message states, recent activity, and actionable failures. Metrics must be scoped to the authenticated tenant.

## WhatsApp account management

- Start approved onboarding and associate discovered WABA and phone assets with the tenant.
- Show business name, display phone, account/phone status, synchronization state, and actionable health issues.
- Support multiple phone numbers according to plan limits.
- Select a default account where useful while allowing explicit selection per campaign/conversation.
- Synchronize templates and supported metadata.
- Disconnect/revoke safely without deleting retained business history.

## Contacts

- Create and update contacts manually.
- Import CSV and XLSX asynchronously.
- Map columns and require an explicit default country when needed.
- Normalize phone numbers to E.164-style values where possible.
- Manual entry accepts an E.164 number or an Indian local number; the approved default
  country calling code for local normalization is `+91`.
- A duplicate active phone inside one tenant is rejected rather than silently merged.
- Manual creation starts at `UNKNOWN` consent. Consent/opt-out/suppression lifecycle rules
  are applied separately from basic CRUD.
- Detect duplicates and report invalid rows with reasons.
- Never silently discard invalid records.
- Store name, phone, email, company, address, source, custom fields, notes, assigned employee, groups, last interaction, and consent/opt-out state.
- Allow future creation/import through customer API and integrations.

## Templates

- Synchronize provider templates and statuses.
- Manage internal template definitions where current provider permissions allow creation/update.
- Track name, provider ID, language, category, header, body, footer, buttons, variables, and provider status.
- Support eligible text, image, video, and document headers.
- Preview rendered content before campaign or manual send.
- Track internal Tenant Admin approval separately from Meta/provider approval.
- User-created or materially User-edited templates require Admin approval before provider submission or campaign use; Admin-created templates do not require a second internal approver.
- A material User edit to components, language, category, name, or other send-relevant configuration increments the content version, invalidates prior internal approval, and requires reapproval.
- Prevent submission or use when internal approval, provider approval, or policy requirements are not satisfied.

## Campaigns

Campaign creation must support:

1. Name and description.
2. WhatsApp account selection.
3. Audience selection by contacts, groups, saved segments, imported list, or individuals.
4. Approved template selection.
5. Per-recipient variable mapping.
6. Preflight counts and errors.
7. Immediate send or schedule.
8. Background processing and throttling.
9. Webhook-driven delivery results.

User-created or materially User-edited campaigns require Tenant Admin approval of the exact content version before scheduling or sending. Changes to audience, content/template, variables, sending account, or schedule increment the content version and invalidate earlier approval. Admin-created or Admin-materially-edited campaigns may proceed directly without a second approver, subject to all policy/preflight gates. Approval request, decision, reviewer, version, timestamps, rejection reason, and invalidation must be audited.

Campaign states are `DRAFT`, `SCHEDULED`, `QUEUED`, `RUNNING`, `PAUSED`, `COMPLETED`, `CANCELLED`, and `FAILED` where applicable. Pause, resume, or cancel must accurately describe provider and queue limitations.

Reports must include recipients, skipped/invalid/suppressed, queued, sent, delivered, read, failed, response rate where measurable, and export capability.

## Shared inbox

- List conversations with unread state and filters.
- Search by contact name, phone, and supported metadata.
- Display complete authorized message history.
- Reply with permitted text, media, documents, interactive messages, or templates.
- Display whether the customer-service window is open.
- Enforce template-only sending when a free-form business-initiated reply is not permitted.
- Assign/reassign, add notes, mark read/unread, close, reopen, and archive.
- Surface account disconnection, suppression, automation, and policy states.
- Support realtime updates and human handoff.

## Automation

- Build flows as nodes and directed edges, never hard-coded sequences.
- Support start, message, media, buttons, list, input, condition, delay, assign, contact update, WhatsApp Flow, human handoff, and end nodes.
- Trigger by keyword, interactive selection, supported entry link/QR, campaign reply, inbound event, or another configured event.
- Maintain draft, published, active, paused, and retired lifecycle states.
- Editing a published flow must create a new version.
- Allow test execution against a designated test number before activation.
- Report starts, completions, drop-offs, errors, option/node performance, and handoffs.

## Media and integrations

- Store reusable supported images, video, PDF, and documents with tenant-scoped access.
- Support website forms and future WordPress, ecommerce, and automation-platform integrations.
- Expose a customer API and outbound webhooks post-MVP, including contact, permitted send, campaign status, and conversation use cases.

## Reports and audit

- Reports must use authoritative data and make asynchronous or delayed values clear.
- Important administrative, authentication, plan, connection, send, and data changes must generate immutable audit records.
- Audit entries should contain actor, role, action, module/entity, tenant, result, time, request ID, relevant object, and security context; before/after data is required for important changes where appropriate.
