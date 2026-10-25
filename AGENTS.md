# Codex Project Instructions

## Required context

Before changing code, read the files relevant to the task. For any feature or cross-cutting change, begin with:

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `design-doc/MVP_BACKEND_LLD.md`
4. `RULES.md`
5. `TASKS.md`
6. `docs/MEMORY.md`

Also read `docs/DESIGN.md` for UI work, `docs/SECURITY.md` for authentication/data/provider work, and `docs/TEST_PLAN.md` before changing acceptance coverage.

## Scope rules

- Contacts and Groups are included.
- Tags are excluded.
- Lead CRM is excluded.
- Use only official WhatsApp Business Platform APIs and webhooks.
- Do not introduce unofficial WhatsApp Web automation.
- Do not replace the approved Next.js/NestJS/Railway architecture without an ADR and user approval.

## Execution rules

- Work from one `TASKS.md` item at a time.
- When implementation, debugging, or an approved design decision uncovers necessary work that is directly related to the active task, record it before doing the work. Add it as an explicitly numbered subtask of the active task when it is required for that task's acceptance criteria; otherwise add a separately numbered follow-up task immediately after the related task or at the end of the appropriate phase. Do not use this rule to introduce speculative features or bypass required approval for material changes.
- Before proposing a material solution, use established, proven engineering patterns as the starting point. Inspect the repository and applicable authoritative documentation; identify the actual problem, constraints, failure modes, security and tenancy boundaries, and operating scale; compare realistic options and their trade-offs; then recommend the smallest robust solution that fits the approved architecture. Do not present novelty, personal preference, or an unverified assumption as a requirement. Explain why the recommendation fits this application before requesting implementation approval.
- Before frontend or backend code changes, confirm the requested problem, scope, acceptance criteria, and approval status. An explicit instruction such as `start TASK-014` approves only the scope already documented for that task.
- Never invent a missing requirement, user flow, API/provider behavior, data rule, failure policy, or acceptance criterion. Ask the user when an unresolved answer could materially change behavior, security, data, UX, contracts, dependencies, cost, or scope, and wait for approval before implementing that branch.
- If no material ambiguity exists because the answer is already present in approved documentation, state that no clarification is required and proceed within the approved scope. Do not ask the user to reconfirm decisions that are already recorded.
- If material uncertainty appears during implementation, pause the affected work, explain what was discovered, ask a focused question with concrete options or tradeoffs, and resume only after the answer is approved.
- State the plan before a material change.
- Prefer vertical slices that complete one user flow across UI, API, database, queue, and tests.
- Reuse existing modules and contracts; do not create a second implementation path.
- Keep tenant authorization, plan enforcement, policy checks, and idempotency server-side.
- Do not modify unrelated files.
- Defer creating/updating test files and executing automated tests until phase implementation is complete. Record pending cases during each task. Run relevant formatting, lint, typecheck, schema checks, and build during implementation; reserve test-containing commands such as `pnpm check` for phase closure.
- Test-file creation/updates and automated test execution are optional while implementation tasks remain unfinished. At each phase boundary, ask the owner whether to write/run tests now or defer them to a later phase. Wait for the answer before testing; deferral does not block the next implementation phase. Record the choice and pending coverage. When approved, write full coverage, run applicable suites, fix failures, retest, and update records. At completion of all implementation tasks, revisit every deferred test item with the owner. Never label deferred coverage as verified or production-ready.
- Report files changed, behavior implemented, verification performed, and remaining issues.
- Update `docs/MEMORY.md`, `TASKS.md`, and relevant permanent documentation after material work.
- Record material clarification questions, user answers, approval, and the implemented resolution in `docs/CLARIFICATION_DECISION_LOG.md`. Use `docs/DECISIONS.md` as the ADR index when the answer changes a binding architecture decision.

## Engineering standard

- Act as a senior full-stack engineer for every feature, bug fix, refactor, review, and technical decision.
- Follow the repository structure, dependency-direction, pragmatic SOLID, naming, documentation, and commenting rules in `RULES.md`.
- Keep route/page files, controllers, queue processors, and framework entry points thin; place business behavior in focused feature/domain services.
- All backend features must use strict Controller-Service-Repository layering. Controllers handle HTTP/transport only and call services; services own business rules, workflow orchestration, transactions, policy checks, and external-adapter coordination; repositories alone use Drizzle, ORM models, raw SQL, or database clients. Controllers and queue processors must never call repositories directly.
- Use constructor dependency injection from repository to service and service to controller. Do not collapse these layers into one file or bypass a layer unless the owner explicitly approves an exception and the decision is recorded.
- When presenting backend code in responses, separate Controller, Service, and Repository/Entity code clearly. Add brief comments only where they explain a non-obvious layer responsibility or data flow.
- Prefer clear code and explicit types. Add comments or documentation where they explain purpose, intent, constraints, security reasoning, or a non-obvious tradeoff; do not add comments that merely repeat the code.
- Record material architecture, dependency, persistence, security, provider, or deployment decisions in the relevant permanent documentation and an ADR when required.
