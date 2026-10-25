# Owner local manual walkthrough

> Historical local checkpoint (2026-10-17), not today's process/database status.
> The counts, credentials checks and running-process statements below describe that day only.
> Use LOCAL_DEVELOPMENT.md for startup, CURRENT_STATE.md for the latest recorded hosted snapshot,
> and inspect local migration history before local testing. Do not infer local counts from Railway.

Date: 2026-10-17. No friends, public tunnel, Railway or customer launch at this stage.

## Startup verified

- Docker PostgreSQL, Redis, MinIO, ClamAV and Mailpit healthy.
- Existing database: 35 tables and 9 of 9 migrations applied. No seed/reset/migration run.
- One active Super Admin, Tenant Admin and Tenant User. Configured bootstrap emails match
  roles and configured local passwords verify against existing hashes; none printed/reset.
- Web `http://localhost:3000` returned 200. Use this hostname, not `127.0.0.1`, because API
  CORS currently permits `http://localhost:3000`.
- API `http://localhost:4000/health/live` and `/health/ready` returned 200, database/Redis up.
- Worker compiled and logged `worker_initialized` after scoped-logger startup fix.
- No campaigns/messages present at preflight. Meta development token is absent; real
  WhatsApp connection/sync/delivery is not verified or authorized by this walkthrough.

Processes are running in the agent's terminal sessions. If stopped, use separate terminals
from the project root for API, web and worker; don't start duplicate processes:

```powershell
pnpm --filter @whatsapp-platform/api dev
pnpm --filter @whatsapp-platform/web exec next dev --hostname 127.0.0.1 --port 3000
pnpm --filter @whatsapp-platform/worker dev
```

Review provider configuration/pending work before restarting a worker later. Its normal
entry point enables delivery and scheduling; absence of a token is not a permanent send
disable switch. Do not configure credentials or queue external work without approval.

## Sign in

Open `http://localhost:3000`. Read the following values privately from the existing root
`.env` file; do not paste them into chat, screenshots or this document:

| Role | Email key | Password key |
| --- | --- | --- |
| Super Admin | SEED_SUPER_ADMIN_EMAIL | SEED_SUPER_ADMIN_PASSWORD |
| Business Admin | SEED_TENANT_ADMIN_EMAIL | SEED_TENANT_ADMIN_PASSWORD |
| Business User | SEED_TENANT_USER_EMAIL | SEED_TENANT_USER_PASSWORD |

Sign out before changing roles; don't use simultaneous tabs to judge independent role
sessions because cookies are shared. Use separate browser profiles if comparing side by side.

## Suggested walkthrough

All owner checks below remain NOT RUN until the owner reports actual results.

1. Super Admin: inspect platform summary, business metadata, billing and redacted audit;
   customer Contacts/Inbox must not be available.
2. Tenant Admin: inspect overview, usage, billing/audit, Contacts, Groups and imports.
   Use synthetic Contacts; verify add/edit/soft-delete and a small synthetic import.
3. Tenant User: repeat permitted Contact/Group operations and inspect campaign drafts,
   Inbox and automation screens. Check privileged controls are unavailable.
4. Inspect campaign, Inbox and automation empty/error states. With no WhatsApp account,
   template or message fixtures, full approval/delivery/conversation journeys are not testable.
   Do not fake real verification by bypassing these prerequisites.
5. Record each issue with role, screen, steps, expected behavior and actual behavior. Omit
   secrets and private data. Number/approve material fixes through TASK-086 before coding.

## Confirmed UI limits, not startup errors

Current tenant navigation has no dedicated team-management, WhatsApp-setup or template-
management screens. Platform navigation has overview/billing and audit, not full account-
administration forms. Backend capabilities do not imply these browser workflows exist.
TASK-086.6 tracks assessing the minimum missing UI and obtaining approval. Therefore this
is a walkthrough of what is built, not complete MVP/user-journey certification.
