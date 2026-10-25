# Templates workspace — TASK-086.6 / CLAR-054

Implementation: 2026-10-18. Owner-approved text-first UI over the existing APIs. No schema,
backend workflow, dependency or provider submission endpoint was added.

## User flow

Tenant `template.read` opens Templates in Growth navigation. Search name/language, filter
category/Meta status, select a template and inspect separate Meta/internal status and text
preview. Permission denial, loading, empty, request error/retry and missing accounts are
explicit. Super Admin retains its separate metadata-only workspace and cannot enter this view.

Permitted writers create Marketing/Utility local drafts with text BODY plus optional text
HEADER/FOOTER, explicit sending account, name and language. Live preview renders escaped text;
placeholders stay literal. Existing API text limits apply, not a promise of Meta acceptance.
Creation still requires a connected account with active credential per the backend. Without
setup, the editor explains why save is unavailable rather than inventing a test connection.

Only compatible local `providerStatus=DRAFT` templates with no provider ID are editable.
Component parsing refuses unknown keys/shapes, duplicate components, media/buttons and
authentication category instead of silently losing content. The repository now enforces this
same rule atomically with tenant, active-row and expected-version predicates, so direct API and
concurrent update paths cannot locally edit synchronized records while retaining stale provider
identity or status. Unsupported/synced records still permit text preview, not authoring/review.

Dirty editor close/navigation/sign-out confirms discard; browser unload warns. Failed saves
retain the input and pinned expected version. Saving updates the library from the returned
record without silently rebasing an editor after stale-version errors.

For supported local drafts, Users with template.write can request review in DRAFT state;
different Tenant Admin with template.approve can approve/reject PENDING saved versions,
with rejection reason required. Commands include expected_content_version and confirm the
internal-only effect. The backend remains authoritative for permission, tenant and state.

Sync from Meta requires template.sync, a selected connected account, no open editor and
explicit confirmation that matching provider content may replace local content and require
renewed review. Sync is never automatic; no agent-triggered live sync occurred during build.
Accounts are listed only with whatsapp.read. Account lookup failure does not hide the library.

## Existing API reuse

| Route | Purpose |
| --- | --- |
| GET /templates | Full existing tenant library; filters here are client-side, not server pagination |
| GET /templates/:id/preview | Authorized saved text preview with obsolete-request cancellation |
| GET /whatsapp/accounts | Browser-safe sending account options, no credential values |
| POST /templates, PATCH /templates/:id | Local draft create/versioned update |
| POST /templates/:id/request-approval, /approve, /reject | Internal review, not Meta approval |
| POST /templates/sync | Explicit authorized provider synchronization |

No Submit to Meta button exists. Use approved Meta tooling for provider templates and sync
here. Raw provider credentials belong only in local/server environment variables. No delete,
duplicate, media upload, authentication builder, rate controls or sending action was invented.

## Verification and next steps

Formatting, configured frontend lint (new features explicitly included), typecheck and production
build passed. Owner-authenticated empty Templates screen was inspected without saving data.
CLAR-056 approved mocked tests: final setup suite 12/12 and affected regressions passed;
see SETUP_UI_TEST_REPORT.md for exact coverage and still-unverified cases. The approved
development setup slice is implemented (WHATSAPP_SETUP_UI.md). Production Embedded Signup
and actual provider submission remain outside this UI scope. TASK-086.6.4 subsequently added
the matching server-side synchronized-template update guard; focused API static/build checks
passed and its automated regression case remains deferred to the owner-approved checkpoint.
