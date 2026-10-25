# Roles, Permissions, and Tenancy

## Authorization model

Use RBAC with granular permission keys and explicit scope. A role decides what operations are available; scope decides which tenants or records the actor may operate on. UI visibility is never an authorization boundary.

Authorization must be enforced at the API/controller boundary and again in the service or repository path that accesses data.

## Baseline matrix

| Capability | Super Admin | Tenant Admin | Tenant User |
|---|---|---|---|
| Platform dashboard | Global summaries | None | None |
| Business/Admin account management | Full | Own business profile | None |
| User/team management | Account oversight only | Full inside own tenant | None unless explicitly permitted |
| Plan/package management | Full | View own plan | View if permitted |
| Billing/subscription | Global management | Own tenant | None unless explicitly permitted |
| WhatsApp accounts | Operational metadata only | Full inside own tenant | Granted tenant operations |
| Contacts and Groups | Aggregate counts only | Full inside own tenant | Granted tenant operations; no approval needed |
| Templates | Aggregate statuses only | Full and internal approver | Create/edit; Admin approval required before submission/use |
| Campaigns/posts | Aggregate statuses/counts only | Full; may publish directly | Create/edit; Admin approval required before schedule/send |
| Automation | Aggregate status/count metadata | Full inside own tenant | Granted tenant operations |
| Shared inbox | Aggregate operational metrics only | Full inside own tenant | Granted tenant operations; no approval needed |
| Reports | Global aggregates | Full own-tenant details | Granted own-tenant details |
| Audit logs | Global authorized redacted metadata | Own tenant | Own activity where exposed |
| Global settings | Full | None | None |

## Platform privacy boundary

Super Admin is the only platform role. Tenant Admin is the client/business owner, and Tenant User is an employee, assistant, or crew member. Every Tenant Admin and Tenant User has one active tenant membership in the MVP and cannot switch businesses. Super Admin creates and activates the initial Tenant Admin; that Admin manages Users only inside the owning tenant.

Super Admin receives purpose-built administration projections containing Admin/User identity and account details, role, status, tenant membership, tenant and connection health, billing/subscription/usage information, aggregate contact counts, aggregate campaign/message/send counts and statuses, and authorized redacted audit/tracking metadata.

Super Admin must not use tenant content endpoints or receive contact PII/custom fields/notes/consent evidence, message bodies, conversation history, recipient-level results, customer media, raw webhook/provider payload content, content-revealing search results, or detailed customer-data exports. Super Admin status does not bypass this restriction. Tenant Admin and permitted Tenant Users access detailed data only inside their one tenant.

The MVP does not provide break-glass content access. Direct database administration remains outside application authorization and requires restricted infrastructure credentials and separate auditing.

## Campaign and template approval

- Tenant Admin work does not require a second internal approval.
- User-created or materially User-edited campaigns require Admin approval before schedule/send.
- User-created or materially User-edited templates require Admin approval before Meta submission or campaign use. Meta approval remains a separate mandatory provider decision.
- The requester cannot approve their own work. The approver must be an active Admin of the same tenant.
- Approval applies to one exact material version. Campaign changes to audience, template/content, variables, sending account, or schedule—and template changes to send-relevant content/configuration—invalidate approval and require a new request.
- Contact/Group CRUD, permitted inbox replies, tracking, and other granted routine operations do not use this approval workflow.
- API services and workers recheck role, tenant, approval status, approved version, Meta status, policy, plan/quota, and idempotency immediately before external side effects.

## Suggested permission keys

Permission names should be stable and grouped by domain, for example:

- `tenant.read`, `tenant.manage`, `tenant.suspend`
- `user.read`, `user.invite`, `user.update`, `user.deactivate`
- `role.read`, `role.manage`
- `whatsapp.read`, `whatsapp.connect`, `whatsapp.sync`, `whatsapp.disconnect`
- `contact.read`, `contact.write`, `contact.import`, `contact.export`, `contact.delete`
- `template.read`, `template.write`, `template.sync`
- `campaign.read`, `campaign.write`, `campaign.send`, `campaign.cancel`, `campaign.export`
- `conversation.read`, `conversation.reply`, `conversation.assign`, `conversation.close`
- `automation.read`, `automation.write`, `automation.test`, `automation.publish`
- `media.read`, `media.upload`, `media.delete`
- `report.read`, `audit.read`, `plan.manage`, `billing.read`

TASK-022 promotes this baseline into a stable seeded catalog and adds explicit
`platform.dashboard.read`, `template.submit`, `template.approve`, `campaign.approve`, and
`plan.read` keys so platform projection access and approval/publish actions never depend
on an ambiguous broad permission. Exact initial assignments and exclusions are documented
in `BOOTSTRAP_SEED.md` and implemented in `apps/api/src/database/seed/seed.catalog.ts`.

## Tenant resolution rules

- Derive the acting tenant from the authenticated principal and verified scope.
- Never authorize using a `tenant_id` supplied only by the request body.
- Every query for tenant-owned data must include a tenant predicate.
- Every queue job must carry tenant ID plus actor or service context.
- Redis keys and object-storage paths must be tenant scoped.
- Provider assets must have an explicit tenant-to-WABA-to-phone mapping.
- Public IDs should be UUIDs or ULIDs; unpredictable IDs do not replace authorization.
- Super Admin administration requires a specific permission, an audit record, and a metadata/aggregate-only response contract.
- Super Admin must not obtain tenant-content access merely by supplying a tenant ID. Tenant-content endpoints require an active Tenant Admin/User principal whose single membership matches the tenant.
- Tenant Admin/User requests must reject any tenant that differs from the authenticated active membership; the UI must not present a tenant switcher for these roles.

Example storage key:

```text
tenants/{tenant_id}/media/{asset_id}
```

Example cache key:

```text
tenant:{tenant_id}:campaign:{campaign_id}
```

## Defense in depth

PostgreSQL Row-Level Security may be added where it is operationally supportable. Whether or not RLS is used, application-level checks remain mandatory. Cross-tenant object references, exports, signed URLs, search, background jobs, realtime subscriptions, and admin tools must all be tested for isolation.

## Session and account controls

- Short-lived access token and rotating refresh token.
- Server-side session/revocation record.
- Revoke sessions after password reset and security events.
- Optional 2FA for users; mandatory 2FA for Super Admin is recommended.
- Rate-limit login and password-reset attempts.
- Log security-sensitive authentication events without recording secrets.
