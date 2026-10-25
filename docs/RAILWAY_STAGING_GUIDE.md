# Railway development/staging preparation — TASK-082 / TASK-090

Status: repository preparation only, CLAR-042. No paid resources, Railway project, secrets,
deployment, migrations, seed, provider callback or live send were created/run by this task.
TASK-082 stays open until the owner configures and verifies the actual staging environment.
Budget/domain/account choices are pending; placeholder values are not working configuration.

## Approved branch and environment workflow — CLAR-080

Use one Railway Pro project with two isolated persistent environments:

| Railway environment | Git branch | Purpose |
| --- | --- | --- |
| `development` | `dev` | Current implementation, full-stack integration, Meta test-asset E2E and owner UAT |
| `production` | `main` | Existing hosted preview now; later customer production only after explicit owner promotion approval |

Development is the only environment authorized for the next full deployment work. It must run
Web, API, Worker, exactly one Scheduler, PostgreSQL, Redis, Bucket, private ClamAV and an approved
test SMTP sink with development-only domains, keys, credentials and data. A push to `dev` must
never deploy `main` or mutate the production environment. A push to `main` must not occur as part
of development setup.

Complete the agreed implementation and full E2E/UAT gates in `development` before proposing a
reviewed `dev` -> `main` merge. Promotion requires an explicit owner decision and a separate
production change plan covering migrations, secrets, Meta app/assets/webhook destinations,
backups, monitoring, cost controls and post-deploy smoke checks. Promote the tested code rather
than maintaining a divergent `PROD` branch. Environment-specific configuration remains in
Railway variables, not source branches.

The two environments must not share PostgreSQL data, Redis, queue prefixes, buckets, encryption
or signing keys, Meta credentials/test assets, webhook tokens or SMTP credentials. Never copy
production customer data into development. Recording this workflow does not create branches,
environments, paid resources or deployments.

## Prepared files and boundaries

- `infra/railway/Dockerfile.web`, `.api`, `.worker`: root-context workspace builds. Worker
  image also runs the scheduler using a distinct start command. Non-root runtime, Node 24,
  pnpm 11.25.0 frozen install, dependency-ordered Turbo builds. Docker default entry points
  use Node directly for signals; no dev/watch server or automatic migration on startup.
- `.dockerignore`: allowlisted root build inputs, application/package sources and deployment
  files; excludes local `.env*`, dependencies, Git, caches, logs, uploads and generated output.
  Never put secrets anywhere under application sources; inspect image/context before upload.
- `staging.services.json`: explicit **manual settings manifest**, not a Railway native config
  or executable provisioning program. `staging.variables.example.json`: documentation-only
  placeholders to map in the dashboard; never replace them with real values in Git.
- Under CLAR-045, runtime stages copy only `pnpm deploy --prod --legacy` artifacts.
  Package allowlists retain compiled API/worker files, API migration SQL, and web `.next`
  output; production workspace dependencies keep their package exports. Build tools stay
  in the build stage. Runtime stages apply available Debian security updates without
  changing the Node 24/bookworm baseline. Record resolved image digests and scan every
  release under TASK-084; lean packaging does not imply a clean vulnerability scan.
  Private runtime secrets are not Docker ARGs/ENV/COPY inputs or build output.

Railway's legacy config-as-code reference currently marks railway.toml/json deprecated;
dashboard settings avoid adding a new IaC SDK/dependency for this manual staging task.
No automatic GitHub deploy or CI is enabled. The owner still commits/pushes code manually.

## 1. Supply owner choices before remote changes

Record non-secret answers in the deployment record, not guessed values:

1. Railway workspace/project and permission to create paid staging resources.
2. Exact `dev` source commit for development, region and service names. `main` remains the
   production source and is not changed without separate promotion approval.
3. Same-site HTTPS domains, e.g. app.staging.your-domain and api.staging.your-domain.
4. Monthly budget, usage-alert amount/recipient, hard-limit amount and accepted outage impact.
5. Permission for isolated migration/seed/runtime checks; separate approval for Meta test sends.

Use the isolated `development` environment described above (older sections may call this
staging). PostgreSQL, Redis, bucket, encryption/signing keys, Meta app/assets and credentials
must not be production resources. Do not clone production data or secrets into development.
Disable automatic PR preview clones until reviewed; branch deployment is limited to `dev`.
Plan choice and pricing remain owner decisions; old planning estimates are not current quotes.

## 2. Private dependencies

Within the approved staging project/environment create PostgreSQL, Redis and a private
Railway Bucket. Do not enable public database/Redis TCP proxies for this guide. Inspect actual
generated variable references: DATABASE_URL/REDIS_URL must resolve to private service hosts,
not localhost, a public proxy or a production environment. Configure Redis persistence and
noeviction for BullMQ; verify selected template settings rather than assuming defaults.

Uploads also need the existing ClamAV scanner. Deploy the same pinned image currently used
by compose (`clamav/clamav:1.5.4-debian`) as a private service with TCP 3310 available only
inside the environment. Keep definitions up to date and allow its startup/update time and
memory in the budget; never bypass scanning if it is unavailable. No public ClamAV domain.

Use the existing Mailpit image (`axllent/mailpit:v1.31.4`) as a private staging SMTP sink on
1025, no public SMTP/UI domain and no forwarding/real-customer email configuration. Do not
expose captured mail. These are existing development dependencies, not a new email workflow.
Choose persistent volumes/retention deliberately when provisioning; backup/restore is TASK-083.

Bucket access uses its issued HTTPS S3 **base** endpoint/region/access keys and virtual-hosted
style (`S3_FORCE_PATH_STYLE=false` unless the issued configuration explicitly says otherwise).
A private bucket is access-controlled object storage; it is not a made-up `.railway.internal`
S3 service. Do not enable public object URLs. Browser upload/download authorization remains
the existing tenant-scoped application path. Bucket credentials never go to `web`.

## 3. Application service settings

All application services use the **repository root** as build context, not apps/api or
apps/worker, because workspace packages and lockfile are shared. Set RAILWAY_DOCKERFILE_PATH
per the checked-in manifest. Leave automatic build command detection out of the way: the
Dockerfile runs the build. Service start commands run relative to each image's WORKDIR:

| Service | Image work directory | Start command | Health path | Exposure |
| --- | --- | --- | --- | --- |
| web | /app/apps/web | node node_modules/next/dist/bin/next start --hostname 0.0.0.0 | / | Public HTTPS |
| api | /app/apps/api | node dist/main.js | /health/ready | Public HTTPS for browser + approved webhooks |
| worker | /app/apps/worker | node dist/consumer.js | /health/ready | No public domain/TCP proxy |
| scheduler | /app/apps/worker | node dist/scheduler.js | /health/ready | No public domain/TCP proxy |

Set initial replicas to one for each. Scheduler is **exactly one**; one configured replica
does not prevent old/new processes overlapping during health-gated replacement. For manual
staging releases stop the old scheduler, confirm its drain/exit, then start its replacement,
with the owner accepting the temporary scheduling pause. Do not assume an overlap setting
alone prevents new-process bootstrap. Verify actual replacement behavior; campaign row locks/
idempotency remain required. No new leader-election mechanism is introduced. Do not run the
combined local main.js as well.

Configure ON_FAILURE restart, five retries and a 300-second deployment-health timeout. Keep
sleep/serverless mode disabled for durable background work. Railway injects PORT; all four
images honor it. Worker/scheduler health listener binds 0.0.0.0 and is for the platform's
health probe, not a public application API or promised IPv6-only peer endpoint. Web bypasses
the local start script's fixed 3000 port without changing local development behavior.

API health retains existing `/health/live` and `/health/ready`. Worker/scheduler expose only
GET on those paths through a transport-only health controller, service and PostgreSQL probe
repository. Ready checks SELECT 1 and Redis PING using the existing queue adapter; probes
are coalesced and bounded to five seconds, SQL execution to three seconds. Worker pool
connection acquisition is bounded to five seconds. Scheduler has one extra max-1 health
database pool and one readiness-only Redis queue connection, closed on shutdown.
Responses contain only service/status, no tenant data, credentials, URLs or raw errors.

Readiness is infrastructure connectivity, not proof of migrations, successful delivery,
consumer progress, S3/scanner health or a healthy automation flow. Health probes make no jobs
or sends. Railway deployment health is not continuous monitoring; TASK-083 must add that.

## 4. Process ownership and graceful stop

`apps/worker/src/main.ts` remains the combined local worker with its campaign scheduler.
Deployment `consumer.ts` disables only that timer; webhook/import/message/preflight/automation
consumers and their existing idempotent outbox relays, automation recovery and import retention
remain unchanged. New `scheduler.ts` loads only the existing campaign runtime/timer plus
health/logging/lifecycle plumbing; it does not start consumers, provider delivery, imports,
retention or automation transport. Due campaigns may create common outbound state/outbox work;
the consumer handles delivery. This is not a second campaign-execution implementation.

The timer stops and awaits its in-flight tick in beforeApplicationShutdown, before database
shutdown hooks. Runtime module owns its ordinary application database pool; scheduler's
readiness pool is separate. Do not claim all worker drains/kill scenarios are verified by
this change. Provider SENDING ambiguity/recovery policies remain unchanged.

## 5. Variables and browser authentication

Copy **names and non-secret intentions**, not local `.env` contents, using the example JSON.
Set actual secrets only in Railway variables/approved secret storage. Backend config is
shared/strict, so api/worker/scheduler all require DATABASE_URL, REDIS_URL, authentication
secrets, storage values, SMTP settings and the production-required Meta configuration fields.
Use NODE_ENV=production on staging to retain Secure refresh cookies. Do not switch to
development or invent Meta values just to pass validation. The existing development app can
be configured only if explicitly isolated/approved for staging; its credentials stay secret.
Do not set development access token/add provider records/subscribe callback URLs yet.

Only web gets NEXT_PUBLIC_API_URL (public HTTPS API origin **plus /api/v1**), NODE_ENV and
its Dockerfile selector; no database/signing/Meta/bucket secrets. The Dockerfile requires
this URL at build time, Turbo includes it in the build cache key, and Next embeds it into
browser output. Changing the API domain requires a web rebuild; runtime-only changes do not
rewrite the bundle. No private-network hostname can be reached from a user's browser.

Set WEB_PUBLIC_URL and CORS_ALLOWED_ORIGINS to the exact public web origin (no wildcard),
API_PUBLIC_URL to the API origin without /api/v1. Keep HTTPS web/API under one registrable
domain for the existing SameSite=Strict refresh cookie. Do not weaken cookie policy to make
unrelated hostnames work. Domain/DNS is pending, so actual browser authentication is unverified.
Cookie handling remains host-only with the existing /api/v1/auth path; no parent-domain cookie.

HTTP_TRUST_PROXY_HOPS=0 is a fail-safe placeholder, **not** a verified Railway ingress value.
Before opening login traffic, inspect the actual trusted hop topology and approve/configure
the exact value; validate real client IP/rate-limit keys. Never blindly trust arbitrary
forwarded headers or assume all deployments use one proxy.

Use staging-specific queue prefix; keep separate Redis regardless. Pool defaults proposed
in the example are min 0 / max 5 per pool, not a capacity guarantee. Budget the API pool,
worker SQL pool, imported API runtime pool(s), scheduler runtime pool and max-1 health pool,
plus migration/seed/admin headroom against actual PostgreSQL max_connections. Verify actual
Nest module pool sharing; do not infer a connection count from service replicas alone.

## 6. Controlled migration and bootstrap — not executed

Only after owner approval, use the API image's pre-deploy command (from /app/apps/api):

```text
node dist/database/migrate.js
```

This image intentionally does not install global pnpm in runtime; use the compiled Node
entry point, not an unavailable pnpm command. Pre-deploy must run inside Railway's private
network with the correct isolated database credentials. Do not run `railway run` locally
against a private hostname and assume a tunnel exists. Configure the migration on **API
only**, not all replicas/services. Wait for migration success before activating consumers
or scheduler; their own deployment does not implicitly wait for API pre-deploy completion.

The existing migration command uses committed SQL and the migration ledger; operators must
serialize release migrations rather than assume an application-owned advisory lock exists;
never `drizzle-kit push`, duplicate schema creation or dropping a database. Inspect migration
history and use backup/restore/change-control before nonempty environments. Runtime never
migrates automatically; failure blocks release, not silently ignored health warnings.

For a newly migrated isolated environment only, supply explicit temporary SEED_* values via
the owner's approved one-time operation and run (same image/work directory):

```text
node dist/database/seed.js
```

Reuse BOOTSTRAP_SEED.md and existing conflict-safe seed. Never use production identities,
defaults or real customer data. Share temporary passwords outside the app securely; remove
seed password variables from steady-state services afterwards. Seed is not a pre-deploy step.
No auto migration/seed or fixture export has run during repository preparation.

## 7. Cost controls — owner must choose values

Before provisioning, open the Railway workspace Usage/limits settings. Confirm the current
scope (workspace vs service/project and compute vs other spend) and enter owner-approved
email threshold and hard limit; verify the alert recipient can receive it. A hard limit may
stop all affected workloads, not just staging. Do not set workspace-wide limits on behalf
of other projects without authorization. Record limits in the private operations record,
not provider credentials. Service CPU/memory limits and replica counts supplement, not
replace, billing controls; scanner/volumes/storage/egress/builds also need budgeting.

Use one development environment, no automatic costly PR preview clones and no extra replicas.
Monitor real usage after deployment before forecasting or resizing. Do not infer a monthly
quote or verified 1,200-user capacity from repository configuration. Alert amount/recipient,
monthly cap and selected Railway plan remain unresolved and TASK-082 remains open.

## 8. Activation/evidence checklist

- [ ] Owner approved project/region/paid resources, exact commit and same-site domains.
- [ ] `development` deploys only `dev`; `production` deploys only `main`; no `PROD` branch.
- [ ] Production remains unchanged until explicit owner promotion approval.
- [ ] Cost alert/limit scope/recipient/threshold and outage policy recorded and verified.
- [ ] Separate private PostgreSQL/Redis/bucket/scanner/mail sink; no production data/secrets.
- [ ] Images built/scanned and build context reviewed for secret exclusion; record digests.
- [ ] Correct commands/WORKDIR/PORT, replicas/restarts/no sleeping/no duplicate scheduler.
- [ ] Only web/API have public ingress; trusted proxy and HTTPS/CORS/cookie flow verified.
- [ ] Isolated migrations and approved seed finished before background activation.
- [ ] Authorized runtime health/dependency-loss/restart/scheduler ownership checks recorded.
- [ ] Ask owner at phase checkpoint before tests; T082-01–08 are pending, not passed.
- [ ] No live Meta actions without separate exact test-asset/recipient approval (TASK-086).
- [ ] Backup/restore/continuous monitoring is TASK-083; security and launch gates remain open.

Do not mark TASK-082 complete merely because repository static checks pass. Record actual
project/domain/service IDs, deployed commit, private-network/health/cost evidence and owner
signoff without secrets. No Git commit, cloud login or Railway token was requested here.

## References checked during preparation

- [Railway Dockerfile path/build arguments](https://docs.railway.com/builds/dockerfiles)
- [Shared monorepo context](https://docs.railway.com/deployments/monorepo)
- [Deployment health checks and PORT](https://docs.railway.com/deployments/healthchecks)
- [Private networking](https://docs.railway.com/networking/private-networking)
- [Private S3 storage buckets](https://docs.railway.com/storage-buckets)
- [Cost controls and outage risk](https://docs.railway.com/pricing/cost-control)
- [Legacy config-as-code status](https://docs.railway.com/config-as-code/reference)

Platform behavior/settings can change. Recheck the current docs/dashboard before applying;
this guide is not evidence that remote controls have been configured.
