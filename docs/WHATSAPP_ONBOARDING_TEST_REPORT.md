# WhatsApp onboarding — combined local checkpoint

2026-10-21, CLAR-071 / TASK-032.1/032.2. Owner approved direct Tech Provider connection,
encrypted PostgreSQL credentials and combined foundation/secure signup testing.

## Implemented and checked

One configurable development/embedded connection flow reuses existing account records.
Embedded attempts are10-minute, session/tenant/config bound and atomically consumed in Redis.
Strict completion accepts code and asset hints only. Fixed-host provider adapter verifies token
validity/app/scopes/expiry/WABA target and phone membership outside the DB transaction.
Tenant-locked account upsert, encrypted credential and audit commit together; same-tenant
reconnect retains IDs and foreign reassignment fails. No registration, webhook subscription,
payment mutation, credit sharing or send is performed. SDK loaded only after explicit intent.

## Results

| Suite | Result | What it verifies |
| --- | --- | --- |
| Config/provider/signup/template/account focused tests |35/35 | Env/default/keys/parity, crypto nonce/roundtrip/tamper/AAD/old keys, resolver binding, strict DTO, provider app/scope/asset/expiry/errors and previous provider/account/template regressions |
| Auth/password/me plus API smoke |31/31 | Existing auth/gate/cookie/session behavior and actual full API health/error/log regression against isolated services |
| Disposable PostgreSQL/Redis integration |13/13 (12 scenarios plus parent) |11 migrations/35 tables, existing password/migration/role tests, storage-free preview and actual signup persistence/security scenario |
| Chromium mocked API/Meta SDK |19/19 | Development/embedded/not-configured UI, explicit SDK launch, ignored foreign-origin event, one completion despite duplicate event, password gate, existing setup/template/role/error/responsive regressions |

New real signup scenario checks unauthorized/ordinary User denial, manual mapping rejection in
embedded mode, unknown-field denial, wrong actor/session binding, concurrent duplicate completion
(one201/one409, one provider call), replay, TTL and forced expiry, token absent from ciphertext,
shared decryption, foreign reference rejection, stable reconnect, actual audit-trigger rollback,
failed-attempt replay denial, foreign asset conflict, storage constraint, revoked credential,
exact successful audit count and no outbox work. API uses mocked adapter, not real Meta.
Adapter itself uses mocked fixed-host fetch unit cases; browser mock and DB integration are
separate checks, not one live-provider browser-to-DB end-to-end execution.

Config/contracts/provider/API/observability/Web builds, registered config/provider/API/Web/
Worker lint, Worker typecheck, schema verifier and Drizzle metadata checks pass. No capacity
or customer-launch certification. Source formatting/diff checked separately.

## Isolation/reproduction

Build config/contracts/provider before API; build Web for browser tests. Integration command:
`node --test apps/api/dist/auth/password-change/password-change.integration.test.js` with
PASSWORD_TEST_DATABASE_URL set to its exact guarded disposable URL. Requires a fresh PG
fixture on loopback55439 and Redis56439; pg_isready first. No .env fallback permitted.
Smoke now supports guarded APP_SMOKE_DATABASE_URL/APP_SMOKE_REDIS_URL for the same fixtures,
and derives its compiled entry point absolutely. Normal legacy defaults are unchanged; always
set isolated overrides for this checkpoint, never point it at application data.
Browser: playwright test --config playwright.password-change.config.ts (includes setup suite).
Focused suites run directly with node --test against compiled files; npm fallback avoids pnpm
store lock issues. Tests use synthetic tokens/keys and no secrets or provider requests.

Early integration fixture spread extra start-response fields into strict completion and got
400 correctly; fixture corrected to the browser's exact five fields. Initial API smoke launch
from repository root failed because it assumed package cwd; TASK-032.2.2 fixed absolute entry
and explicit isolated overrides, then31/31 rerun passed. No main DB accessed by these failures.
Disposable containers/data removed at closure; normal Docker services remain untouched.

## Remaining limits and launch gates

- Real Meta SDK/domain/app-role/approval and business-token behavior is unverified. No live
  customer onboarding, credential, Meta billing or registration action was authorized/executed.
- Phone membership currently verifies the first bounded100-number page; selection not found
  fails closed. Large-WABA paging, coexistence, migration and solution-partner variants deferred.
- Extended SDK-blocked/network-loss/cancellation/unmount/race and encrypted-credential log
  capture matrices remain pending. Existing UI/error and crypto/error cases are not all variants.
- Full Worker process/provider-delivery integration, real Redis outage/rate-limit exhaustion,
  staged key rotation/re-encryption/backup recovery and every role/status variant are not covered
  by this focused checkpoint. Existing encrypted resolver is shared; typecheck is not runtime proof.
- Apply reviewed migration0010 before enabling encrypted credentials in a hosted release;
  API/Worker need the same protected keyring. Existing0009 ordering requirement still applies.
  No main/local or hosted migration/backfill, real key generation, Railway mutation, commit,
  push or deployment. This is implemented and locally checked connection, not messaging launch.
