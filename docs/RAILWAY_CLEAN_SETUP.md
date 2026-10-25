# Railway clean setup: manual owner checklist

CLAR-066 / ADR-025: limited preview now uses Web same-origin /api/v1 rewrite to private API.
Follow RAILWAY_LIMITED_PREVIEW.md for paired Web build variables and exact public Web origins;
the full-mode separate-domain examples below are not the preview configuration.

CLAR-065 approved limited preview supersedes the full-infrastructure prerequisites below
for the four-service test deployment only. Follow RAILWAY_LIMITED_PREVIEW.md: no bucket,
SMTP/scanner/Meta or workers required; full MVP checklist below remains for full rollout.

Updated2026-10-19. Owner reports all previous Railway resources deleted. Old resource IDs,
URLs, variables, credentials and pending-change counts are historical; do not reuse them as
working configuration. Local source and database are not changed by this guide.

## 0. Scope and budget gate

Remain on the existing trial, use remaining credit only, no payment method/paid upgrade.
Deleting resources does not reset trial credit. Check actual balance and trial expiry first.
Use synthetic test data, never customers. Deleted cloud data needs its own backup to recover;
this guide cannot restore deleted cloud databases or objects.

Current trial docs state5 services per project. The approved full layout has Web, API,
Worker, Scheduler, PostgreSQL, Redis, ClamAV and Mailpit, plus a private bucket. Three apps
plus PostgreSQL/Redis already fill five service slots. Do not improvise co-hosting, multiple
projects, fake SMTP, disabled malware scanning or weakened cookies to bypass this constraint.
Full runtime layout needs an approved scoped alternative or sufficient hosting capacity.
Infrastructure-only preparation below can proceed; full launch is not promised on trial.

No new app dependencies or architecture changes are authorized by this document.

## 1. Prepare Git and the empty project

Owner commits/pushes the intended source first; local image verification included uncommitted
files and does not certify the current GitHub commit. Confirm these tracked files exist:
infra/railway/Dockerfile.web, Dockerfile.api and Dockerfile.worker.
Never commit .env or credentials. No auto commit/push performed by agent.

Create an empty project, use an explicitly named test/staging environment and one region.
Do not connect the repository/app services yet. Do not import local docker-compose wholesale:
it contains development defaults and exceeds the trial's full-layout capacity.

## 2. Provision infrastructure before apps

1. Add private PostgreSQL; apply only its creation changes and wait for Online.
2. Add private Redis; apply only its creation changes and wait for Online.
3. Verify Redis uses persistent storage and noeviction for BullMQ; do not erase data to change
   its settings. Wait for any required replacement to complete before app activation.
4. Add an access-controlled Railway Bucket if available without upgrade; apply bucket creation
   now, while no app changes are staged. Wait until Credentials is available.
5. Keep all database/Redis/scanner/mail service ingress private. Review any template-created
   public TCP proxy; do not expose it for this guide. No database public connection URL needed.

Choose private credentials/reference values only in Railway. Bucket S3 endpoint is issued
HTTPS, not a fabricated railway.internal address. Bucket display label may differ from its
actual S3 bucket name. Some limited trials cannot create buckets: stop if blocked, don't upgrade.

Mail/scanner/scheduler require the scope/capacity gate in section0 before provisioning.
For the prepared full deployment see RAILWAY_STAGING_GUIDE.md; no real SMTP provider was selected.

## 3. Set up API service, not automatic app-only monorepo builds

Once prerequisite layout is resolved, connect the intended GitHub repository/commit as API.
If detection creates unwanted additional app services, review before applying them; don't
delete user data/services casually. Initially disable automatic deploys for controlled setup.

All app build contexts are repository root / (or blank meaning root), NEVER apps/api etc.
Builder: Dockerfile. Path: infra/railway/Dockerfile.api. Clear custom Build Command.
Start: node dist/main.js. One replica, restart ON_FAILURE with5 retries, health /health/ready.
Do not deploy until required variables exist. Dockerfile owns dependency-ordered compilation.

## 4. Server variables: API, later Worker/Scheduler

Use Railway service reference picker for private DB/Redis, not copied strings in chat/Git.
These placeholders are explanations, NOT values to paste unchanged.

| Name | Actual value/source |
| --- | --- |
| NODE_ENV | production, including test hosting, to retain secure cookies |
| LOG_LEVEL | info |
| PORT | 8080 per HTTP service; match its domain target and health port |
| DATABASE_URL | PostgreSQL private DATABASE_URL reference |
| REDIS_URL | Redis private REDIS_URL reference |
| DATABASE_POOL_MIN | 0 |
| DATABASE_POOL_MAX | 5 initially per pool, subject to DB connection budget |
| QUEUE_PREFIX | whatsapp-railway-test, same across this environment's servers |
| WEB_PUBLIC_URL | Actual HTTPS Web origin, no path |
| API_PUBLIC_URL | Actual HTTPS API origin, no /api/v1 suffix |
| CORS_ALLOWED_ORIGINS | Exact Web HTTPS origin, no wildcard |
| HTTP_TRUST_PROXY_HOPS | Keep fail-safe0 until actual ingress topology is verified; not certified for login |
| JWT_ACCESS_SECRET | Fresh random secret, at least32 characters |
| REFRESH_TOKEN_PEPPER | A different fresh random secret, at least32 characters |
| DATA_ENCRYPTION_KEY | Third distinct secret, at least32 characters; retain securely |
| META_APP_ID | Owner-approved existing development Meta app ID (CLAR-061) |
| META_APP_SECRET | Corresponding development app secret |
| META_GRAPH_API_VERSION | Actual supported version shown by Meta, not guessed |
| META_WEBHOOK_VERIFY_TOKEN | Owner's random verification token |
| S3_ENDPOINT | Issued HTTPS bucket base endpoint |
| S3_REGION | Issued bucket region |
| S3_BUCKET | Actual credential-page bucket name |
| S3_ACCESS_KEY_ID | Issued access key, server only |
| S3_SECRET_ACCESS_KEY | Issued secret, server only |
| S3_FORCE_PATH_STYLE | false for the prepared Railway bucket setup |
| CLAMAV_HOST | Actual reachable private scanner host, not localhost |
| CLAMAV_PORT | 3310 for prepared scanner |
| CLAMAV_TIMEOUT_MS | 120000 |
| SMTP_HOST | Actual approved reachable SMTP/sink host; currently unresolved on trial |
| SMTP_PORT | Actual SMTP service port;1025 only for prepared Mailpit |
| SMTP_SECURE | Actual provider transport setting;false for private Mailpit |
| SMTP_FROM | Explicit valid sender address appropriate to approved mail setup |

Generate each of three application secrets independently on your own terminal:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use the same corresponding server secret across API/Worker/Scheduler, but different values
for each secret's purpose. Store in password manager and Railway only. Never show values in
screenshots/chat; never put secrets on Web. Do not reuse development/local DB passwords.
Leave META_DEVELOPMENT_ACCESS_TOKEN unset until exact provider testing is authorized.

SMTP/S3 are required by the current config validator even if no email/upload is used yet.
Do not satisfy validation with invented hosts, dummy keys or local Mailpit/MinIO addresses.

## 5. Domains and Web

Generate public domains only for API/Web, target8080 after PORT=8080 is set.
Record newly issued origins; deleted domains from previous setup are not assumed valid.
Public exposure needs explicit owner approval for the newly created services.

Current refresh cookies use Secure and SameSite=Strict in production. Two Railway-provided
subdomains are not evidence of compatible same-site authentication. Before login approval,
use owner-owned same-site HTTPS app/API subdomains or approve a reviewed same-origin proxy
solution. No cookie weakening, automatic new domain purchase or proxy code change here.

Web uses root context, Dockerfile builder, infra/railway/Dockerfile.web, empty Build Command.
Start: node node_modules/next/dist/bin/next start --hostname 0.0.0.0
Health: /. One replica. Variables ONLY:

| Name | Value |
| --- | --- |
| NODE_ENV | production |
| PORT | 8080 |
| NEXT_PUBLIC_API_URL | Actual approved public API origin plus /api/v1 |

NEXT_PUBLIC_API_URL is embedded during build; rebuild Web when it changes. Never use a
private-network API address or localhost in the browser. Never put DB/Meta/bucket keys on Web.

## 6. Controlled first API release and bootstrap

After all required config/infrastructure/domain gates, apply API settings and inspect build
then runtime logs. Do not retry repeated failing deployments without reading the first error.
For an owner-approved fresh isolated database, API-only pre-deploy command (serialized):

```text
node dist/database/migrate.js
```

No migration on Worker/Scheduler startup, no drizzle push, reset or schema recreation.
First accounts require explicit one-time seed variables. See BOOTSTRAP_SEED.md for all names,
password constraints and conflict rules. Run from deployed API image/workdir, on Railway's
private network, using a controlled maintenance operation:

```text
node dist/database/seed.js
```

This is not a permanently running start command or repeated pre-deploy seed. Do not rely on
local railway run resolving private hosts. If interactive console unavailable, choose/approve
a supported one-off operation before proceeding. Remove temporary SEED_* passwords afterward.
Do not overwrite the real local .env with Railway DB credentials for bootstrap convenience.

## 7. Background processes (only after layout/config/migrations approved)

Worker: root context, Dockerfile.worker, no custom build, node dist/consumer.js, private,
health /health/ready, one replica. It does not activate the separate campaign scheduler.
Scheduler: same image, node dist/scheduler.js, private, exactly one process, no consumer.
Stop old scheduler before replacement to avoid timer overlap. Do not run combined local
main.js alongside deployment consumer/scheduler. No activation until intended queues/data
and exact environment are approved. Lack of scheduler means scheduled campaigns unverified.

## 8. Verification and stopping points

- Inspect source commit, correct Dockerfile, completed build and runtime separately.
- /health/live and /health/ready return expected safe status, not a promise of full functionality.
- Confirm expected migrations and one-time identities without logging passwords.
- Owner tests all roles, login/refresh/logout and tenant boundaries on approved domains.
- Provider sync/webhook/sends require separate exact test-asset/recipient authorization.
- Imports require working scanning/storage; never mark functional while scanner missing.
- Review open vulnerability findings, backup restore/monitoring and trial credit before launch.
- This is test deployment, not customer launch approval or1,200-user capacity evidence.

## References

- https://docs.railway.com/pricing/free-trial
- https://docs.railway.com/storage-buckets/billing
- https://docs.railway.com/builds/dockerfiles
- https://docs.railway.com/variables
- RAILWAY_STAGING_GUIDE.md; infra/railway/staging.variables.example.json

Railway current pricing docs say build compute/image exports/storage are not charged; running
workloads, volumes and bucket usage still consume credit. Earlier generic warnings about
deployment attempts consuming credit do not establish a build-compute charge. No duration
or total runtime cost is guaranteed here.
