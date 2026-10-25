# MVP Design System

CLAR-081: platform sidebar adds **Add Super Admin** for Super Admin/user.invite only.
Creation form collects name/email/temporary password, warns of same platform privileges and
unchanged tenant privacy, confirms before POST, clears password on success and explains
secure out-of-app handover/mandatory change/fresh login. Shared existing initial-password
screen supports partners too. No list/edit/delete/reset controls. See SUPER_ADMIN_CREATION.md.

CLAR-072: shared My profile sidebar entry for all roles in full/preview. Own identity/business
read-only except name; separate current/new/confirm password form, explicit revoke-all warning,
loading/error/success and dirty-state protection. Password success returns directly to sign-in.
No avatar/upload; mandatory initial handover remains first. See PROFILE.md.

TASK-032.2 supersedes IMPLEMENTATION_PENDING: configured embedded mode shows Prepare then
Continue with Meta, preserving direct popup gesture. Cancellation/error/expiry allow restart;
success refreshes accounts and explains separate messaging activation. No password/token input,
no SDK autoload. NOT_CONFIGURED hides manual and embedded actions; backend remains authoritative.

CLAR-071: WhatsApp setup reads connection method from API. Development shows existing form;
embedded mode shows NOT_CONFIGURED or the implemented Prepare/Continue connection workflow
when configured (TASK-032.2). READY_TO_CONNECT is not Meta approval or messaging activation.
Loading/failure hides connection form; existing account operations remain explicit.

CLAR-070: preview exposes reporting, WhatsApp setup, templates and campaigns with a storage-free
notice. Hide preflight/delivery, Inbox, automation and imports. Internal review is not Meta
approval or delivery. Existing role permissions and Super Admin content denial are unchanged.

## Account management

CLAR-069: newly created Tenant Admin/User sees only the mandatory initial-password form after
login. Require temporary password, new password and matching confirmation; labeled inputs,
loading/error state and sign-out. On success clear fields, show signed-out confirmation and
explicit sign-in button. No workspace mounted until normal login after completion.

CLAR-068: preview reuses existing platform and Team screens below, with a database-only
preview banner. Super Admin no longer sees the blanket unavailable screen. Later CLAR-070/071
also expose authorized tenant reports, setup and authoring; uploads/messaging/background views
remain hidden. Platform privacy restrictions stay unchanged.

- Super Admin navigation includes **Businesses and admins**. Creation collects business name,
  slug, timezone, optional ISO country code, initial Admin identity and an initial password;
  the business and first Tenant Admin are created atomically.
- Tenant Admin navigation includes **Team**. It lists the Admin and regular users in the
  authenticated tenant and creates only regular Tenant Users. Tenant Users do not see this
  screen.
- Regular Tenant User rows expose permission-gated Deactivate/Reactivate and Delete actions.
  Admin rows never expose account actions. Deactivate and soft-delete require explicit browser
  confirmation, disable duplicate actions while pending, and refresh the team after success.
- Both screens provide labeled fields, explicit loading/error/success states, duplicate-submit
  prevention and responsive tables/forms. Password values are cleared after success and are
  never displayed in lists or success messages.

## Design direction

Modern, restrained, accessible B2B SaaS. Interfaces should prioritize clarity, operational status, dense but readable data, and safe high-impact actions.

CLAR-060 supersedes the earlier yellow-heavy visual direction while retaining Geist, compact
application sizing, the grouped fixed sidebar and every established workflow. Current Linear,
Vercel Geist and Atlassian foundation guidance selects a calm monochrome hierarchy: navigation
recedes, structure is created with spacing and typography rather than heavy borders, default
surfaces stay flat and green is reserved for operational state. References are styling input
only; retain this application's name, WhatsApp language, permissions and information architecture.

## Foundations

- Font: Geist via Next.js font optimization across the entire application. Use
  weight, scale, letter spacing and line height—not a second font family—to create hierarchy.
  Body, navigation, forms and tables use a compact 14 px/20 px base; page headings use a restrained
  30 px/36 px scale, with smaller section headings beneath it.
- Primary/action: near-black `#18181B` with white text.
- Primary hover: `#27272A`.
- Background/mist: `#F7F7F8`.
- Surface: `#FFFFFF`.
- Primary text/ink: `#18181B`.
- Muted text: `#71717A`.
- Border/line: `#E4E4E7`; stronger control border `#D4D4D8`.
- Quiet/highlight surface: `#F4F4F5` with ink text.
- Warning: `#D97706`.
- Error/destructive: `#B42318`; destructive actions use an outlined treatment by default.
- Success/live: `#15803D` on success surface `#ECFDF3`; do not use green decoratively.

All color combinations must meet WCAG AA contrast for their intended text size and state.

## Shape and spacing

- Base spacing unit: 4 px.
- CLAR-079 aligns every authenticated page to one fluid large container capped at 1,200 px.
  Desktop gutters scale from 20–36 px; the sticky topbar, page heading, actions, forms, cards,
  tables and pagination share the same horizontal edges. Use 24 px between page sections,
  16 px for wrapped action groups and the existing compact 8/12/16 px internal rhythm.
- CLAR-060 compact geometry: standard desktop actions are 38–40 px high with 14 px/20 px type.
  Controls use 8 px corners, cards use 12 px and overlays use 16 px. Layouts repeat 8/12/16 px
  gaps, card padding is normally 16–20 px, and compact
  table cells use 10×12 px padding. Mobile controls retain a 44 px minimum touch target. Status
  pills and avatars remain intentional circular exceptions.
- Borders are preferred over shadows. Default cards use only a 1 px neutral border and minimal
  1 px depth; stronger shadows are reserved for dialogs and overlays. Gradients, glass effects
  and decorative accents are excluded.
- Use 20–24 px mobile gutters and a 1,200 px readable content maximum where tables do not
  require full width.
- Motion durations are 120 ms for direct state changes, 200 ms for surface transitions and
  320 ms only for larger spatial changes. Honor reduced-motion preferences.

## Components

- Buttons: primary, secondary, quiet, and destructive.
- Inputs: label, description, validation, disabled, and error states.
- Password inputs share one accessible visibility control: masked by default, field-specific
  Show/Hide labels, pressed state and an inline eye icon without separate password persistence.
  The control stays inside the input's right edge and does not shift between interaction states.
- Tables: sortable header where needed, loading skeleton, empty state, pagination, and row actions.
- Status badges: text plus color; never communicate state using color alone.
- Dialogs: confirmation required for destructive, billable, or high-volume actions.
- Toasts: brief confirmation only; persistent/actionable errors remain in context.
- Navigation: role-aware presentation but never relied on for authorization.
- Desktop navigation is a fixed, grouped 248 px soft-gray sidebar with compact icon-and-label
  rows, a quiet white active row and the signed-in user anchored at the bottom. At the mobile breakpoint it
  becomes an overlay drawer with an explicit open/close control and backdrop.

## Required page states

Every data-driven screen must define:

- Loading.
- Empty.
- Error with recovery action.
- Permission denied.
- Disconnected/degraded provider state where applicable.
- Partial data or asynchronous processing state.

## Responsive behavior

- Mobile: 375 px baseline.
- Tablet: 768 px baseline.
- Desktop: 1440 px baseline.
- Tables may become prioritized cards or horizontally scroll with fixed action affordances.
- Inbox should move from multi-pane desktop to drill-in navigation on narrow screens.
- Advanced canvas-based automation authoring remains deferred.
- CLAR-038 selects a responsive form-based step/branch editor for the first automation MVP,
  not a canvas. Include readable content/transition history, saved-version no-send simulation,
  explicit publication/pause confirmation and Inbox takeover/allow controls. No drag-and-drop.

## Accessibility

- Keyboard-accessible controls and visible focus indicators.
- Semantic headings, landmarks, tables, and form labels.
- Accessible error summaries and field-level messages.
- Appropriate live regions for message/status updates without excessive announcements.
- Touch targets sized for mobile use.

## Domain-specific UX

CLAR-065 limited deployment: authenticated server /me deployment_mode selects the existing
manual Contacts/Groups workspace with explicit preview notice; unavailable feature screens
are not mounted or linked. Super Admin sees a sign-in/profile-limit notice and sign-out, never
tenant Contacts/Groups. Full mode retains current navigation. No fake import/send controls.

CLAR-054: Templates is a tenant list/detail workspace with escaped text preview and separate
Meta/internal statuses. Compatible local Marketing/Utility text draft editor uses the current
compact tokens; synced/media/button/auth content is read-only rather than flattened. Explicit
dirty guards, missing account/error states and confirmed internal review/sync actions. No fake
Meta submission or credential input. See TEMPLATES_UI.md for exact scope and verification.

CLAR-052 / TASK-086.7: Campaign authoring uses a focused list → guided Template/Recipients/
Personalization/Schedule/Review flow → saved review/delivery/report. Keep the current Geist and
CLAR-060 compact monochrome tokens. A side preview is text/sample-only with explicit unsupported-component
and permission states; mobile stacks the preview beneath the form. Preserve unsaved data
between steps and confirm discard when leaving. UTC schedule picker is labelled explicitly;
no inferred local timezone conversion. Saving, diagnostic recipient checks, approval and
delivery are distinct actions. Never present page-local totals as global campaign metrics.

TASK-081 adds explicit CSV actions beside the authorized report views, with busy/error/retry
and download-requested states. Campaign recipient PII requires privacy confirmation. State
10,000-row/10-MiB bounds and distinguish full bounded matching results from the current page;
payment notes are excluded. Abort obsolete target/filter downloads. See REPORT_EXPORTS.md.

TASK-080 adds permission-aware tenant Overview/Usage/Billing/Audit and an entirely separate
Super Admin metadata-only workspace. Use simple cards/tables/forms, not advanced charts.
Label UTC periods, current message-status buckets, reserved quota vs delivery and minor-unit
payments explicitly. Payment writes require confirmation and state that subscriptions are
unchanged. See ESSENTIAL_REPORTING.md; responsive/keyboard/runtime acceptance is pending.

- Distinguish queued, provider accepted, delivered, read, and failed states.
- Show customer-service-window and template restrictions beside the inbox composer.
- Campaign confirmation must show account, template, audience, valid, invalid, suppressed, and estimated counts.
- Long-running imports/campaigns must expose progress without requiring the browser to remain open.
- Connection failures must show actionable recovery rather than generic errors.

