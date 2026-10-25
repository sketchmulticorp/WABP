# ADR-021 — REST polling for the first Inbox release

Date: 2026-10-16. Status: Accepted by owner (CLAR-035).

## Context and options

The MVP has authorized Inbox REST APIs but no Inbox screen or push infrastructure.
The owner requested finishing usable core workflows before deeper infrastructure work.
The LLD left SSE/WebSocket selection open; TASK-064 explicitly permits a polling fallback.

Polling reuses the existing authentication and query boundaries, at the cost of periodic
request load and refresh latency. SSE would provide one-way push but needs authenticated
long-lived connections, authorization/reconnect handling and event publication. WebSocket
adds bidirectional connection handling not required for these read updates.

## Decision

Use a browser-local, visible/online, 15-second REST refresh foundation for the first Inbox.
Reuse the existing APIs, not a new synchronization endpoint or provider subscription.
Coalesce triggers, cancel/discard obsolete reads, back off transient errors and stop on
non-retryable authorization/request failures. Keep token rotation single-flight within
the same JavaScript runtime. No new dependency, schema or deployment service.

TASK-064 delivers the adapter/hook; TASK-066 mounts it into the actual Inbox, explicitly
refreshing after local actions and reconciling server data after focus/reconnect. This ADR
does not claim that the absent UI already polls or that runtime behavior is test-verified.
Detailed integration rules are in `INBOX_REFRESH.md`.

## Consequences and boundaries

- This is near-real-time polling, not instant server push. Cadence is after completion,
  not overlapping fixed-interval requests. Hidden/offline tabs do not poll.
- Backend tenant/permission guards remain authoritative on every request.
- Same-runtime token coordination is not cross-tab/device synchronization. Session
  rotation across multiple tabs remains a specific acceptance/security review item.
- Measure deployed request volume before broad rollout; no 1,200-user capacity claim.
  Request volume depends on visible users, endpoints refreshed and cadence, not registered
  user count alone. The local preflight benchmark says nothing about polling capacity.
- Keep PostgreSQL authoritative. Existing workers do not publish browser push events for
  this release. SSE/WebSocket/event-publisher diagrams in broader design describe future
  options, not required new infrastructure ahead of the initial Inbox.
- Revisit push only when measured latency/load or an approved product need justifies it;
  no gateway, broker or generic transport abstraction is built speculatively.
