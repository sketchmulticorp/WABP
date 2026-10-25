# Requirements Traceability

This matrix maps the major source-specification areas to the maintained documentation set. It is intended as a coverage check, not as a replacement for detailed acceptance tests.

| Requirement area | Primary documentation |
|---|---|
| Product positioning, goals, hierarchy, scope | [Product vision and scope](00-product-vision-and-scope.md) |
| Super Admin, Tenant Admin, Tenant User, and approval workflow | [Functional requirements](01-functional-requirements.md) |
| Role matrix, permissions, tenant isolation | [Roles, permissions, and tenancy](02-roles-permissions-and-tenancy.md) |
| Screen map and core journeys | [User experience and screen map](03-user-experience-and-screen-map.md) |
| Modular monolith, workers, storage, realtime | [System architecture](04-system-architecture.md) |
| Entities, constraints, consent, message states | [Domain and data model](05-domain-and-data-model.md) |
| Internal REST API and standards | [API contracts](06-api-contracts.md) |
| Cloud API, Business Management API, Embedded Signup, Flows | [WhatsApp provider integration](07-whatsapp-provider-integration.md) |
| Campaign queue, policy gate, webhooks, reporting | [Messaging, campaigns, and webhooks](08-messaging-campaigns-and-webhooks.md) |
| Shared inbox, automation graph, and human handoff | [Inbox and automation](09-inbox-and-automation.md) |
| Authentication, file safety, privacy, policy, audit | [Security, privacy, and compliance](10-security-privacy-and-compliance.md) |
| Plans, subscription, usage ledger, billing separation | [Plans, usage, and billing](11-plans-usage-and-billing.md) |
| Deployment, monitoring, backup, scaling, retries | [DevOps, reliability, and observability](12-devops-reliability-and-observability.md) |
| Test levels, critical scenarios, acceptance | [Testing and acceptance](13-testing-and-acceptance.md) |
| Development phases, risks, decisions | [Roadmap, risks, and open decisions](14-roadmap-risks-and-open-decisions.md) |
| Railway topology, capacity, scaling, cost controls | [Railway deployment and capacity](16-railway-deployment-and-capacity.md) |

## Source reconciliation notes

- The technical document v3.0 refines the earlier product specification v1.0. Where it provides a concrete implementation decision, this baseline uses it unless the decision remains explicitly open.
- The product specification lists broad CSV/XLS/XLSX import support; the technical baseline selects CSV and XLSX initially. Legacy XLS is therefore not in the initial technical baseline and can be added by decision.
- The product specification describes API/integrations as a capability; the technical roadmap places customer-facing API and integrations after the core MVP.
- The technical MVP includes basic automation and human handoff, while the advanced visual builder remains Phase 2.
- Billing data structures and plan enforcement are foundational, while a payment gateway remains optional until the commercial decision is finalized.
- AI and white-label capabilities are Phase 3 and must not delay a reliable compliant core.

## Baseline sources

- `WhatsApp_Marketing_CRM_Automation_Platform_Specification.pdf` - Product Specification v1.0, 12 pages.
- `WhatsApp_SaaS_Master_Technical_Document.pdf` - Master Technical Document v3.0, 20 pages, October 2026.
