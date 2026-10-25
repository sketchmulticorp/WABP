# ADR-020 — Reuse campaign application services in the worker

Date: 2026-10-15. Context: approved TASK-055 / CLAR-027 requires campaigns to use the existing
message composer, quota reservation and outbox while continuing independently of HTTP.

Decision: expose a server-only API workspace subpath, `@whatsapp-platform/api/campaign-runtime`,
for a Nest module with the campaign execution service, common MessagingService and repositories.
The worker imports it and owns the thin scheduler timer; no HTTP/auth controller is started.
Controllers and timers call services, and repositories remain the only data-access layer.

Alternatives: duplicating message composition in the worker would produce two policy paths.
Internal HTTP calls would couple durable work to API availability and introduce service-auth
contracts. Extracting the entire database/auth/messaging stack into a new package is a larger
refactor than this slice requires. A narrow workspace export reuses the existing implementation.

Consequences: worker builds depend on the API build, and worker deployments include API runtime
dependencies. The runtime module owns a separate bounded database pool; connection budgeting
must include it. Browser contracts do not import this entry point. The approved separate web,
HTTP API, and worker process topology is unchanged.

Campaign state and preflight runs remain durable PostgreSQL records. Final preflight and
message jobs use existing outbox/BullMQ transports; message content and credentials remain out
of Redis. Start identity persists for the campaign lifetime, and recipient message keys plus
transactional links prevent duplicate composition.
