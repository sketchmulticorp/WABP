# MVP Table Manifest

Total tables: **35**.

CLAR-071 encrypted credentials adds nullable encrypted_token and storage check to
provider_credentials; no new table or relationship. Version/key ID/nonce/tag live in the
authenticated ciphertext envelope, never secret_ref. Existing references remain compatible.

CLAR-069: users adds must_change_password (false default, new tenant INSERTs true).
Inventory/manifest.json unchanged: no table/domain/deletion or relationship additions.

| # | Table | Domain | Purpose | Deletion strategy |
|---:|---|---|---|---|
| 1 | `plans` | Plans | Feature and usage packages | Status (`RETIRED`) |
| 2 | `tenants` | Tenancy | Customer workspace | Soft delete |
| 3 | `subscriptions` | Plans | Tenant plan periods | Lifecycle status |
| 4 | `roles` | Authorization | Platform/tenant roles | Soft delete |
| 5 | `permissions` | Authorization | Stable permission catalog | Immutable seed |
| 6 | `role_permissions` | Authorization | Role permission assignments | Explicit assignment removal |
| 7 | `users` | Identity | Login identities and profiles | Soft delete |
| 8 | `payment_records` | Billing | Append-only manual payment ledger | Append-only |
| 9 | `user_tenant_scopes` | Authorization | Single-business Admin/User membership | Soft delete |
| 10 | `auth_sessions` | Identity | Refresh-token rotation state | Expiry/revocation |
| 11 | `whatsapp_accounts` | WhatsApp | Meta WABA/phone connection | Connection status |
| 12 | `provider_credentials` | WhatsApp | References or authenticated encrypted tokens | Credential status |
| 13 | `contacts` | Contacts | Tenant address book | Soft delete |
| 14 | `contact_groups` | Contacts | Contact collections | Soft delete |
| 15 | `contact_group_members` | Contacts | Group membership | Soft delete |
| 16 | `contact_imports` | Imports | Import jobs and totals | Retention policy |
| 17 | `contact_import_errors` | Imports | Row-level import errors | Retention policy |
| 18 | `templates` | Templates | Normalized template plus internal/provider approval | Soft delete |
| 19 | `campaigns` | Campaigns | Campaign lifecycle, schedule/template approval binding and durable start identity | Soft delete |
| 20 | `conversations` | Inbox | Tenant/account/contact thread | Status/archive |
| 21 | `messages` | Messaging | Inbound/outbound history | Retention policy |
| 22 | `campaign_recipients` | Campaigns | Audience snapshot and outcomes | Retention policy |
| 23 | `conversation_notes` | Inbox | Internal support history | Retention policy |
| 24 | `automation_flows` | Automation | User-managed automation | Soft delete |
| 25 | `automation_versions` | Automation | Published/draft snapshots | Immutable after publication |
| 26 | `automation_nodes` | Automation | Versioned flow nodes | Version-owned immutable data |
| 27 | `automation_edges` | Automation | Versioned transitions | Version-owned immutable data |
| 28 | `automation_runs` | Automation | Pinned runtime state | Retention policy |
| 29 | `media_assets` | Media | Object-storage metadata | Soft delete |
| 30 | `webhook_events` | Webhooks | Durable provider events | Retention/replay |
| 31 | `usage_events` | Usage | Append-only usage ledger | Append-only |
| 32 | `audit_logs` | Audit | Append-only action evidence | Append-only |
| 33 | `idempotency_keys` | Reliability | Request deduplication | Expiry cleanup |
| 34 | `outbox_events` | Events | Transactional queue handoff | Retention cleanup |
| 35 | `campaign_preflight_runs` | Campaigns | Durable version-bound preflight attempts and estimates | Retention policy |
