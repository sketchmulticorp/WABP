# ADR-030 — Server-selected WhatsApp connection method

Follow-up ADR-031 approves encrypted storage; ADR-032 implements direct connection and
supersedes the original IMPLEMENTATION_PENDING state. Historical foundation decision below.

Approved foundation2026-10-21, CLAR-071 / TASK-032.1.

Use WHATSAPP_ONBOARDING_MODE=development|embedded_signup, default development, independent of
APP_MODE. Validate the optional numeric Meta configuration ID. One authorized API projection
drives UI; server rejects development mapping in embedded mode before writes. Reuse account
records and downstream workflows. Do not accept credentials or arbitrary login URLs from UI.

Choosing embedded mode does not assert Meta approvals or connection readiness. Its current
state is unavailable until secure completion is implemented; missing configuration is explicit.
No fallback to shared development token, automated provider call, new dependency/schema,
paid service or deployment. Agency uses tenant identities, preserving Super Admin privacy.

Changing a hardcoded URL or hiding a button alone would not enforce this boundary. A new
runtime/application per provider mode duplicates workflows unnecessarily. The selected setting
keeps one implementation path and provides a safe future activation point without pretending
that development mapping is production onboarding.

Per-business encrypted DB storage versus external secret manager remains a separate owner
decision; this ADR does not amend the reference-only credential schema. See WHATSAPP_ONBOARDING.md.
