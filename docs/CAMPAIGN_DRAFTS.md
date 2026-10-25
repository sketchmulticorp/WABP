# Campaign drafts — TASK-053

## Guided authoring UI — TASK-086.7 / CLAR-052

Owner-approved 2026-10-18 redesign separates the campaign list, guided draft editor and saved
campaign review/delivery/report view. Steps are Template/sender, Recipients, Personalization,
Schedule and Review. Fields remain mounted between steps to preserve draft input; saves
retain existing incomplete-audience support, concurrency tokens and server policy checks.
Save never sends. Close/reload/navigation/sign-out confirm dirty draft discard; browser
unload warns. Workspace integration adds only a dirty-state callback, not authorization.

The authorized template preview endpoint supplies sample text. Literal mapping values can
appear in the preview; Contact-field mappings remain descriptive placeholders, never actual
recipient data. Media/buttons/rich formatting are explicitly not rendered. Suggested keys
come from template text and do not replace server validation. No placeholder value is guessed.

The date/time picker is explicitly UTC. Untouched persisted schedules retain exact instant
and timezone; edited schedules save UTC rather than inventing DST/IANA conversion. Final
send/schedule still requires an authorized separate action against the saved version.
Selection totals are not eligible-recipient totals; server preflight results stay distinct.
Template/account setup prerequisites are explicit because those UI workflows remain missing.

CLAR-053 checkpoint on 2026-10-18: redesigned Campaigns browser suite20/20 and related workspace/
reporting6/6 plus shared client10/10 passed using synthetic API fixtures. See
`CAMPAIGN_UX_TEST_REPORT.md` for exact commands, fixture corrections and remaining coverage.
Real backend/provider and launch gates remain unchanged.

No backend/schema/dependency/provider changes, external sends or new rate/cost/sheet features.
Historical TASK-053 results below do not verify this redesign; the new CLAR-053 evidence
is separate. After owner login, Tenant User
list/wizard/prerequisite states were visually inspected in Chrome at 375/768/1440 widths
with no page-level horizontal overflow. No account/templates exist in that business, so
real-backend populated preview/save/delivery/Admin acceptance remains unverified. Browser
fixtures exercise those frontend paths only. No real drafts saved or sends.

## Implemented boundary

Tenant Admins and permitted Tenant Users can list, read, create and edit campaign drafts
from the authenticated Campaigns workspace. Super Admin cannot access this tenant content.
Controller → Service → Repository constructor injection is mandatory. Writes and redacted
audit evidence share one service-owned transaction. The existing `app.campaigns` table
is reused; no migration, provider call, recipient expansion, Message, usage reservation,
outbox event or send is created by a draft operation.

Only `status = DRAFT` is editable. Empty audiences and incomplete variable mappings are
allowed while drafting. A disconnected account or unapproved template may be selected;
this is not permission to send. Account/template relationship and every explicitly
selected Contact/Group must be active and belong to the authenticated tenant. Missing,
deleted and cross-tenant references return the same safe not-found error.

## Audience and variables

Audience definition v1 stores a union of explicitly selected Contact IDs and static Group
IDs. IDs are normalized, deduplicated and sorted. Selections are bounded to 1,000 IDs per
array, not 1,000 eventual recipients: large audiences may use Groups. Saved segments,
dynamic Group rules and arbitrary JSON filters are not supported in this slice.
TASK-058 retains saved segments as a deferred design/approval follow-up.

Saving does not freeze Group membership. TASK-054 must expand the union, deduplicate
Contacts, validate current eligibility and persist recipient snapshots. Displayed
selection counts are not eligible-recipient counts or sending estimates.

Each template placeholder maps to either `LITERAL` text or an allowlisted `CONTACT_FIELD`:
`name`, `email`, or `phone_e164`. There are no expressions, scripting, arbitrary property
paths or silent fallback values. Up to 100 mappings and 4,000 characters per literal are
accepted. The UI supports positional or named placeholder keys. Exact key matching,
missing/null Contact values and supported template components are TASK-054 preflight
checks, not a promise made by saving a draft.

## Versioning and concurrent editing

Material changes to sending account, template selection, audience or variable mappings
increment `content_version`. User material edits atomically reset approval to `DRAFT`
and clear requester/reviewer/approved-version/rejection fields. Admin material edits use
`NOT_REQUIRED`, still clearing old review evidence. Creation follows the same actor rule.
Name/description-only changes preserve material version and existing approval.

PATCH requires both `expectedContentVersion` and `expectedRevision`. The server computes
an opaque SHA-256 revision from the returned persisted draft, including metadata,
approval and timestamps. Under a row lock it compares the current revision before any
write. This protects metadata-only edits without invalidating approval for a rename and
does not add a database column or rely solely on timestamp precision. A stale save
returns `CAMPAIGN_VERSION_CONFLICT`; unsaved form input remains until the user explicitly
reloads. The revision is a concurrency token, never an authorization credential.

## API

All routes use `/api/v1`, authenticated tenant context and the standard response envelope.

| Method/path | Permission | Result |
| --- | --- | --- |
| `GET /campaigns?cursor=<uuid>` | `campaign.read` | 50-row UUID cursor page, `campaigns` and `nextCursor` |
| `GET /campaigns/draft-options` | `campaign.read` | Own-tenant accounts, active templates and static Group choices; no credentials |
| `GET /campaigns/{id}` | `campaign.read` | Draft definition, version, approval summary and revision |
| `POST /campaigns` | `campaign.write` | New `DRAFT`, HTTP 201 |
| `PATCH /campaigns/{id}` | `campaign.write` | Complete draft replacement, HTTP 200; only DRAFT mutable |

The implemented browser-safe contract uses camelCase, matching the shared TypeScript
contracts. Unknown payload fields, including client-supplied tenant, status, approval or
schedule, are rejected. Route/cursor identifiers must be UUID v4.

```json
{
  "name": "Appointment reminders",
  "description": null,
  "whatsappAccountId": "00000000-0000-4000-8000-000000000001",
  "templateId": "00000000-0000-4000-8000-000000000002",
  "audienceDefinition": {
    "version": 1,
    "contactIds": [],
    "groupIds": []
  },
  "variableMapping": {
    "1": { "source": "CONTACT_FIELD", "field": "name" },
    "2": { "source": "LITERAL", "value": "Your appointment" }
  }
}
```

For PATCH, add the `expectedContentVersion` and `expectedRevision` from the most recent
response. Do not echo the entire response into PATCH: server-owned fields are rejected.
Audit metadata contains only version and approval state, not audience IDs, descriptions
or mapped values.

## UI and verification

The Campaign feature uses the existing authenticated API client. It includes loading,
empty, actionable error/retry, disconnected/missing-template guidance, read-only
presentation, list pagination, selected Contact pagination, editable mappings and
stale-save reload confirmation. TASK-054/055 add preflight, approval and delivery controls;
see `CAMPAIGN_PREFLIGHT.md` and `CAMPAIGN_LIFECYCLE.md` for the current behavior.
The new feature directory is included in the frontend lint command.

Run `pnpm check` and, with local development PostgreSQL available,
`pnpm --filter @whatsapp-platform/api test:campaigns:integration`.
The latter rejects production mode, creates unique fixtures and always rolls back.
Unit/database coverage verifies approval invalidation, metadata preservation, stale
revision/version rejection, tenant scope, deleted selections and audit rollback.
Playwright uses API doubles for mobile draft create/edit, mappings, error recovery,
stale-input preservation and read-only/missing-options states. No live Meta sends occur.

Verified: full `pnpm check` passed (50 API tests and five total Playwright tests), and
all three Campaign PostgreSQL tests passed. The same-version explicit-reload regression
is covered by the browser suite.

## Next dependencies

TASK-054 is implemented: durable preflight, frozen version-bound recipients, exact
template/variable eligibility and estimates. See `CAMPAIGN_PREFLIGHT.md`.
TASK-055 implements approval request/review, exact campaign and template version revalidation,
scheduling, expansion, dispatch, pause/cancel and reports. Editing a template independently
must not allow a previously reviewed campaign to silently send different content.
Draft creation is not idempotent; sending idempotency remains a separate TASK-055 boundary.
