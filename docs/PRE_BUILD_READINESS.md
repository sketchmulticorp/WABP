# Pre-build Readiness

Status: Documentation present; owner sign-off pending  
Last reviewed: 2026-10-08

## Decision

Keep these artifacts in the existing `docs` folder. They are product and delivery documents used across frontend, backend, data, security, and operations. The `design-doc` folder remains reserved for detailed engineering designs such as the backend/PostgreSQL LLD.

## Required planning artifacts

| Required artifact | Question it answers | Canonical project document(s) | Current status |
|---|---|---|---|
| Product requirements | What is being built, for whom, and what counts as successful? | `PRD.md`, `01-functional-requirements.md`, `13-testing-and-acceptance.md` | Documented; product-owner sign-off pending |
| Technical requirements | What stack, integrations, hosting, security, and operating constraints are fixed? | `ARCHITECTURE.md`, `04-system-architecture.md`, `07-whatsapp-provider-integration.md`, `10-security-privacy-and-compliance.md`, `16-railway-deployment-and-capacity.md` | Documented; technical sign-off pending |
| Application flow | What follows every important screen action, including failures? | `APP_FLOWS.md`, `03-user-experience-and-screen-map.md` | Documented; product/UX sign-off pending |
| Design brief | How should screens and reusable elements look and behave? | `DESIGN.md` | Foundation documented; final brand name/logo assets remain an owner input |
| Database schema | What data is stored, how is it related, and how is tenant access controlled? | `05-domain-and-data-model.md`, `../design-doc/MVP_BACKEND_LLD.md` | MVP LLD documented; Drizzle ORM/drizzle-kit approved; executable migration is Gate 2 work |
| Implementation plan | What is built in which order, with what acceptance and approval points? | `IMPLEMENTATION_PLAN.md`, `../TASKS.md` | Documented; Gate 0 sign-off pending |

## Scope check

- Included: Contacts and Groups.
- Excluded: Tags and Lead CRM.
- Excluded unless approved by change control: AI, white-labeling, native mobile applications, public customer APIs, broad third-party integrations, and unofficial WhatsApp Web automation.
- Official Meta WhatsApp Business Platform integration is mandatory.
- MVP capacity target remains 1,000-1,200 registered/daily users, with the documented concurrency and load-test assumptions.

## Inputs still required from the owner

These are decisions or assets, not reasons to create another documentation folder:

- Final product/brand name and logo files/usage rules before production visual polish.
- Initial plan limits, quota behavior, and commercial pricing before plan enforcement is finalized.
- Launch Railway region and any contractual data-residency requirement.
- Retention periods, backup retention, RPO, and RTO before production readiness approval.
- Meta development/production application access and the exact partner/onboarding arrangement.

## Start-building rule

Gate 1 repository work may begin after the owner reviews the MVP scope, stack, critical flows, and stage plan. A later gate must not start while an unresolved decision blocks that gate. Security, tenant isolation, consent/opt-out enforcement, provider policy, and database access controls cannot be waived for schedule reasons.

## Gate 0 sign-off checklist

- [ ] I agree with the users, MVP capabilities, success criteria, and exclusions in the PRD.
- [ ] I agree with Next.js + NestJS + PostgreSQL + Redis/BullMQ + object storage on Railway Pro.
- [ ] I have reviewed the critical actions, next screens, errors, and recovery paths in `APP_FLOWS.md`.
- [ ] I agree with the design direction or have supplied required brand corrections/assets.
- [ ] The technical owner has reviewed the backend/PostgreSQL LLD and tenant-isolation model.
- [ ] I agree with the build stages and approval points in `IMPLEMENTATION_PLAN.md`.

When all six are checked, record Gate 0 approval in `IMPLEMENTATION_PLAN.md` and begin `TASK-010`.
