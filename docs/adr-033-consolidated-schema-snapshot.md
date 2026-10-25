# ADR-033 — Consolidated current schema and migration-first evolution

## Status: withdrawn before completion — CLAR-077

The owner clarified on2026-10-23 that all tables must stay in separate SQL files, exactly
as before, and explicitly rejected the combined file. All38 split sources and original
manifest/verifier/validation runner were restored; the combined SQL/reader were removed.
ADR-010/014 layout remains binding. Future structure changes still require new reviewed
migrations with matching per-table/Drizzle updates. No database or applied migration changed.
The original proposal below is retained as decision history, not implementation guidance.

Approved2026-10-23, CLAR-076 / TASK-088. Amends the file-layout portions of ADR-010/014.

## Decision

Maintain one readable current contract at `apps/api/database/schema/schema.sql`. Preserve
bootstrap,35 tables in existing manifest order, indexes/constraints, deferred foreign keys,
timestamp function/triggers and SQL comments, with explicit BEGIN/END section markers.
The manifest records one schemaFile and table inventory, not per-table filenames.

Future structure changes produce new reviewed versioned SQL and Drizzle metadata in
`apps/api/database/migrations/`; applied migration files/journal entries must not be rewritten.
Update typed Drizzle definitions, consolidated current snapshot, manifest and applicable
relationship/deletion docs together. Ordinary business-record creation is not a migration.
The existing migrator still applies only pending versioned migrations. Never execute this
current snapshot against an existing application database or replace migration history with it.

## Rationale and trade-offs

The owner prefers one end-to-end readable SQL file over38 split files. Labelled sections
retain per-table discoverability and structural verification without keeping duplicate SQL
copies. One larger file creates more potential merge conflicts; review bounded table-section
diffs and keep the manifest/Drizzle model synchronized. No runtime dependency or schema change.

## Verification and boundaries

Mechanical comparison must preserve all38 original SQL bodies, apart from line endings and
trailing whitespace. Static verification retains table inventory, scoped soft deletion,
tenant membership, exact-version approval, foreign-key and trigger checks against migration
artifacts. Both static verifier and disposable database runner use the same section reader.

This consolidation does not claim exhaustive semantic migration parity; retain existing
review/validation obligations. Database execution and automated test changes/runs require
the owner checkpoint choice. No live/local database, seed, migration or deployment is run
merely to reorganize files. Deleted split sources remain recoverable from Git history.
