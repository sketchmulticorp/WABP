# MVP PostgreSQL Schema Contract

This folder is the human-readable SQL contract for the backend database. It defines
**35 MVP tables** in PostgreSQL schema `app`, with exactly one table per numbered SQL file.
CLAR-077 retains the original separate-file layout; no combined schema.sql is used.

## Authority and change process

- These separate files define the approved logical schema, constraints, indexes, relationships,
  tenant-isolation rules, and deletion strategy.
- They are executable in approved manifest order against a fresh disposable PostgreSQL 16 database for design
  validation; never apply it to an existing application database.
- They are not a replacement for versioned migrations. Matching typed Drizzle definitions
  live in `../../src/database/schema/`, and reviewed migration artifacts live in
  `../migrations/`.
- Every future structure change starts with approval and produces a new reviewed versioned
  migration under `../migrations/`. Update the matching Drizzle definitions, affected per-table
  SQL and applicable manifest/relationship/deletion documentation in the same change.
  Never rewrite applied migrations. Record coverage during implementation and ask whether
  to write/run tests at the phase checkpoint, following RULES.md.
- Do not edit a deployed database manually. Apply reviewed migrations.
- Tenant Admin/User membership is single-business in the MVP. User campaign/template
  approval is bound to the exact material content version on the existing entity tables;
  internal approval does not replace Meta template approval or append-only audit evidence.

## Separate file order

1. `000_bootstrap.sql` creates required extensions and the `app` schema.
2. Numbered per-table SQL files create each table in manifest dependency order.
3. `900_deferred_foreign_keys.sql` adds circular/deferred relationships.
4. `910_updated_at_triggers.sql` adds shared timestamp maintenance.

`manifest.json` maps each table to its own file, ownership and deletion policy.
Normal Contact/message inserts remain API operations, not schema migrations or edits to these files.

## Migration changes already reflected in these table files

The separate files describe the **current resulting schema**, not only the initial schema.
Do not concatenate migration ALTER statements onto them: reflect columns, constraints and
indexes directly in the appropriate current table definition. Retain migrations as the
ordered executable history for existing databases. Review checkpoint:2026-10-23 / CLAR-078.

| Migration | Current schema file(s) | Reflected change |
| --- | --- | --- |
| `0000_initial_mvp_schema` | Original table files, bootstrap, deferred keys and triggers | Initial33-table baseline |
| `0001_manual_payment_records` | `035_payment_records.sql` | Payment table, references, checks and paid-date index |
| `0002_webhook_outbox_claims` | `330_outbox_events.sql` | locked_at/locked_by and PROCESSING state |
| `0003_contacts_cursor_listing` | `120_contacts.sql` | Active tenant/created_at/id pagination index |
| `0004_bumpy_puppet_master` | `120_contacts.sql` | consent_proof_reference and opt-in evidence constraint |
| `0005_plain_dreadnoughts` | `150_contact_imports.sql` | storage_deleted_at |
| `0006_thin_vulcan` | `160_contact_import_errors.sql` | Unique import/row/error-code combination |
| `0007_campaign_preflight` | `205_campaign_preflight_runs.sql`, `210_campaign_recipients.sql` | Preflight table/checks/indexes/references and recipient run/version fields |
| `0008_campaign_lifecycle` | `180_campaigns.sql`, `900_deferred_foreign_keys.sql` | Schedule timezone/template version/start fields, requester/final preflight/pause reason and references/check |
| `0009_initial_password_change` | `070_users.sql` | must_change_password with false default |
| `0010_encrypted_provider_credentials` | `110_provider_credentials.sql` | encrypted_token and storage-consistency constraint |

This map records structural review, not exhaustive name/default/order/catalog equivalence.
Static verification and owner-approved disposable database parity checks retain their existing
roles. Future migrations must update this map and affected per-table/Drizzle definitions together.

## Supporting documentation

- `TABLE_MANIFEST.md`: table count, ownership, purpose, and deletion strategy.
- `RELATIONSHIPS.md`: foreign-key relationship map and tenant-integrity rules.
- `SOFT_DELETE_POLICY.md`: required API/repository deletion and restoration behavior.
- `manifest.json`: machine-readable inventory used by the verification script.

Run `pnpm schema:verify` from the repository root after any schema-contract or Drizzle
migration change. The check verifies the manifest, migration table inventory, required
deferred foreign keys, timestamp triggers, and the committed Drizzle snapshot.
