# MVP Table Relationships

CLAR-071: encrypted_token/storage check changes only credential storage; existing composite
tenant/account FK and unique account binding remain unchanged. Encryption AAD additionally
binds tenant_id, whatsapp_account_id and credential id; no relationship/table added.

CLAR-069 adds a users credential-state boolean only; no FK/cardinality change. Sessions
remain user-owned and are revoked on mandatory password handover; no new relationship.

All tenant-owned relationships that could cross tenant boundaries use composite
`(tenant_id, id)` foreign keys where both sides are tenant-owned. Authentication and
Super Admin actors are referenced by global user ID. Each active Tenant Admin or Tenant
User has exactly one active `user_tenant_scopes` membership in the MVP; application
authorization also verifies that the membership role belongs to the same tenant.

| Child table | Parent relationship(s) |
|---|---|
| `subscriptions` | `tenants`, `plans` |
| `roles` | optional `tenants`; deletion actor `users` |
| `role_permissions` | `roles`, `permissions` |
| `users` | optional home `tenants`, `roles`, optional deletion actor `users` |
| `user_tenant_scopes` | `users`, single active tenant membership, optional tenant role, deletion actor `users` |
| `auth_sessions` | `users`, optional replacement `auth_sessions` |
| `whatsapp_accounts` | `tenants` |
| `provider_credentials` | tenant-matched `whatsapp_accounts` |
| `contacts` | `tenants`, optional assigned/deletion `users` |
| `contact_groups` | `tenants`, deletion actor `users` |
| `contact_group_members` | tenant-matched `contact_groups` and `contacts`, deletion actor `users` |
| `contact_imports` | `tenants`, requesting `users` |
| `contact_import_errors` | `contact_imports` |
| `templates` | tenant-matched `whatsapp_accounts`, approval requester/reviewer `users`, deletion actor `users` |
| `campaigns` | `tenants`, creator/approval requester/reviewer/delivery requester `users`, tenant-matched account/template/final preflight run, deletion actor `users` |
| `campaign_preflight_runs` | tenant-matched `campaigns`, requesting `users` |
| `conversations` | tenant-matched account/contact, optional assigned `users` |
| `messages` | tenant-matched conversation/campaign/contact/account |
| `campaign_recipients` | tenant-matched campaign/preflight run/contact/optional message |
| `conversation_notes` | tenant-matched conversation, author `users` |
| `automation_flows` | `tenants`, creator/deletion `users`, tenant-matched published version |
| `automation_versions` | tenant-matched flow |
| `automation_nodes` | tenant-matched version |
| `automation_edges` | tenant-matched version/from-node/to-node |
| `automation_runs` | tenant-matched version/conversation/optional current node |
| `media_assets` | `tenants`, uploader/deletion `users` |
| `webhook_events` | optional account and tenant resolved after verification |
| `usage_events` | `tenants`; related entity is polymorphic and service-validated |
| `audit_logs` | optional tenant and actor user |
| `idempotency_keys` | optional tenant and actor user |
| `outbox_events` | optional tenant; aggregate reference is polymorphic and service-validated |

No schema-contract foreign key uses `ON DELETE CASCADE`. Physical purge ordering is an
explicit maintenance concern, not normal API behavior.
