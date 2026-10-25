# Campaign UX automated checkpoint

Date: 2026-10-18. TASK-086.7.2 / CLAR-053. Result: focused checkpoint PASS.
This is local browser/client evidence, not customer-launch, real Meta or backend-policy certification.

## Execution

| Command | Final result |
| --- | --- |
| `pnpm exec playwright test tests/e2e/campaigns.spec.ts tests/e2e/workspace.spec.ts tests/e2e/insights.spec.ts` | 26 passed, 0 failed, 20.7 seconds: 20 Campaigns, 2 workspace, 4 reporting |
| `pnpm test:client` | 10 passed, 0 failed |
| `pnpm exec prettier --check tests/e2e/campaigns.spec.ts tests/e2e/workspace.spec.ts` | Passed |
| `git diff --check` | Passed |

Existing Playwright configuration starts Next production on port 3100 and intercepts all
application API traffic with deterministic fixtures. No real API, database, user credentials,
provider calls or message delivery are required. Synthetic save/approval/send commands only
change in-memory fixture state. Local owner walkthrough processes/data were not reset.
No production code, schema, dependencies or infrastructure changed in this testing pass.

## Scope evidence against T086-UX01–07

| Case | Verified representative behavior | Scope still not certified |
| --- | --- | --- |
| UX01 | Wizard preserves name/description/selections/mappings; mobile create/edit; sample personalization; empty audience saves; missing prerequisites/read-only UI; saves alone do not send | Every pagination/selection permutation |
| UX02 | Invalid hidden fields reveal their step; missing later time blocks Continue; edited timestamp is UTC; metadata-only edit preserves exact offset, milliseconds and IANA label | Every native date-input/browser/locale edge |
| UX03 | Close and navigation cancellation preserve work; accepted close discards; sign-out cancel/accept; stale reload confirmation; variable-only addition triggers dirty/unload protection | Independent remove/clear-only variants and exhaustive navigation races |
| UX04 | Authorized preview, escaped literal content, Contact-field mapping, missing permission makes no preview request, explicit failure, late old-template response cannot replace selected preview | Every unsupported component shape and unmount/permission-race permutation |
| UX05 | Saved detail is separate from form; stale save preserves draft; User submission lacks delivery controls; Admin approval uses exact saved version/revision and does not send; separate schedule/send/pause/resume/cancel commands | Real backend approval invalidation, tenant denial and provider dispatch (not verified by API mocks) |
| UX06 | Actual fixture status counts, recipient page command, private CSV cancel/accept and download; report refresh; campaign list error recovery; related reporting CSV/error/stale-scope regressions | All campaign-list cursor edge cases and server CSV bounds/security, whose detailed cases remain tracked separately |
| UX07 | 375/768/1440 no page overflow; step-heading focus; mobile drawer navigation; User/Admin/read-only presentation | Full keyboard/screen-reader audit, every role/tenant matrix and browser engine |

This closes the focused automated redesign checkpoint, not every permutation of the broad
acceptance matrix. Remaining launch-critical server/security checks stay under TASK-084/086;
Templates/account setup and real Meta end-to-end remain unimplemented/unverified as recorded.
No test result here warrants admitting the unmeasured 1,200-user workload.

## Failures, diagnosis and retest

1. Initial Campaigns run: 12 passed / 4 failed. The validation locator matched both the
   form error and Next's route announcer; scoped it to the campaign form. Mobile/tablet
   fixtures attempted sidebar actions before opening the responsive drawer; updated
   navigation steps to use the visible Open navigation control. Assertions retained.
2. Combined run: 24 passed / 1 failed. Legacy workspace fixture returned Groups/members
   as arrays, despite current GroupService returning `{ groups }` / `{ members }`.
   Updated those fixture envelopes and its obsolete role string to the current role object.
   No backend response or production UI changed. Recorded as TASK-086.7.2.1 before editing.
3. Added populated report/recipient CSV privacy coverage and made delayed-preview completion
   deterministic. Final combined rerun: 26/26 passed. Shared client regressions: 10/10.

Tests use the existing harness; no new package or test runner was added. Historical full
suite passes remain historical—this checkpoint did not rerun all API/worker/Inbox/automation suites.
