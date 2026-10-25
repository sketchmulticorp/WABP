# Delivery Roadmap, Risks, and Open Decisions

## Delivery order

### Foundation

1. Confirm Meta partner/business/app strategy and production permissions.
2. Prepare privacy, terms, support, deletion URLs, business verification, and App Review assets.
3. Establish a pnpm/Turborepo monorepo with separate Next.js `web`, NestJS `api`, and NestJS/BullMQ `worker` applications, followed by environments, CI/CD, infrastructure, and secrets management.
4. Implement authentication, sessions, RBAC, tenant context, and audit foundation.
5. Create PostgreSQL schema, migrations, object storage, Redis/queue, and observability baseline.
6. Implement provider adapter skeleton and contract-test framework.

### MVP integration and communication

7. Embedded Signup and tenant-WABA-phone mapping.
8. Account, phone, and template synchronization with health diagnostics.
9. Verified webhook gateway, persistence, dedupe, and event processors.
10. Outbound messaging pipeline, policy/quota gate, queue, workers, and state machine.
11. Contacts, groups, consent, and asynchronous CSV/XLSX import.
12. Template views, preview, validation, and allowed management.
13. Campaign builder, preflight, scheduler, dispatch, reports, and exports.
14. Shared inbox, realtime updates, human reply, notes, and assignment.
15. Basic buttons/lists, auto-replies, versioned automation, and human handoff.
16. Plans, entitlements, usage ledger, basic dashboards, reports, and audit views.
17. Security, load, failure, UAT, operational runbooks, and production readiness.

### Phase 2

- Drag-and-drop flow builder, conditions, durable delays, version analytics.
- Advanced team assignments and routing.
- WhatsApp Flows.
- Media library and advanced reports.
- Customer API, outbound webhooks, and external integrations.

### Phase 3

- AI reply suggestions and conversation summaries.
- AI FAQ/chatbot assistance.
- AI campaign drafting.
- Advanced sales pipeline and analytics.
- White-label capabilities.

AI must remain assistive and controlled until privacy, policy, cost, evaluation, and failure-handling requirements are approved.

## Primary risks

| Risk | Mitigation |
|---|---|
| Meta onboarding/App Review delay | Start readiness first; prepare legal/support/test assets early |
| Client policy violations | Consent, suppression, abuse monitoring, terms, suspension controls |
| Provider API changes | Adapter, centralized version, contract tests, staged upgrades |
| Duplicate sends/events | Idempotency, dedupe, transactional handoff, state machines |
| Cross-tenant leak | Scoped authorization, tenant predicates/RLS option, security tests |
| Queue overload | Per-tenant limits, backpressure, autoscaling, DLQ, alerts |
| Token compromise | Secrets manager, encryption, rotation, redaction, no browser exposure |
| Large imports | Async parsing, batching, size limits, row reporting |
| High support load | Connection diagnostics, clear errors, health screens, runbooks |
| Billing/provider price changes | Separate ledgers and configurable pricing adapters |
| Automation race conditions | Version pinning, locks, persisted state, idempotent side effects |

## Open decisions before production implementation

### Product and commercial

- Exact meaning and scope of the Admin role: internal manager, reseller, or client administrator.
- Initial plan limits, pricing, trial/grace rules, overages, and downgrade behavior.
- Initial countries, currencies, taxes, invoices, and payment gateway.
- Whether billing/subscriptions are part of MVP.
- Initial customer API and integration scope.

### Meta/provider

- Approved partner arrangement and exact Embedded Signup path.
- Required Meta permissions, Advanced Access, business verification, and App Review plan.
- Supported WhatsApp account/phone types and countries at launch.
- Provider API version selected for implementation.

### Security, privacy, and operations

- Launch region and data-residency choice within the approved Railway Pro hosting platform.
- Data residency requirements.
- Retention for messages, contacts, media, imports, audit, and webhook events.
- RPO, RTO, availability and support targets.
- Mandatory 2FA populations and employee support-access workflow.
- Backup retention and deletion/export workflows.

## Resolved MVP deployment decisions

- Use Railway Pro as the single MVP ecosystem.
- Deploy separate Next.js `web`, NestJS `api`, NestJS/BullMQ `worker`, and singleton `scheduler` services.
- Use Railway PostgreSQL, Redis, private networking, and S3-compatible Buckets.
- Design and load-test for 1,000-1,200 registered/daily users and 100-300 concurrent active users.
- Begin with one replica per application service; move to two API and two worker replicas when production measurements or availability requirements justify it.
- Keep Meta WhatsApp APIs external; their throughput and policy limits remain independent of Railway capacity.

### Engineering

- Final validation library, job scheduler details, realtime transport, observability, and secrets products.
- Whether and where PostgreSQL Row-Level Security is enabled.
- Exact idempotency retention and transactional outbox implementation.
- Message/event table partition thresholds.
- Limits for uploads, imports, API requests, queues, and concurrency.

### AI

- AI provider, regional/privacy terms, model access, budget, retention, redaction, evaluation, and human review.
- Whether a specialized Python AI/data service is justified. Python should not replace the NestJS core backend solely to support future AI features.

## Change control

Any change to official-provider use, tenant isolation, policy gates, credential handling, auditability, idempotency, or MVP acceptance criteria requires architecture and security review. Scope additions should identify their phase, dependencies, data impact, operational impact, and acceptance tests.
