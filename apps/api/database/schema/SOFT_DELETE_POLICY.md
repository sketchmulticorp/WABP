# Soft-Delete Policy

## Purpose

Soft deletion protects user-managed business records from accidental API deletion and
supports controlled restoration. It does not replace encrypted backups, point-in-time
recovery, retention enforcement, or legally required erasure.

## Covered tables

`tenants`, `roles`, `users`, `user_tenant_scopes`, `contacts`, `contact_groups`,
`contact_group_members`, `templates`, `campaigns`, `automation_flows`, and
`media_assets`.

Each covered table has:

```sql
is_deleted boolean NOT NULL DEFAULT false,
deleted_at timestamptz,
deleted_by uuid
```

A check constraint requires active rows to have no deletion metadata and deleted rows to
have `deleted_at`. `deleted_by` may be null only for an approved system operation.

## Mandatory repository behavior

- Ordinary reads, updates, joins, counts, searches, exports, and authorization lookups
  must include `is_deleted = false` for every covered table they reference.
- Shared repository helpers must apply the active-row predicate by default. Reading
  deleted rows requires an explicitly named restore/audit method and authorization.
- DELETE APIs perform an audited update setting `is_deleted = true`, `deleted_at = now()`,
  and `deleted_by` to the authenticated actor. They do not issue SQL `DELETE`.
- A delete is idempotent. Repeating it must not rewrite the original deletion evidence.
- Restore clears all three deletion fields in one transaction and must re-run tenant,
  authorization, uniqueness, parent-activity, and business-policy checks.
- Active natural-key uniqueness uses partial indexes with `WHERE is_deleted = false`.
  Restoration fails with a conflict if an active row already owns the key.
- Aggregate propagation is explicit in application services and transactions. Database
  cascades are not API deletion behavior.
- Physical deletion is allowed only through an approved retention/privacy purge process
  with authorization, audit evidence, dependency checks, and backup policy alignment.

## Create-or-restore policy

Automatic create-or-restore is limited to the approved natural identities below. An active
match remains a duplicate conflict; exactly one deleted match restores the existing UUID; more
than one deleted match fails for explicit review.

- `users`: normalized email. Tenant Admin may restore only into the authenticated tenant as the
  system Tenant User role. Apply the submitted password, ACTIVE status, current membership,
  token-version increment and session revocation. A deleted foreign/platform identity is not
  claimable.
- `contacts`: normalized tenant + E.164 phone. Refresh submitted profile fields while retaining
  consent, opt-out, suppression and contact-history fields. Do not restore Group memberships.
- `contact_groups`: tenant + normalized Group name. Do not restore Group memberships.

Each restore clears `is_deleted`, `deleted_at` and `deleted_by` atomically and emits a distinct
redacted restore audit. This policy does not automatically restore tenants, roles, templates,
campaigns, automation flows, media assets, or any operational/history table.

## Tables intentionally excluded

Append-only evidence and operational/history tables use lifecycle status, revocation,
expiry, or retention cleanup. Adding `is_deleted` to one requires an approved schema and
security decision because hiding these rows can break audit, replay, deduplication,
delivery history, or queue correctness.
