# MVP delivery priorities

Status: Owner-approved delivery correction, 2026-10-15 (CLAR-030).

## Goal

Deliver a usable end-to-end application before investing further in speculative scale,
advanced features or infrastructure refinements. Senior engineering means solving the
current business problem safely with the smallest understandable implementation, not
building every possible extension or proving every possible failure scenario first.

This changes delivery priority and testing checkpoints, not the approved architecture,
business rules or existing implementation. Where older documents imply that every scale
exercise must finish before the next feature, this policy supersedes that sequencing.
Historical results and unverified cases must remain visible.

## Keep and finish

- Keep Next.js, NestJS, PostgreSQL/Drizzle, Redis/BullMQ and Railway. Reuse the existing
  modular monolith and common messaging pipeline; do not redesign or remove working code.
- Preserve strict Controller-Service-Repository layering, readable code and pragmatic SOLID.
- Complete essential existing flows: business/team access, Contacts/static Groups/import,
  templates and approvals, campaigns, shared inbox/replies, basic automation/handoff,
  basic usage/billing/audit visibility and deployment.
- Basic automation remains in the approved MVP. Advanced flow authoring, saved segments,
  advanced analytics, microservices and other already-deferred features are not needed
  to complete the first usable product. No new feature scope is approved here.
- Reuse foundations already delivered. Inspect existing webhook resolution before TASK-060,
  existing usage/policy handling before TASK-080, and similar prior work before adding code.
  Implement the actual gap, not a second version of a solved capability.

## Delivery order

1. Continue one approved core task at a time, next TASK-060 and the remaining inbox slice.
2. Complete the existing basic automation and essential admin/reporting workflows.
3. Exercise the complete application with the owner's Meta development/test account:
   connection, approved template, consented test Contact, User review, campaign, delivery
   status, inbound inbox message, authorized reply and basic handoff.
4. Complete a focused pre-launch security, data-integrity and operational review; deploy
   and obtain owner UAT/launch approval for a limited initial workload.
5. Run extended scale/fault-injection work before expanding to the workload it certifies.

This document does not start TASK-060, authorize live sends, select a polling/realtime
transport, resolve production Meta onboarding, or approve a production release. Those
choices retain their existing task-specific approval requirements.

## Testing boundaries

### Required before real customer use

- Verify authentication/session behavior, tenant isolation and Super Admin content denial.
- Verify exact-version campaign/template approval, consent/STOP handling, provider rules,
  quota enforcement, webhook verification and duplicate-send protection.
- Resolve critical/high security or data-loss defects. Verify safe treatment of ambiguous
  provider acceptance; never blindly resend an uncertain submission.
- Check representative pause/cancel, retry, report and import behavior at the intended
  initial workload. Finish incomplete critical user journeys, including real Meta test-asset
  integration and UI/API wiring; API-double browser tests alone are insufficient.
- Verify secrets, production configuration, migrations, backup/restore, basic monitoring,
  health checks and recovery procedures. Confirm the launch workload and provider readiness.

TASK-084/086 own the focused review/UAT checkpoints. Remaining safety-relevant Phase 5
cases stay traceable through TASK-056.3 and the Phase 5 report until resolved. They do not
block unrelated feature development, but are not waived for launch.

### Later hardening and scale validation

Full 100,000-message dispatch, exhaustive worker/Redis/database outage injection, extensive
cancel/claim race stress, deadlock injection, month-boundary stress and exhaustive browser
matrices are not prerequisites for starting the next core feature. TASK-085 owns extended
load/failure validation. Address representative correctness risks in the focused launch
review; defer exhaustive stress breadth, not the underlying safety guarantee.

The 1,000–1,200-user objective remains a capacity target, not a verified claim. Do not admit
that workload, advertise measured capacity, or raise delivery limits based only on a local
100,000-contact preflight. Verify representative deployed workload before scaling up.

Continue the owner-approved phase testing cadence: record pending cases during tasks,
run relevant static/build checks, and ask at phase boundaries before writing/running tests.
An approved checkpoint should target core acceptance and affected regressions; extended
hardening is tracked separately. Never erase tests or relabel PARTIAL/PENDING as PASS.

## Scope-control rule

Before proposing extra engineering, identify the current user journey, demonstrated defect
or launch-safety requirement it serves. If none exists, record a short later follow-up
instead of implementing it. New dependencies, schema/contract changes, infrastructure and
material product choices still require the established clarification/approval process.
Do not generate speculative backlog items merely because an improvement is possible.
