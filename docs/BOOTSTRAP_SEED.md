# Database Bootstrap Seed

## Purpose

CLAR-069: newly INSERTed tenant seed identities now require first-login password change.
Super Admin and existing seed identities remain unchanged. Replace temporary credentials,
then sign in with the replacement; see INITIAL_PASSWORD_CHANGE.md. No automatic seed/reset.

For owner-requested first-Super-Admin-only HTTP initialization, use
FIRST_SUPER_ADMIN_BOOTSTRAP.md (CLAR-067). Do not run the full seed below to satisfy that
request: it intentionally creates a tenant and three accounts. Both paths still require
migrations; HTTP bootstrap refuses when any users already exist. Full CLI behavior unchanged.

`TASK-022` provides one controlled bootstrap command for a newly migrated environment. It
creates the minimum identity, authorization, tenant, and plan records needed before the
authentication and administration APIs exist:

- one platform `SUPER_ADMIN` account with no tenant membership;
- one active business tenant;
- one `TENANT_ADMIN` and one `TENANT_USER`, each bound to that tenant through exactly one
  active membership;
- the stable system permission catalog and exact assignments for the three system roles;
- the non-commercial `MVP_INTERNAL` plan and one active tenant subscription;
- one redacted `SYSTEM_SEED_APPLIED` audit record.

This is an operational bootstrap command, not an API endpoint and not a replacement for
the later Super Admin and Tenant Admin account-management workflows.

## Run order

Run from the repository root after PostgreSQL is healthy and migrations are current:

```powershell
pnpm schema:migrate
pnpm schema:seed
```

The seed command reads the repository-root `.env` during local development. In Railway,
provide the same variables through the service environment and run the command as a
controlled one-time operation after migration.

## Required bootstrap variables

The command refuses to start unless all identity values are explicit:

- `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_DISPLAY_NAME`,
  `SEED_SUPER_ADMIN_PASSWORD`
- `SEED_TENANT_NAME`, `SEED_TENANT_SLUG`, `SEED_TENANT_TIMEZONE`,
  `SEED_TENANT_COUNTRY_CODE`
- `SEED_TENANT_ADMIN_EMAIL`, `SEED_TENANT_ADMIN_DISPLAY_NAME`,
  `SEED_TENANT_ADMIN_PASSWORD`
- `SEED_TENANT_USER_EMAIL`, `SEED_TENANT_USER_DISPLAY_NAME`,
  `SEED_TENANT_USER_PASSWORD`

Emails must be distinct. Country uses an uppercase ISO 3166-1 alpha-2 code, timezone uses
an IANA name, and slug uses lowercase letters, digits, and single hyphen separators.
Bootstrap passwords must be 12-128 characters and contain uppercase, lowercase, numeric,
and symbol characters. Plaintext passwords are never stored or printed; Node's built-in
Argon2id implementation stores a salted PHC-formatted hash. This requires Node.js 24.7 or
newer within the repository's approved Node 24 runtime line.

## Internal plan defaults

`MVP_INTERNAL` is a zero-price, non-commercial bootstrap plan. It does not decide launch
pricing, currency, payment behavior, or customer packages. Its limits can be changed
before the first successful seed through validated environment variables:

| Variable | Default |
|---|---:|
| `SEED_PLAN_MAX_USERS` | 100 |
| `SEED_PLAN_MAX_WHATSAPP_NUMBERS` | 10 |
| `SEED_PLAN_MAX_CONTACTS` | 100,000 |
| `SEED_PLAN_MONTHLY_MESSAGE_LIMIT` | 1,000,000 |
| `SEED_PLAN_MONTHLY_CAMPAIGN_LIMIT` | 10,000 |
| `SEED_PLAN_MAX_TEMPLATES` | 1,000 |
| `SEED_PLAN_STORAGE_GB` | 100 |
| `SEED_PLAN_AUTOMATION_ENABLED` | `true` |

Customer API and AI flags remain disabled because both are outside the MVP. If an existing
`MVP_INTERNAL` row differs from the configured contract, the command fails instead of
silently changing active entitlements.

## Permission baseline

- `SUPER_ADMIN` receives platform dashboard, account/user oversight, plan, billing,
  aggregate report, and redacted-audit permissions. It receives no contact, campaign,
  template, conversation, media, or tenant-content permissions.
- `TENANT_ADMIN` receives the complete own-tenant operational set, including team
  management, campaign/template approval and publishing, but no platform dashboard,
  cross-tenant suspension, or platform plan-management permission.
- `TENANT_USER` receives routine own-tenant Contact/Group, template drafting, campaign
  drafting/reporting, inbox, automation drafting/testing, media, report, and plan-view
  permissions. It does not receive user/role management, WhatsApp connection management,
  template sync/submission/approval, campaign approval/send/cancel, automation publish,
  billing, or platform permissions.

The exact stable keys and descriptions are maintained in
`apps/api/src/database/seed/seed.catalog.ts`. Later Admin-managed grants may narrow or
extend a User's effective access through the approved authorization workflow; they must
never bypass the campaign/template approval rules.

## Safety and reruns

- Password hashing occurs before opening the database transaction.
- One PostgreSQL transaction and transaction-scoped advisory lock serialize seed runs.
- Any conflict rolls back the complete run.
- Rerunning against the same approved data creates no duplicate users, memberships,
  roles, permissions, plan, subscription, or audit record.
- Existing password hashes, account status, and display names are preserved. The seed
  command never resets credentials or reactivates a locked/disabled account.
- An email, role, tenant, membership, plan, or subscription conflict stops the operation
  rather than taking ownership of unrelated data.
- Console failure output reports only a safe error type and optional PostgreSQL error code;
  it never prints submitted credentials.

After `TASK-023` provides credential-management flows, rotate every temporary bootstrap
password and remove bootstrap password values from long-lived environment configuration.

## Reset a forgotten local bootstrap password

The seed command intentionally preserves existing password hashes. Changing a
`SEED_*_PASSWORD` value and rerunning `pnpm schema:seed` therefore does not reset an
existing account. Until an approved password-reset workflow is available, the supported
development-only recovery procedure is to recreate the disposable local infrastructure
and seed it again.

This procedure permanently deletes all local PostgreSQL, Redis, MinIO, and Mailpit data.
It does not affect source code, staging, production, or any remote environment. Do not use
it when the local data must be retained.

1. Stop `pnpm dev` with `Ctrl+C` and confirm every Windows `Terminate batch job (Y/N)?`
   prompt with `Y` so no stale development process remains.
2. Generate three different passwords locally. Run this command once per account and save
   each result in an approved password manager:

   ```powershell
   node -e "console.log('Aa1!'+require('crypto').randomBytes(16).toString('hex'))"
   ```

3. Populate every required bootstrap identity in the repository-root `.env` file. Each
   key must occur exactly once:

   ```env
   SEED_SUPER_ADMIN_EMAIL=superadmin@example.test
   SEED_SUPER_ADMIN_DISPLAY_NAME=Local Super Admin
   SEED_SUPER_ADMIN_PASSWORD=<first-generated-password>

   SEED_TENANT_NAME=Local Test Business
   SEED_TENANT_SLUG=local-test-business
   SEED_TENANT_TIMEZONE=Asia/Kolkata
   SEED_TENANT_COUNTRY_CODE=IN

   SEED_TENANT_ADMIN_EMAIL=admin@example.test
   SEED_TENANT_ADMIN_DISPLAY_NAME=Local Tenant Admin
   SEED_TENANT_ADMIN_PASSWORD=<second-generated-password>

   SEED_TENANT_USER_EMAIL=user@example.test
   SEED_TENANT_USER_DISPLAY_NAME=Local Test User
   SEED_TENANT_USER_PASSWORD=<third-generated-password>
   ```

   Replace every angle-bracket placeholder with the generated value. Passwords must be
   distinct and must satisfy the documented length, uppercase, lowercase, number, and
   symbol requirements. Keep `.env` UTF-8 encoded; an empty, UTF-16, or incorrectly saved
   file cannot be loaded by Node's `--env-file` option.

4. Recreate the local services, migrate the empty database, and seed it:

   ```powershell
   pnpm infra:reset
   pnpm infra:up
   pnpm schema:migrate
   pnpm schema:seed
   ```

5. Start the application and sign in at `http://localhost:3000` with
   `admin@example.test` and the second generated password:

   ```powershell
   pnpm dev
   ```

6. After login is verified and the passwords are stored safely, clear the three
   `SEED_*_PASSWORD` values from `.env`. The database retains the Argon2id hashes, and API
   startup no longer validates unnecessary plaintext bootstrap passwords:

   ```env
   SEED_SUPER_ADMIN_PASSWORD=
   SEED_TENANT_ADMIN_PASSWORD=
   SEED_TENANT_USER_PASSWORD=
   ```

For API diagnostics, use `http://localhost:4000/health/live` and
`http://localhost:4000/health/ready`; the API does not provide a homepage at `/`.
