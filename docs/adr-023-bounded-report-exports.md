# ADR-023 — Bounded direct CSV exports

Status: Accepted by owner, CLAR-041, 2026-10-16.

The first MVP needs downloadable operational reports, not another background-job/storage
system. Existing read projections enforce tenant/platform boundaries. Implement authenticated
bounded CSV responses, fully serialized and audited before sending. Limits are 10,000 data
rows and 10 MiB per response; oversized reports fail explicitly. No files are stored and no
public or signed content links exist.

This narrows the planned report-export queue to future large exports; it does not implement
large work synchronously. Future async exports require separately approved job persistence,
private storage, expiry, live download authorization and operational budgets. Bounded exports
consume API memory and database work, not verified capacity; deployment acceptance must
measure this path and configure abuse controls before customer launch.

Use existing read permissions; campaign exports additionally require campaign.export and
recipient PII additionally requires contact.read/export. Platform cannot request campaign
exports. Audit preparation, not claimed delivery to disk. No schema/dependency replacement.
Automated acceptance remains deferred to phase closure.
