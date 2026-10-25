# MVP Database Schema

Status: Approved logical schema contract  
Database: PostgreSQL 16  
Application schema: `app`  
Table count: **35**
Soft-delete table count: **11**

## Purpose and authority

CLAR-069 / ADR-028 adds users.must_change_password boolean NOT NULL DEFAULT false via
0009_initial_password_change. New tenant accounts explicitly set true; existing rows/restores
retain prior state. No new table/FK/index or soft-delete change;35 tables remain. See
INITIAL_PASSWORD_CHANGE.md for live authorization, session locking and migration rollout.

This document is the complete human-readable overview of the first MVP database. The
canonical current SQL is maintained in `../apps/api/database/schema/`, with exactly
one `CREATE TABLE` per numbered table file. `manifest.json` is the machine-readable table
inventory.

This contract defines table purpose, ownership, relationships, deletion behavior,
constraints, and migration expectations. Matching typed Drizzle definitions are maintained
in `../apps/api/src/database/schema/`; the reviewed initial migration and drizzle-kit
snapshot are in `../apps/api/database/migrations/`. Versioned migrations—not these reference
files and not manual database edits—are the only mechanism for changing a deployed
database.

## Global conventions

- IDs are UUIDs generated with `gen_random_uuid()`, except row-level import errors, which
  use `bigserial`.
- Timestamps use `timestamptz` and are stored in UTC.
- Database, table, column, constraint, and index names use `snake_case`.
- PostgreSQL schema `app` contains all application tables.
- PostgreSQL is authoritative business storage. Redis is not authoritative.
- Tenant-owned tables carry `tenant_id` directly.
- Relationships between two tenant-owned entities use composite `(tenant_id, id)` foreign
  keys where applicable, preventing cross-tenant associations at the database boundary.
- JSONB stores variable provider/configuration snapshots, not queryable core identity or
  state.
- Mutable tables use the shared `app.set_updated_at()` trigger.
- No foreign key uses `ON DELETE CASCADE` for ordinary application behavior.
- API deletion never performs physical deletion on approved soft-delete entities.
- Database storage does not imply application visibility. Super Admin queries must use
  metadata/aggregate projections and must not read or serialize tenant contact PII or
  communication content. Direct database administration uses separately
  restricted infrastructure credentials and is outside application RBAC.

## Domain summary

| Domain | Tables | Count |
|---|---|---:|
| Plans and tenancy | `plans`, `tenants`, `subscriptions` | 3 |
| Identity and authorization | `roles`, `permissions`, `role_permissions`, `users`, `user_tenant_scopes`, `auth_sessions` | 6 |
| WhatsApp provider | `whatsapp_accounts`, `provider_credentials`, `templates`, `webhook_events` | 4 |
| Contacts and imports | `contacts`, `contact_groups`, `contact_group_members`, `contact_imports`, `contact_import_errors` | 5 |
| Campaigns and messaging | `campaigns`, `campaign_preflight_runs`, `conversations`, `messages`, `campaign_recipients`, `conversation_notes` | 6 |
| Automation | `automation_flows`, `automation_versions`, `automation_nodes`, `automation_edges`, `automation_runs` | 5 |
| Media, operations, and reliability | `media_assets`, `usage_events`, `audit_logs`, `idempotency_keys`, `outbox_events` | 5 |
| **Total** |  | **35** |

## Tables

### Plans and tenancy

#### `plans`

Defines commercial packages and server-enforced limits. Important fields include `code`,
`status`, price/currency, `limits`, and `feature_flags`. Plans are referenced by
subscriptions and are retired through status rather than deleted.

#### `tenants`

Represents an isolated customer workspace. It owns tenant-scoped data through
`tenant_id`. Active slugs are unique. API deletion uses the complete soft-delete contract.

#### `subscriptions`

Records a tenant's plan period and lifecycle state. It references `tenants` and `plans`,
validates that `ends_at` follows `starts_at`, and preserves commercial history through
status values.

### Identity and authorization

#### `roles`

Defines platform roles (`tenant_id IS NULL`) and tenant roles. Active names and optional
system keys are unique within their correct platform/tenant scope. Roles are soft
deletable.

#### `permissions`

Stable seeded permission catalog identified by `permission_key`. Permissions are not
user-deletable. The approved 46-key bootstrap catalog and exact system-role assignments
are maintained by the transactional `schema:seed` workflow documented in
`BOOTSTRAP_SEED.md`.

#### `role_permissions`

Many-to-many assignment between roles and permissions. The composite primary key prevents
duplicate assignments.

#### `users`

Stores login identity, password hash, display name, role, account state, token version,
and optional home tenant. Active email addresses are globally unique. Users are soft
deletable; sessions remain available for security history and revocation.

#### `user_tenant_scopes`

Stores the single-business membership for a Tenant Admin or Tenant User with an optional
tenant-specific role. Only one active membership may exist per user in the MVP. Super
Admin has no tenant-content membership. Removing access uses soft deletion.

#### `auth_sessions`

Stores hashed rotating refresh tokens, token families, replacement chains, device/network
context, expiration, and revocation. Sessions are revoked or expired—not soft deleted.

### Official WhatsApp provider

#### `whatsapp_accounts`

Maps a tenant to an official Meta WABA and phone-number ID. Provider phone mappings are
unique, and only one default account is allowed per tenant. Disconnecting changes status
and preserves message/provider history.

#### `provider_credentials`

CLAR-071 / ADR-031: nullable encrypted_token supports authenticated encrypted tokens;
for those rows secret_ref holds only encrypted://<credential-id>.
CHECK requires ciphertext/reference consistency. Old external/development references remain
valid when encrypted_token is null; no plaintext tokens or encryption keys belong in this table.
AES-GCM envelope key ID/version/nonce/tag and AAD bind ciphertext to tenant/account/credential.
Migration0010 adds this column/check; table count remains35. The owner-authorized hosted
checkpoint2026-10-23 verified this migration, column and constraint; see MEMORY.md (CLAR-074).

Stores opaque credential references, validation state and optional authenticated ciphertext.
Plaintext permanent tokens, app secrets and encryption keys must never be stored here.

#### `templates`

Stores normalized WhatsApp templates by tenant, account, name, and language. Provider
approval is stored separately from internal Tenant Admin approval. `content_version`,
request/review actors and timestamps, `approved_version`, and rejection reason bind an
Admin decision to the exact User-authored material version. User material edits reset
internal approval; Admin-authored/materially Admin-edited work uses `NOT_REQUIRED`.
Sending still requires eligible Meta `provider_status`. Only active records participate
in identity uniqueness; API deletion is soft.

#### `webhook_events`

Durably stores deduplicated provider events before asynchronous processing. Event keys
are unique per provider. Status, attempts, error code, and timestamps support replay and
dead-letter operations. Retention applies; soft deletion does not.

### Contacts and groups

#### `contacts`

Canonical tenant contact keyed by normalized E.164 phone number. It stores identity,
custom fields, consent, opt-out, suppression, and assignment data. Active phone numbers
are unique per tenant. The active `(tenant_id, created_at DESC, id DESC)` index supports
stable cursor pagination. API deletion is soft.

#### `contact_groups`

Tenant-defined contact collections. Active group names are unique per tenant. API deletion
is soft.

#### `contact_group_members`

Tenant-safe membership between contacts and groups. Composite foreign keys require the
group and contact to belong to the same tenant. Membership removal is soft and active
membership is unique.

#### `contact_imports`

Tracks asynchronous CSV/XLSX import jobs, secure object-storage reference, mapping,
country default, processing totals, state, failure details, and `storage_deleted_at` proof
that the protected upload was purged. Import files are retained only for the configured
period (30 days by default).

#### `contact_import_errors`

Stores row number, stable error code, safe explanation, and optionally protected row data
for rejected import rows. `(import_id, row_number, error_code)` is unique so retries cannot
duplicate report rows. It belongs to one import job and follows import retention.

### Campaigns, inbox, and messages

#### `campaigns`

Stores campaign configuration, creator, account, template, audience definition, variable
mapping, schedule, lifecycle timestamps, `content_version`, and exact-version Admin
approval metadata. User material changes to audience, content/template, variables,
sending account, or schedule invalidate approval. Admin-authored/materially Admin-edited
work uses `NOT_REQUIRED`. Account/template relationships are tenant-matched. API deletion
is soft; dispatch history remains in recipient/message tables.

TASK-055 / migration `0008_campaign_lifecycle` adds `schedule_timezone`,
`template_content_version`, `start_key`, `start_hash`, `delivery_requested_by`,
`final_preflight_id`, and `pause_reason`. These bind the approved template/schedule, durable
start identity, sender and final preflight evidence. The final preflight relationship is
tenant-matched and deferred in the canonical schema because campaigns and runs reference each
other. The table count remains 35. See `CAMPAIGN_LIFECYCLE.md`.

#### `campaign_preflight_runs`

Stores durable, version-bound asynchronous preflight attempts, lifecycle state, aggregate
blockers/estimates, safe failure code, requesting actor/request correlation, and timestamps. A
partial unique index permits only one queued/processing run per campaign. It is operational
history governed by retention, not generic soft deletion.

#### `conversations`

Maintains one durable thread per tenant/account/contact combination, including assignment,
open/closed state, automation handoff state, unread count, and customer-service-window
timestamps. Conversations are closed or archived, not soft deleted.

#### `messages`

Stores inbound/outbound message history, type, delivery state, provider/client identifiers,
policy snapshot, safe error details, and lifecycle timestamps. All parent relationships
are tenant-matched. Messages follow retention policy and are never hidden by generic soft
deletion.

#### `campaign_recipients`

Freezes campaign/contact audience membership, preflight run/content version, rendered variables,
result status, optional message relationship, and skip/error reason. A campaign/contact pair is unique. These rows
are delivery evidence and follow retention policy.

#### `conversation_notes`

Internal support notes linked to a tenant-matched conversation and author. Notes never map
to provider messages and remain part of conversation/audit history.

### Automation

#### `automation_flows`

Phase 7 reuses these five tables without a migration. `trigger_config` schemaVersion=1
stores accountId/keywords/publishedBy; run `state` stores safe reason, visited keys,
outstanding Message ID and wait deadline. Draft snapshots append; only draft status changes
to RETIRED/PUBLISHED, and published graph content remains immutable. Services/repositories
enforce same-version graph/cursor relationships in addition to existing tenant foreign keys.
Protected inbound Message policy metadata and automation continuation outbox payload metadata
store transactionally committed processing receipts. They add no table/column or customer
content in Redis; OUTBOUND policy evidence is not rewritten by inbound receipt processing.
See `BASIC_AUTOMATION.md` and ADR-022 for the JSON contracts, lifecycle and pending tests.

User-managed automation container with lifecycle state and optional published version.
Active names are unique per tenant. Deleting a flow is soft and does not erase published
versions or active-run history.

#### `automation_versions`

Versioned automation snapshot with trigger configuration and publication state. Published
versions are immutable and retained because runs pin their exact version.

#### `automation_nodes`

Typed nodes for one automation version. Node keys are unique inside the version. Node
configuration and visual position are stored as version-owned JSONB snapshots.

#### `automation_edges`

Tenant-safe directed transitions between nodes in the same version, including condition
configuration and priority.

#### `automation_runs`

Runtime state pinned to a version and conversation. It stores current node, state,
deduplication event key, optimistic lock version, and lifecycle timestamps. Only one
active run is allowed per tenant/conversation.

### Media, audit, usage, and reliability

#### `media_assets`

Tenant-scoped metadata for objects stored outside PostgreSQL: storage key, original name,
MIME type, size, checksum, malware scan state, and optional provider media ID. API deletion
is soft; physical object removal follows approved retention rules.

#### `usage_events`

Append-only usage ledger with quantity, unit, deduplication key, related entity, provider
reference, and occurrence time. It is the rebuildable source for usage projections.

#### `audit_logs`

Append-only record of actor, action, entity, result, before/after snapshots, request ID,
and safe security context. Ordinary users cannot mutate or delete audit records.

#### `idempotency_keys`

Scopes request deduplication by tenant, actor, HTTP method, route, and idempotency key.
It stores request hash, response snapshot, processing state, and expiry. Cleanup is based
on `expires_at`.

#### `outbox_events`

Transactional handoff from committed business state to queues. It stores aggregate/event
identity, payload, correlation ID, schema version, relay state, attempts, availability, and
worker-lock timestamps. Relay state is `PENDING`, `PROCESSING`, `PUBLISHED`, or `FAILED`;
workers use `locked_at` and `locked_by` with a bounded stale-lock timeout before retrying.
Workers retain and clean these rows through an operational retention policy.

## Soft-deletion contract

The following 11 tables are soft deletable:

`tenants`, `roles`, `users`, `user_tenant_scopes`, `contacts`, `contact_groups`,
`contact_group_members`, `templates`, `campaigns`, `automation_flows`, and
`media_assets`.

Every covered table contains:

```sql
is_deleted boolean NOT NULL DEFAULT false,
deleted_at timestamptz,
deleted_by uuid
```

Normal repository reads, joins, counts, updates, searches, exports, and authorization
lookups must enforce `is_deleted = false`. DELETE APIs perform an audited update in a
transaction. Restore operations explicitly include deleted rows, clear deletion metadata,
and re-check authorization, parent state, active uniqueness, and business rules.

Append-only, security, delivery, queue, immutable-version, and other history tables are
excluded because hiding them could break auditability, replay, idempotency, authentication,
or operational correctness.

Soft deletion is not backup and is not permanent privacy erasure. PostgreSQL backups,
point-in-time recovery, and a separately approved retention/privacy purge remain required.

## Relationship rules

- Tenant-owned parents expose `UNIQUE (tenant_id, id)` where a child needs a composite
  tenant-safe foreign key.
- A message cannot reference a conversation, campaign, contact, or WhatsApp account from
  another tenant.
- A campaign recipient cannot reference a campaign, contact, or message from another
  tenant.
- One user cannot have multiple active tenant memberships in the MVP.
- Database approval constraints reject self-review and require an approved version to
  equal the current content version. Application services additionally verify that the
  reviewer is an active Admin of the same tenant and atomically invalidate approval on
  material User edits.
- Group membership cannot connect groups and contacts from different tenants.
- Automation versions, nodes, edges, and runs retain tenant consistency through composite
  foreign keys.
- Polymorphic `related_entity_id` and `aggregate_id` values are validated in application
  services because PostgreSQL cannot express a foreign key to multiple table types.
- No hard cascade is used for normal API deletion. Approved purge jobs must resolve
  dependencies explicitly.

The exhaustive parent/child map is maintained in
`../apps/api/database/schema/RELATIONSHIPS.md`.

## Schema file order

The separate SQL files retain dependency order (CLAR-077):

1. `000_bootstrap.sql` creates `pgcrypto` and schema `app`.
2. Numbered per-table SQL files create the current35 tables in manifest dependency order.
3. `900_deferred_foreign_keys.sql` adds cyclic/deferred actor and published-version keys.
4. `910_updated_at_triggers.sql` installs timestamp maintenance.

Do not execute these reference files on an existing application database. Deploy only new
reviewed versioned migrations; the split schema is for reading/disposable validation.

## Local validation

Structural validation without PostgreSQL:

```bash
pnpm schema:verify
```

This also verifies that the committed initial Drizzle migration and snapshot retain the
approved 35-table inventory, deferred relationships, UUID prerequisite, no-cascade rule,
and timestamp triggers.

Review the current drizzle-kit snapshot consistency:

```bash
pnpm schema:drizzle:check
```

Generate a named forward migration after changing both the canonical contract and typed
schema:

```bash
pnpm schema:drizzle:generate -- --name=<migration_name>
```

Complete PostgreSQL validation through the local Docker service:

```bash
pnpm schema:validate:db
```

Apply reviewed migrations and exercise the runtime transaction/outbox path:

```bash
pnpm schema:migrate
pnpm schema:test:integration
```

The controlled deployment and failure-recovery procedure is documented in
`DATABASE_OPERATIONS.md`.

The database runner:

1. Reads the machine manifest and every separate schema SQL file in approved order.
2. Creates an exact-named disposable database in local Docker PostgreSQL.
3. Opens a transaction with stop-on-error behavior and executes all table, index,
   constraint, and trigger definitions.
4. Asserts the current manifest count (35 tables), 11 soft-delete tables, zero cascading foreign keys,
   single-business active membership, exact-version campaign/template approval, self-review
   prevention, and separation of internal template approval from provider status.
5. Rolls back and removes the disposable database, leaving development data unchanged.

If Docker PostgreSQL uses a non-default user, set `POSTGRES_USER` before running the command.

## Change procedure

Any database change must be made as one coherent change set:

1. Confirm the product/data/security requirement and approval.
2. Update the affected per-table SQL file in `schema/`; do not combine all tables into one file.
3. Update `manifest.json`, table manifest, relationship map, and soft-delete policy where
   applicable.
4. Update matching Drizzle definitions.
5. Generate and review a new forward-only migration under `migrations/`; never rewrite an applied migration.
6. Record repository, tenant-isolation, migration and rollback/run-forward coverage; ask the owner
   whether to write/run tests at the phase checkpoint, preserving deferred records.
7. Run `pnpm schema:verify` and applicable static checks during implementation. Run database
   validation/test-containing `pnpm check` only at an owner-approved checkpoint.
8. Update the LLD, ADR/decision log, and project memory for material changes.

Never modify a deployed database manually and never add an application-only column that
is absent from this contract and its migration.
