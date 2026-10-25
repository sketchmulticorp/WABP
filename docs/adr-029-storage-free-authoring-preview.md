# ADR-029 — Storage-free authoring preview

Approved 2026-10-21, CLAR-070 / TASK-082.4.6. Amends ADR-024/027.

Extend preview with existing tenant reports/bounded direct CSV, development WhatsApp
setup/explicit sync, templates/internal review and campaign drafts/internal review/report
reads. Reuse existing controllers/services/repositories. Optional Meta variables are validated;
missing credentials fail closed on explicit sync. No automatic external calls at startup.

Campaign services reject preflight and every lifecycle command except request-approval,
approve and reject before transaction/outbox writes. UI hides disabled controls. Full mode,
permissions, tenant isolation, approval versions and Super Admin privacy remain unchanged.
Imports, storage/scanner/email, Inbox, automation and webhooks remain unregistered.
No messaging service in preview; Worker/Scheduler loaders continue rejecting preview.

Full mode with dummy storage settings was rejected: it hides missing dependencies and allows
orphaned work. Adding workers belongs to a separate resource-cost review. This change adds no
schema/dependency/process; existing services still consume resources. Development-token setup
is not production Embedded Signup. Secrets remain server-only. Local isolated Docker tests
use mocked Meta; hosted deployment/migrations/spend and live calls are separate approvals.
Prior first-password release migration ordering remains required. Not launch approval.
