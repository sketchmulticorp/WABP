# Limited Railway preview — TASK-082.4.2 / CLAR-065

CLAR-080 / TASK-090 (2026-10-25): this existing hosted preview remains the `production`
environment on `main` and must stay unchanged while full-stack work proceeds in an isolated
Railway `development` environment sourced from `dev`. Promotion requires completed development
acceptance and explicit owner approval for a reviewed `dev` -> `main` merge. This note does not
create or reconfigure either environment.

Latest hosted migration checkpoint2026-10-23 (CLAR-074): owner-authorized runtime migrator
succeeded from10 to11 applied migrations; encrypted_token column/storage consistency
constraint verified through read-only metadata. No seed/reset. Supersedes older9-applied
checkpoint below; does not certify authenticated flows or enable production onboarding.

2026-10-23 / CLAR-073: current Web origin is https://web-production-92be3.up.railway.app.
Generating the missing Web domain repaired existing API public-origin references resolving
to bare https://; API redeploy6964ca35 is Active. Web/API/PG/Redis Online, login renders,
unauthenticated /api/v1/me denied. No authenticated UAT or dependency readiness certification.
API remains private. In the API service, each of WEB_PUBLIC_URL, API_PUBLIC_URL and
CORS_ALLOWED_ORIGINS can use `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`; the Web domain must
actually exist. Keep browser base `/api/v1` and server-only private proxy as documented below.

## Current amendment — CLAR-070 / ADR-029 (2026-10-21)

CLAR-071 additionally implements optional direct Embedded Signup connection in preview when
explicitly selected/configured. This needs no S3/SMTP/new process, but requires migration0010,
protected credential keyring, Meta app/configuration and separate real-provider acceptance.
Default is still development mode. SDK/code verification does not activate registration,
payments, webhooks, sending or Worker. No Railway settings/migration/deploy changed by coding.
See WHATSAPP_ONBOARDING.md and WHATSAPP_ONBOARDING_TEST_REPORT.md.

TASK-082.4.6 expands preview in source with existing tenant reports/bounded direct CSV,
development WhatsApp setup/local disconnect/explicit sync, templates and campaign drafts/
internal review/report reads. Supersedes older exclusions below for these capabilities.
No S3/SMTP/scanner settings/services needed. Optional META_* server settings enable explicit
sync; absent credentials fail safely without automatic provider calls. This is not production
Embedded Signup. Preflight/send/schedule/pause/resume/cancel fail
BACKGROUND_PROCESSING_UNAVAILABLE before queued writes. Imports/uploads, Inbox, automation,
webhooks and Worker/Scheduler stay off. Full mode unchanged. No additional Railway process
for this first step; existing services/provider costs still apply. No hosted changes made.
Prior first-password migration ordering still applies before a release.

Owner approved2026-10-19. This is an explicitly restricted test deployment, not full MVP or
customer launch. Architecture remains Next.js/NestJS/PostgreSQL/Redis on Railway.

CLAR-068 / ADR-027 extends the original profile with existing database-only administration.
No bucket is needed for business/user management, platform summaries/audit/manual payment
records or bounded platform CSV. Old statements excluding all administration are superseded.

## Exact scope

Run only Postgres, Redis, API and Web. API `APP_MODE=preview` opts into the profile.
Full/local default is `APP_MODE=full` or unset. Do not set NODE_ENV=development in Railway
to avoid validation: preview works with NODE_ENV=production and retains Secure/Strict cookies.

| Capability | Preview behavior |
| --- | --- |
| Login, refresh, logout, own session listing/revocation | Existing implementation and rate control |
| Tenant Admin/User manual Contacts, consent and Groups/membership | Existing services/repos and permission/tenant guards |
| Super Admin | Existing PlatformWorkspace: business/Admin creation/status, metadata/aggregates, usage/billing and redacted audit; never tenant content |
| Platform/Team administration | Existing platform plans/subscription/payment APIs and Tenant Admin same-tenant Team UI/API; current permissions/guards unchanged |
| Reporting/exports | Authorized tenant reports/bounded direct CSV and aggregate-only platform reports/CSV; no asynchronous export worker |
| Imports/files/scanner/storage | Not registered; no upload/presigned/file processing |
| WhatsApp setup and templates | Registered setup/sync/local disconnect, template authoring/internal review; optional configured direct signup. Explicit provider actions require valid settings and permissions; no automatic provider calls |
| Campaign authoring | Drafts/internal review/report reads; preflight and delivery lifecycle commands fail closed before queued writes |
| Inbox/replies and automation | Not registered; no enqueue/delivery workflow |
| Webhooks | Not registered; no ingestion accepted for later worker processing |
| Worker/Scheduler/replay runtime | Full-only loader rejects APP_MODE=preview before startup |

The API composes existing auth/session/bootstrap/Contacts/Groups, platform/Team, reporting,
WhatsApp and authoring controllers/providers in preview. Storage/import/Inbox/automation/
webhook modules and worker execution remain excluded. Campaign background commands are
explicitly rejected; other disabled feature routes are absent, not merely UI-hidden. Ordinary missing routes use existing
safe error envelopes; a static import path matching a Contacts UUID route may fail validation
instead of returning404, but cannot invoke imports. No dummy storage/email clients or fake
credentials. Full service config and feature registrations remain required in full mode.

Authenticated /me adds optional `deployment_mode: full|preview`. Browser uses this server
value, without a second build-time feature flag. Existing older full API responses omit it
and retain full UI behavior. Preview never mounts unsupported feature screens or tenant
content for platform users; it explains limits and keeps manual Contacts/Groups available to authorized
tenant identities. No role/permission grant is changed in the database or token.

## API variables

See infra/railway/preview.variables.example.json for a non-secret template. Actual required
values for hosting:

- APP_MODE=preview; NODE_ENV=production; PORT=8080.
- DATABASE_URL and REDIS_URL: private references from this exact environment.
- JWT_ACCESS_SECRET and REFRESH_TOKEN_PEPPER: independent random values, minimum32 characters.
- WEB_PUBLIC_URL/API_PUBLIC_URL: actual public HTTPS origins (no API prefix).
- CORS_ALLOWED_ORIGINS: exact Web HTTPS origin.
- Set DATABASE_POOL_MIN=0, DATABASE_POOL_MAX=5 and dedicated QUEUE_PREFIX=whatsapp-preview.
- Keep HTTP_TRUST_PROXY_HOPS fail-safe0 until actual ingress is verified; login client-IP
  rate keys still need deployment verification. Never blindly trust forwarded headers.

S3/SMTP/Meta/DATA_ENCRYPTION_KEY are not required for preview. DATA_ENCRYPTION_KEY, if supplied,
still follows its optional validation. Unused full-service inputs are not consumed by preview.
No Meta access token, bucket or scanner/mail service is needed. Do not discard or delete
already-staged resources/credentials automatically: review cloud changes separately.

Web variables for the approved no-custom-domain topology (CLAR-066 / ADR-025):

```env
NODE_ENV=production
PORT=8080
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_URL=http://api.railway.internal:8080/api/v1
```

Verify API's actual Railway private hostname and PORT; the above assumes the service is
named api and listens on8080. API_PROXY_URL is fixed non-secret routing configuration;
never include credentials or use NEXT_PUBLIC_ for it. Both URL variables must exist at build
and startup. Change either -> rebuild Web; restarting an old image is insufficient.
Dockerfile.web accepts the relative base only with the paired validated proxy configuration.
next.config.mjs ships with the production package. No APP_MODE/server credentials on Web.

API WEB_PUBLIC_URL, API_PUBLIC_URL and CORS_ALLOWED_ORIGINS all use the actual Web HTTPS
origin in this topology (no /api/v1 suffix). The logical browser API origin is Web; private
upstream is separately configured on Web. API does not need a generated public domain.
Do not put internal DNS or localhost in the public-origin settings. Keep NODE_ENV=production.

## Deploy order after validation checkpoint

CLAR-069 release additionally requires migration0009_initial_password_change BEFORE new API
traffic (approved API pre-deploy command). It adds a default-false existing-user flag; new
tenant accounts must change temporary password and sign in again. Do not push/auto-deploy
that release without coordinating migration; see INITIAL_PASSWORD_CHANGE.md. No hosted
migration or account reset is authorized by the implementation document alone.

CLAR-067 owner selected a first-Super-Admin-only protected POST instead of full demo-account
seed for initial hosted access. After migrations, follow FIRST_SUPER_ADMIN_BOOTSTRAP.md and
set API-only BOOTSTRAP_SECRET temporarily. No tenant accounts/plan are created by that route.
CLAR-068 enables existing DB-only platform/Team management; it does not add new Super Admin
management operations or grant this first account tenant Contacts/Groups access. Full seed below is an
alternative controlled workflow, not automatically authorized for this owner's chosen path.

1. Owner commits/pushes this implementation; old GitHub source cannot understand preview.
2. Use the existing root-context Dockerfile.api and Dockerfile.web; no custom build command.
3. API start node dist/main.js, health /health/ready; Web direct Next start per clean guide.
4. Review exact Railway pending changes: do not apply a stale bundle that also modifies PG,
   creates a bucket or activates a Worker. This implementation made no cloud changes.
5. Run approved migrations once with API-only pre-deploy node dist/database/migrate.js.
6. Fresh empty database: seed explicit three-role test identities with controlled one-time
   node dist/database/seed.js, following BOOTSTRAP_SEED.md; remove bootstrap password variables.
7. Verify health and actual routing, then login/role/manual-contact/group flows.

APP_MODE does not change migrations/seed; these commands keep database-only config loaders.
No remote database operation or identity reset is authorized by this document alone.

## Browser authentication gate

Existing Secure/SameSite=Strict refresh-cookie and exact origin checks remain unchanged.
CLAR-066 approves Next.js's built-in fixed-target /api/v1 rewrite on the Web HTTPS domain.
Only Web public exposure is necessary; API remains private and Railway probes /health/ready
directly. Browser keeps /api/v1/auth cookie path on Web; API still validates original Web
Origin and live sessions/permissions. No duplicated auth handler or business logic in Web.
No custom domain purchase, weakening cookies or new service. Local absolute API routing
remains default when API_PROXY_URL is unset. Private hostname/port/DNS, actual cookie rotation,
logout/reload, Origin denial, request forwarding and upstream failures need hosted validation.
This is not approval for large uploads/webhooks through Web or full-mode transport readiness.

## Restore full behavior

Local .env stays untouched. Leave APP_MODE unset/full and continue normal full local testing.
Hosted full mode needs all full storage/mail/Meta configuration, scanner, approved worker and
singleton scheduler setup. Configure and verify dependencies before changing mode; setting
APP_MODE=full alone does not make unavailable infrastructure exist. Keep preview queues/data
isolated from full/production deployments. Never launch a worker against unintended data.

## Verification boundary

### Current recorded boundary — 2026-10-23

CLAR-073/074 at the top of this guide supersede the old domain/migration checkpoint:
Web https://web-production-92be3.up.railway.app, private API, 11 applied migrations.
Startup, public login rendering and unauthenticated /me denial were checked; authenticated
role/session/UAT, dependency readiness and launch acceptance remain separately tracked.
Do not treat any dated snapshot as a live availability or account-verification guarantee.

### Historical evidence — 2026-10-19 (not current configuration)

Hosted database checkpoint2026-10-19: after owner approval, existing runtime migration
command completed successfully in API Railway console; read-only metadata count35 app tables
and9 applied migrations confirmed. No seed/reset/user creation/bootstrap POST. Owner first
Super Admin request and authenticated verification remain pending; automated tests deferred.
This supersedes the “no hosted migration” state of the earlier initial deployment below.

Hosted checkpoint2026-10-19: source541ef6d deployed; Railway Web/API/PG/Redis Online.
Historical preview URL (do not configure/reuse): https://web-production-f2eee.up.railway.app. Login page rendered and browser
GET /api/v1/me returns UNAUTHENTICATED through the same-origin/private proxy. This confirms
routing and unauthenticated denial only. No hosted migration/seed, login/rotation/roles or
automated acceptance suites executed. Database bootstrap requires separate owner approval;
do not assume local accounts/passwords exist in hosted PostgreSQL.

Static checks and builds are recorded in MEMORY/TASKS. Automated profile, HTTP enforcement,
tenancy and browser regression tests are pending owner checkpoint authorization. Full tests
from before this change do not certify it. Preview has no production approval, provider/send
validation or measured1,200-user capacity. Remaining security/backup/domain gates still apply.

2026-10-19 static checkpoint passed: API/Web production builds8/8 dependency tasks; affected
API/Web/Worker/shared lint/typecheck25/25 tasks; schema contract35 tables; changed-file format
and git diff checks. No test files or automated suites run in this implementation checkpoint.
