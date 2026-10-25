# ADR-024: Explicit limited deployment profile

Accepted2026-10-19 under CLAR-065, TASK-082.4.2.

Problem: current full configuration/modules require storage, mail and provider setup even
for basic login/manual Contacts and Groups, while the owner wants a trial-only four-service
preview. Optional placeholders or UI-only hiding would leave unsafe/inoperative workflows.

Decision: APP_MODE defaults full. API preview validates only its real core dependencies and
registers the existing auth/session/Contacts/Groups services/repos/controllers plus health.
No provider, upload, campaign, inbox, automation, report/admin or webhook controllers/providers
are registered in preview; unregistered routes cannot dispatch their business workflows.
Full API and all worker loaders retain strict full configuration; workers reject preview.
The authenticated /me projection includes deployment_mode for UI composition. No browser
flag enables backend capabilities. Super Admin gets a limited notice, not tenant content.

Alternatives: pay/provision full infrastructure (owner declined), fake missing configuration
(unsafe), rewrite architecture/cohost services (unapproved), UI hiding alone (not enforcement).
Tradeoff: preview intentionally cannot exercise full MVP or platform/team administration.
Use seeded identities. Full mode remains the local/full application with unchanged RBAC,
approval, storage/scanning, rate limiting and cookie policy. No DB migration required.

Deployment/auth-domain topology, migrations/seed and security review remain separate gates.
Preview is neither production launch nor verified capacity. Full rollout must not simply
flip this flag without configuring/checking all full dependencies and workers.
