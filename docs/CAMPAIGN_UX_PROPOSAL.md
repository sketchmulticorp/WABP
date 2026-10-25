# Campaign usability redesign proposal

Date: 2026-10-18. Status: Campaigns first-slice implementation approved by owner (“approved”).
Templates remains a separately scoped second slice, not authorized backend expansion.
Implementation is present. Focused static/build checks passed and an owner-authenticated
Tenant User tab was visually reviewed for list/wizard/prerequisite states at desktop/mobile/
tablet widths. Real-backend/provider acceptance remains unverified.
CLAR-053 approved the focused automated checkpoint; 20 Campaigns and 6 related
browser regressions plus 10 shared-client tests passed. See CAMPAIGN_UX_TEST_REPORT.md for
mocked scope and remaining permutations; real provider/launch verification is not claimed.
Reference inspected in Chrome: https://bonbell.net/media/videos/meridian-templates-campaigns-tutorial.mp4
Relevant sections visually inspected: template list/editor/preview, campaign recipient wizard
and send-rate/recipient summary. Not a claim of inspecting or testing the reference product.

## Actual problem

Current draft-editor.tsx combines account/template selection, recipient checklists, variable
mapping and raw ISO scheduling in one form. Lifecycle controls show technical revisions and
identifiers close to customer actions. The owner reports the UI is hard to understand.
More styling alone will not fix the information hierarchy.

## Recommended first slice — TASK-086.7

- Campaign list as the entry point with clear status, existing campaign actions and a
  prominent New campaign action; don't invent summary totals from a paginated subset.
- Guided editor: Template/sender → Contacts/static Groups → Personalization → Schedule → Review.
  Each step has a title, short guidance, inline errors, Back/Continue and preserved input.
- Human-readable names instead of raw UUIDs, approval/version details secondary, role-specific
  actions explained in plain language. Keep incomplete draft saves and existing stale-save handling.
- Show selected template and sample personalization in a message-style preview, using existing
  template preview API. Distinguish sample values from real per-recipient rendering; unsupported
  components must be explained rather than guessed or silently dropped.
- Schedule now/later with accessible date/time controls and explicit timezone; convert to the
  existing offset-bearing API contract without inventing timezone/DST rules. Clarify any ambiguity
  before implementing. Preserve exact-version approval invalidation.
- Review selected audience and saved configuration; selection count is not eligible-recipient
  count. Display actual server preflight results separately. Save/review never authorizes delivery.
- Separate delivery/report detail from the draft form: actual status buckets, existing pause/
  resume/cancel/refresh and bounded CSV. No fabricated live polling/progress/cost values.
- Responsive layouts at 375/768/1440, keyboard navigation, loading/empty/retry/permission states,
  draft loss confirmation and safe final delivery confirmation. Retain current permissions.

Reuse existing Campaign API, backend policies and contracts; no database, dependency or
provider changes expected for the first slice. Keep the owner's Geist, compact geometry and
yellow palette (CLAR-049/051), not reference branding/blue or excluded AI/CRM features.

Alternative: CSS-only restyling is smaller but leaves the confusing workflow. Building the
entire reference feature set is larger and introduces unapproved backend/provider semantics.
The guided existing-capability redesign is the smallest useful improvement.

## Separate second slice

Template library/editor/preview/internal approval/sync UI may reuse the existing template
controller but needs approved authoring-component scope and truthful backend contracts.
Controller inspection confirms there is no Submit to Meta endpoint today. Do not conflate
internal approval/synchronization with external template submission or show a fake action.
Backend scope for external submission must be assessed and approved separately.

## Not included by visual-reference request

Adaptive/fixed/finish-by rate modes, daily sending hours/end time, real campaign cost estimates,
template-generated sheets/direct campaign upload, new submission APIs, unrelated dashboards
and account/team setup. Existing imports remain available via their approved workflow.

## Verification plan

After approval, inspect installed Next guides and current feature contracts before coding.
Run relevant formatting/lint/typecheck/build and visually inspect accessible responsive flows.
Record affected automated cases (wizard navigation/draft preservation/approval/preview/
schedule/confirmation/export) and ask whether to update/run them at the task checkpoint,
following the owner-approved optional testing cadence. Never label deferred coverage passed.
