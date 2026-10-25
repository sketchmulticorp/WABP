# Backup, monitoring and incident runbook — TASK-083

Status: local preparation under CLAR-043, 2026-10-17. No production controls applied.
Use RAILWAY_STAGING_GUIDE.md for service settings; PHASE_8_LOCAL_REPORT.md records evidence.

## Owner decisions required before customer launch

Record approved RPO (maximum acceptable data loss), RTO (acceptable recovery downtime),
backup schedule/retention, recovery region, protected backup destination, encryption/key
custody, operators, incident contact and monitoring/alert destinations. No values have been
chosen on the owner's behalf. Cost limits and data retention are distinct decisions.

## Backup inventory and access

PostgreSQL is authoritative: schema/migration ledger, identities/roles/sessions, tenant data,
messages/recipients, approvals, usage, audit, webhook receipts and outbox. Back up the whole
database, not only active rows. Soft-deleted records/history/constraints must survive recovery.
Redis needs durable queues/noeviction, but is not a database backup. Preserve bucket objects
and their metadata/keys consistently with database records. Configuration and signing/
encryption keys need separately protected versioned recovery records; never include secrets
in Git, application logs, support exports or unencrypted fixture reports.

Choose Railway's actual available database backup/PITR controls only after checking account/
plan support. Verify schedule, retention, last successful completion, failure notification
and restore permissions in the selected environment. Do not assume a mounted volume, Redis
AOF, soft deletion or successful backup creation proves restoration works. Keep protected
off-failure-boundary copies if the owner's approved recovery policy requires them.

Use least-privilege backup access, encrypted storage/transport, restricted restore credentials
and access audit. Logical exports contain personal data/password hashes/tokens and require
the same confidentiality as the application. Never copy real customer dumps to a developer
laptop for routine tests. The local helper accepts only generated synthetic fixture names.

## Restore drill and disaster recovery

Local synthetic tool (never production): `node --env-file-if-exists=.env
infra/operations/recovery-drill.mjs` from repository root. It refuses production/remote URLs,
creates two new generated databases, migrates the source, inserts synthetic tenant/marker
rows (including a soft-delete marker), streams a custom archive in memory via the existing
compose PostgreSQL pg_dump/pg_restore, compares 35-table schema/migration/fixture evidence,
verifies a restored unique constraint and drops only databases this invocation created.
No application source data, input archive, existing target, force/clean restore or disk dump
is accepted. The public fixture marker is disposable-only, not a new app schema table.
Credentials pass through child environment, not argv/output. Docker and the same local
compose PostgreSQL instance must be running. This does not exercise bucket/Redis/provider
recovery, real customer data, encryption-key recovery or production backup scheduling.

1. Identify incident scope/time and freeze affected deployment changes. With authority,
   stop sends/schedulers and restrict writers before recovery. Preserve logs and evidence;
   do not purge Redis, outbox or uncertain SENDING records as a shortcut.
2. Select a verified backup/recovery point and **new isolated target**. Obtain approval for
   recovery actions; never restore over the existing database or use DROP/--clean on it.
3. Restore with PostgreSQL tools compatible with the server/backup format. Recreate required
   roles/extensions by a restricted operator; never grant application superuser privileges.
4. Validate schema/migration ledger, row counts/checksums, FK/unique constraints, audit/usage,
   soft-delete history and encrypted-field/key recovery. Check bucket references and objects.
5. Keep outbound providers disabled. Reconcile database/outbox/Redis against provider evidence
   before enabling consumers. Restoring older state can resurrect jobs or lose delivery
   receipts; never automatically resend an ambiguous provider submission.
6. Rotate/revoke credentials/sessions if recovery or compromise requires it. Record identity,
   consent/STOP changes after the recovery point and reconcile before re-enabling sends.
7. Run authorized isolated role/tenant/approval/consent/inbox smoke checks. Switch only after
   owner approval; retain old state for investigation under approved retention.
8. Record backup timestamp, recovery point, start/end, measured data loss/downtime, verifier,
   defects and retest. A local synthetic round trip is not production RPO/RTO certification.

Database-only restore does not restore bucket files, Redis, provider state or signing keys.
Quarterly drills remain the documented baseline; exact production objectives are pending.

## Minimum monitoring and alert setup

Use the existing Railway ecosystem/dashboard/logs first. This task does not install an
external telemetry vendor or invent API/queue endpoints. Configure owner-approved alert
destinations and thresholds against actual available signals; verify delivery with a safe
synthetic event and record evidence. Deployment health checks are not continuous monitoring.

| Signal | Action when confirmed | Verification still required |
| --- | --- | --- |
| Public web/API unavailable or API readiness 503 | Inspect process/recent release/DB/Redis, stop rollout | Continuous monitor and owner-approved alert window |
| Worker/scheduler stopped, queue oldest-job age growing | Inspect private process health, queue/relay failures, provider limits | Alert from actual queue/process signals, not public worker exposure |
| PG backup missing/failed or restore drill failed | Treat recoverability as degraded; notify owner | Real scheduled failure notification and isolated restore |
| PG connections/latency/locks/storage high | Check pool budgets and measured slow queries | Threshold relative to chosen service capacity |
| Redis memory/evictions/persistence failure | Protect queues; review noeviction/durability before resizing | Actual persistence/restart recovery and alert |
| Provider auth errors/ambiguous sends/webhook failures | Pause affected sending; preserve durable evidence | Safe credentials/health review, no blind replay |
| Import scanner/storage unavailable | Keep imports blocked/quarantined, restore dependency | ClamAV definitions/readiness and bucket authorization |
| Spend approaching cap | Notify owner and review service usage | Workspace limit scope, recipient and outage policy |

## Incident playbooks

- **Bad release:** pause rollout; inspect request IDs/redacted events. Roll code back only if
  compatible with current schema. Prefer a reviewed forward migration; never reverse SQL or
  erase production data automatically. Keep scheduler replacement singleton/stop-before-start.
- **DB outage:** stop destructive retries/admin changes, inspect provider/network/connections.
  Do not recreate an empty database. Resume after consistency checks or approved recovery.
- **Redis loss:** database remains authoritative; preserve retained jobs/outbox and inspect
  existing publication/completion state. Outbox PUBLISHED alone does not prove a lost job is
  safely replayable. Use approved operator tooling and provider reconciliation, not blind
  republishing of every message or deletion of retained failures.
- **Provider outage/timeout:** retain retry classification; ambiguous accepted/SENDING needs
  review, not a new idempotency key/resend. Separate internal failure from actual delivery.
- **Credential compromise:** restrict affected access, revoke/rotate through controlled
  procedures, preserve redacted evidence and audit, assess affected tenants and obligations.
- **Tenant-boundary/data leak:** contain access, preserve evidence, notify owner; do not
  investigate by exporting customer contacts/messages into chat or logs.

After each incident record timeline, scope, evidence, corrective task, owner signoff and
retest. No incident/alert integration is claimed active merely because this file exists.

References: [PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html),
[Railway backup/restore guide](https://docs.railway.com/guides/postgres-backups-restores).
