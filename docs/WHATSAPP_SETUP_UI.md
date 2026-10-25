# WhatsApp development setup UI

TASK-032.2 now implements configured Embedded Signup as a separate entry into the same account
model. Prepare loads official SDK and starts a bound attempt; Continue opens Meta; server
exchanges/verifies and saves encrypted credentials atomically. No Meta password or permanent
token enters a form/browser response. Local19/19 mocked browser checks include prior setup
regressions. See WHATSAPP_ONBOARDING.md/report; real provider acceptance remains separate.

CLAR-071 / TASK-032.1: server mode now drives this page through GET /whatsapp/onboarding.
Default development retains manual form. Embedded mode hides manual form and reports incomplete
configuration or pending implementation; manual POST is also denied by service policy.
This foundation was subsequently extended by032.2 above; see WHATSAPP_ONBOARDING.md for activation.

Owner approval: CLAR-055. Implemented in `apps/web/features/whatsapp`, using existing APIs.

Tenant readers see stored account state, identifiers, safe quality rating and last provider
sync. Manual CONNECTED mapping is explicitly not proof of ownership, valid credentials or
production readiness. Arbitrary health/provider payloads and credential values are not rendered.

Tenant Admins with the corresponding permissions can save development test-asset mappings,
explicitly synchronize metadata, or disconnect locally. Each command requires confirmation.
Mapping sends the fixed `env://META_DEVELOPMENT_ACCESS_TOKEN` reference, never a token entered
in the browser. Keep the actual token only in local/server environment configuration.

Existing routes: GET /whatsapp/accounts; POST /whatsapp/connect;
POST /whatsapp/accounts/:id/sync; DELETE /whatsapp/accounts/:id.
No automatic synchronization occurs. Disconnect retains history and neither deletes the Meta
account nor revokes its token. Templates synchronization is a separate explicit Templates action.

Forms retain input after request failures, warn on unsaved navigation/unload and clear only
after successful mapping or confirmed reset. List errors have retry through Refresh accounts.
No Embedded Signup, production onboarding, token input, provider submission or send UI was added.
Backend authorization remains authoritative; UI permission checks are not security enforcement.

Checkpoint results and unverified scenarios: SETUP_UI_TEST_REPORT.md. No real provider calls
were executed during implementation or mocked verification.
