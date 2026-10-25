# MVP Application Flows

Status: Ready for product-owner review  
Scope: First production MVP

## Purpose

This document defines what happens after a user takes an action, including the next screen, success result, failure result, and recovery path. It complements `03-user-experience-and-screen-map.md`; that document inventories screens and UX principles, while this document defines end-to-end behavior.

## Global flow rules

- Every protected screen requires an authenticated session and server-side authorization.
- Tenant context comes from the authenticated session, never from a tenant identifier trusted directly from the browser.
- A user without permission sees an access-denied state and a safe route back to the dashboard; hidden navigation is not the security boundary.
- Long-running work such as imports, campaigns, exports, and template synchronization continues after the browser closes.
- Every data-driven screen provides loading, empty, error, permission-denied, and retry states where applicable.
- Destructive, billable, or high-volume actions require confirmation before submission.
- A repeated submission with the same idempotency key must not create duplicate work.
- Provider and validation errors must explain what failed, whether retry is safe, and what the user can do next.

## 1. Authentication and session recovery

| Step | Screen | User action | Success | Failure or alternate path |
|---|---|---|---|---|
| 1 | Login | Enter credentials and submit | Create session and continue to the permitted landing page | Keep entered email, show a generic authentication error, and rate-limit repeated attempts |
| 2 | Two-factor challenge, when enabled | Enter verification code | Complete login and continue | Show invalid/expired code with retry or recovery path |
| 3 | Dashboard | Use the application | Continue normally | If the access token expires, attempt one refresh; if refresh fails, return to login without exposing protected data |
| 4 | Any protected screen | User lacks permission | No protected request is performed | Show access denied and a dashboard action |
| 5 | Account menu | Sign out | Revoke the active session and return to login | Clear local session state even if the server response cannot be displayed |

Password reset must not reveal whether an email address exists. Reset links are single-use and expire.

## 2. Tenant onboarding and WhatsApp connection

| Step | Screen | User action | Success | Failure or alternate path |
|---|---|---|---|---|
| 1 | First-login setup | Complete business profile | Save progress and open WhatsApp setup | Validate fields inline and retain valid values |
| 2 | WhatsApp accounts | Select **Connect WhatsApp** | Launch approved Meta Embedded Signup | Show configuration/support guidance if signup cannot start |
| 3 | Embedded Signup | Complete Meta authorization | Return to a processing state while the backend validates and stores references securely | Show cancelled, expired, permission-denied, and provider-unavailable outcomes separately |
| 4 | Connection status | Wait for validation | Display connected WABA and phone-number health | Display actionable degraded/authentication/registration errors and allow safe retry |
| 5 | Templates | Select **Synchronize** | Queue synchronization, show progress, then list normalized template states | Keep the previous successful data, show the failed job, and allow retry |
| 6 | Onboarding checklist | Continue | Open Contacts after minimum connection requirements pass | Keep incomplete steps visible; never mark setup complete from browser state alone |

Disconnecting a WhatsApp account requires confirmation and must warn about queued campaigns, automation, and inbox effects. Historical records remain available according to retention rules.

### User template approval

Tenant User creates or materially edits template -> internal `DRAFT` -> submit exact
`content_version` -> `PENDING` Admin review -> Admin approves or rejects -> approved
version may be submitted/synchronized with Meta -> only an internally eligible and Meta
`APPROVED` template may be used. An Admin-created/materially Admin-edited template needs no
second internal approver. A material User edit after approval returns it to internal
`DRAFT` and requires reapproval.

## 3. Contacts, Groups, and imports

### Create or edit a contact

Contacts list -> **New contact** or **Edit** -> contact form -> validate and normalize phone number -> save -> contact detail/list confirmation.

- Duplicate or conflicting phone numbers return a clear resolution option rather than silently creating another contact.
- Opt-out and suppression state is visible and cannot be bypassed by ordinary campaign actions.
- Cancelling a form returns without changing stored data.

### Create and manage a Group

Groups list -> **New Group** -> enter name/details -> save -> Group detail -> add or remove Contacts -> updated member count.

- Group names follow the documented tenant-level uniqueness rule.
- Adding an existing member is idempotent.
- Removing a Contact from a Group does not delete the Contact.
- Deleting a Group requires confirmation and does not delete its Contacts.

### Import Contacts

| Step | Screen | User action | Success | Failure or alternate path |
|---|---|---|---|---|
| 1 | Contacts | Select **Import** | Open upload step | Permission denied returns to Contacts safely |
| 2 | Upload | Choose CSV/XLSX file | Validate file type/size and open column mapping | Reject unsafe, malformed, encrypted, or oversized input with guidance |
| 3 | Column mapping | Map source columns | Show validation preview | Identify missing required columns and invalid mappings |
| 4 | Preview | Review valid, invalid, and duplicate rows | Confirm import | Allow download/view of row issues before confirmation |
| 5 | Import progress | Start import | Queue background job and show durable progress | Show failed/cancelled state and a row-level error report; allow safe retry |
| 6 | Result | Review summary | Open imported Contacts or assigned Group | Preserve counts and error report for audit/support |

## 4. Campaign creation and delivery

| Step | Screen | User action | Success | Failure or alternate path |
|---|---|---|---|---|
| 1 | Campaigns | Select **New campaign** | Create a draft and open details | Show permission/plan restriction without creating a draft |
| 2 | Details | Enter name and select sending account | Continue to audience | Block disconnected or unhealthy accounts |
| 3 | Audience | Select Contacts and/or Groups | Continue to template | Show estimated audience and remove duplicates across selections |
| 4 | Template | Select an internally eligible and Meta-approved template | Continue to variable mapping | Block internally unapproved, stale-version, Meta-rejected, paused, disabled, or incompatible templates |
| 5 | Variables | Map required values | Continue to preflight | Identify missing or invalid mappings |
| 6 | Preflight | Request validation | Show valid, invalid, duplicate, suppressed, missing-variable, and quota-blocked counts | Keep the draft editable and link each problem to its correction path |
| 7 | Internal approval | User submits the exact current material version; Admin reviews it | Admin approval records reviewer/version, or Admin-authored work skips this step | Reject self/cross-tenant/stale review; show rejection reason; material User edits invalidate approval |
| 8 | Review | Select send now or schedule, then confirm | Freeze the recipient snapshot and create durable queued work | Prevent unapproved/stale User campaign, double confirmation, or policy/quota/schedule/connection errors |
| 9 | Progress/report | Monitor delivery | Show queued, sent, delivered, read, failed, and suppressed results | Show retryable versus permanent failures without resending successful recipients |

Closing the browser after confirmation does not stop an accepted campaign. Pause/cancel behavior applies only to recipients that have not crossed the documented dispatch boundary.

## 5. Shared inbox and human handoff

Inbound Meta webhook -> verify signature -> persist event -> process idempotently -> resolve tenant/account/contact/conversation -> append message -> update unread state -> notify authorized clients.

| Screen/action | Success | Failure or alternate path |
|---|---|---|
| Conversation list filters | Refresh the list and preserve the active conversation when still visible | Show retry without clearing the last valid list |
| Open conversation | Load paginated history and context | Show an inline retry state; do not expose another tenant's conversation |
| Assign agent | Update assignment and audit event | Restore prior UI state and explain permission/conflict failure |
| Send reply | Validate service window/policy, queue message, and show pending state | Keep the draft for correction; explain when an approved template is required |
| Add internal note | Store a note not sent to WhatsApp | Mark the failure clearly; never transform a failed note into an outbound message |
| Request human handoff | Pause applicable automation and expose the conversation to agents | Retain automation state if the transaction fails |
| Close/reopen | Update conversation state and audit event | Restore the previous state on failure |

## 6. Basic automation

Flow list -> create/open draft -> configure supported nodes and edges -> validate -> test -> publish immutable version -> activate triggers -> inspect runs and analytics.

- Validation blocks unsupported nodes, missing required configuration, invalid edges, unreachable paths, and unsafe cycles.
- Publishing creates a new immutable version; it does not modify runs pinned to an older version.
- Duplicate inbound events do not advance a run twice.
- Human handoff pauses or ends automated responses according to the node configuration.
- A failed node records a diagnosable state and follows its retry/failure policy without duplicating completed side effects.

## 7. Administration and operational flows

- Super Admin business/Admin change: list -> create/edit/activate -> validate platform permission -> persist -> audit -> refresh affected authorization; never expose tenant content.
- Tenant Admin User/role change: own-tenant team -> create/edit -> validate single membership and permission -> persist -> audit -> refresh affected authorization.
- Plan/limit change: tenant -> plan settings -> preview changed limits -> confirm -> persist -> audit -> enforce server-side on subsequent operations.
- Operational failure: dashboard/alert -> affected job or event -> inspect normalized error and correlation ID -> retry/replay only when safe -> audit operator action.
- Export: request -> validate permission and filters -> queue generation -> notify when ready -> issue an expiring authorized download URL.

## 8. Navigation and recovery acceptance checklist

- [ ] Every MVP screen has an owner role and permission requirement.
- [ ] Every primary action names its success destination or resulting state.
- [ ] Every form has validation, cancellation, duplicate-submission, and server-error behavior.
- [ ] Every async action has queued, running, completed, failed, and retry/recovery behavior.
- [ ] Every provider-dependent flow distinguishes local validation from provider rejection/outage.
- [ ] Back/refresh/browser-close behavior does not corrupt durable work.
- [ ] Empty, loading, denied, disconnected, degraded, and partial states are designed before implementation.
- [ ] Product owner approves the critical journeys before their implementation stage starts.
