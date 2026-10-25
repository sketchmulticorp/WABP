# ADR-019: Shared provider and durable outbound delivery

Status: Approved, 2026-10-13 (TASK-052).

API and worker share one server-only `whatsapp-provider` package. Delivery persists
SENDING before contacting Meta and stores only normalized acceptance/error metadata.
Five total attempts use exponential jitter and honor longer Retry-After delays.
Only explicit rate/transient rejection is retryable. Unknown outcomes (network timeout,
malformed acceptance, crash after submission) must never be automatically resent:
durable SENDING state or FAILED ambiguity codes require operational reconciliation.
Meta request correlation is not a verified provider idempotency guarantee.

Terminal failures use existing FAILED state; no database migration is required.
Private replay accepts explicitly retryable terminal failures without provider IDs,
uses a new durable outbox event, and revalidates current policy before sending.
It cannot replay ambiguous acceptance, webhook delivery failures, or accepted sends.
Usage reservations remain counted; replay adds no quota reservation.

Related TASK-056 delivery tests belong to TASK-052 acceptance. Campaign TASK-053 stays
separate. TEMPLATE sending supports text header/body parameters; unsupported media,
interactive, or button parameter requirements fail closed before submission.
