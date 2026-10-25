# Templates and WhatsApp setup checkpoint

Date: 2026-10-18. Owner authorization: CLAR-056. Scope: frontend mocked APIs only.

## Results

- New `tests/e2e/setup.spec.ts`: 12/12 Chromium tests passed.
- Affected combined run: 36/36 passed (initial 10 setup cases plus 20 Campaigns,
  2 workspace and 4 insights cases). The final setup-only run includes two additional cases.
- Shared API client: 10/10 passed, including logout/session-generation/cancellation safety.
- Configured frontend lint, typecheck and production build passed; test file formatted.

Verified scenarios: filtered library, escaped saved preview, synced read-only controls,
new text draft exact write DTO/components, version conflict with retained input, cancelled
navigation, expected-version Admin approval, required rejection reason, User review request,
User account-command restrictions, missing account prerequisite, fixed credential-reference
mapping, no implicit sync, cancelled/confirmed account sync, local disconnect, explicit template
sync, preview retry, account lookup failure isolation, and screen overflow at 375/768/1440 px.

First run: 8 passed / 2 failed. Both failures were test selectors: exact label lookup for a
select and ambiguous alert matching Next's route announcer. Corrected to accessible combobox
role and feature-scoped alert; no production behavior changed to make tests pass.

## Limits and remaining verification

These are browser contract fixtures, not backend authorization, real provider validation or
launch certification. No Meta call, actual token, database write or real message was used.
Manual populated-flow UAT remains for the owner. Broader T086-TPL coverage still includes
unsupported-shape variations, self-review denial, stale preview races, session/tenant-switch
UI clearing and authorization failures; passing shared-client tests do not certify all screen
state transitions. Keep those unverified rather than claiming exhaustive acceptance.

TASK-086.6.4 remains open: synchronized-template UI read-only is not a server-side fix for
the existing update path retaining provider status/ID. Production onboarding, submission to
Meta, team/business admin UI gaps, live delivery and release/security gates are separate.
