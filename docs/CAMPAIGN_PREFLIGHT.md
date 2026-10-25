# Campaign preflight — TASK-054

## Purpose and boundary

Campaign preflight is a durable diagnostic workflow. It expands the current draft's explicit
Contacts and static Groups, creates one deduplicated recipient snapshot per active Contact,
validates current send eligibility, and reports estimates. It does not contact Meta, create
Messages, reserve quota, schedule, or send.

Preflight may run before internal campaign approval so an Admin can review actual audience and
policy problems. A result is bound to `content_version`. TASK-055 reruns/finalizes preflight
after exact-version approval before scheduling or sending; a diagnostic result is never send
authorization.

## Durable asynchronous flow

1. `POST /api/v1/campaigns/{campaignId}/preflight` locks the tenant-owned draft.
2. An existing `QUEUED`/`PROCESSING` run is returned idempotently. Otherwise the API creates a
   `campaign_preflight_runs` row and identifier-only `campaign.preflight.queued` outbox event in
   one transaction, returning HTTP 202.
3. The worker relay publishes only `preflightRunId` to BullMQ. PostgreSQL remains authoritative.
4. The thin processor calls `CampaignPreflightService`; repository methods alone execute SQL.
5. The worker resolves the audience in a repeatable-read transaction, replaces the campaign's
   current recipient snapshot, stores aggregate blockers/estimates, and writes redacted audit
   evidence.
6. The browser polls `GET /api/v1/campaigns/{campaignId}/preflight/{runId}` until a terminal state.

Material draft edits atomically mark active runs `SUPERSEDED` and remove their not-yet-dispatched
recipient snapshot. The worker independently rejects a version/status mismatch. Browser closure
does not stop accepted work.

## Recipient rules

The audience is the union of active explicit Contacts and active memberships in selected active
static Groups. Selection overlap is counted but produces one recipient row. Each row stores the
run ID, campaign content version, status, rendered variables, and an explicit skip reason.

Eligible recipients are `PENDING`. Recipient-level skip codes include invalid E.164 phone,
opt-out, suppression, missing opt-in, and the exact missing variable key. Only allowlisted literal
or Contact fields from the saved draft are rendered. No expression evaluation or arbitrary
property access occurs.

## Campaign-level blockers and estimates

Campaign-level blockers include inactive tenant/subscription/plan, disconnected account or
credential, internal/provider template approval, campaign approval, unsupported template media
or buttons, mapping mismatch, no eligible recipients, and insufficient monthly quota. The
template placeholder set must exactly equal the mapping keys.

Estimates report explicit selections, active Group memberships, overlap removed, resolved,
eligible and skipped recipients, skipped-reason counts, monthly limit/used/remaining, estimated
usage, and remaining quota after the proposed send. Quota is never reserved here. If eligible
recipients exceed remaining quota, the entire campaign is blocked rather than silently truncated.

`FAILED` means infrastructure/processing failure. `COMPLETED` can contain business blockers;
`SUPERSEDED` means the campaign changed while work was pending.

## Security and privacy

Tenant identity comes only from live authorization context. `campaign.write` starts preflight;
`campaign.read` polls it. Super Admin is denied tenant-content routes. Queue payloads and logs
contain identifiers only. API results expose aggregate reasons and estimates, not recipient PII.
Recipient detail remains tenant-owned PostgreSQL data and is not returned by these endpoints.

## Verification

Run `pnpm schema:verify`, `pnpm check`, and
`pnpm --filter @whatsapp-platform/api test:campaigns:integration`. Local PostgreSQL must have
migration `0007_campaign_preflight` applied. No live Meta credentials or sends are used.
