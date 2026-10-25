# Outbound delivery and recovery (TASK-052)

The service revalidates live tenant/subscription/plan/account/credential, active Contact,
opt-out, service-window and exact template approval/version before each submission.
It commits a row-locked SENDING claim before calling Meta outside the transaction.
It then stores normalized provider_message_id, SENT and sent_at (local acceptance time).
DELIVERED/READ require verified webhook evidence. Campaign dispatch remains blocked
until TASK-053–055 supplies approval/recipient workflows.

Delivery metadata lives under policy_decision.delivery; composition outcome/fingerprint,
quota and template evidence remain unchanged. Retry/replay adds no usage reservation
and does not refund prior reservations.

Five total attempts use 1000ms exponential delay plus up to 100% jitter. Longer
Retry-After takes precedence. MESSAGE_MAX_ATTEMPTS and MESSAGE_RETRY_BASE_DELAY_MS
configure these limits. RATE_LIMITED/TRANSIENT rejection retries; permanent failures
and UNKNOWN acceptance end in FAILED. Exhaustion uses MESSAGE_DELIVERY_RETRIES_EXHAUSTED
with a safe original code. FAILED is the durable dead-letter record; retained failed
BullMQ jobs are transport diagnostics.

The job ID includes the Message and durable event IDs. Duplicate relay publication
deduplicates; explicit replay creates a new generation. Redis contains only messageId.
Worker consumption is enabled by default; replay commands disable all consumers and
the message relay in their own process.
Worker development follows the API's Nest CLI TypeScript watch runner so constructor
metadata is emitted. Replay scripts compile then execute JavaScript for the same reason.

## Unknown acceptance

A network timeout, malformed successful response, crash after submission or database
failure after acceptance cannot prove that Meta rejected the send. Network/malformed
acceptance is FAILED with WHATSAPP_PROVIDER_UNKNOWN and excluded from replay. Crash
or acceptance-persistence gaps leave SENDING for trusted operational review. Never
manually reset these rows to QUEUED without reconciling acceptance. Exactly-once
external delivery is not claimed; a local idempotency key is not a provider guarantee.

## Private replay

Run from the repository root using development/test credentials first:

```powershell
pnpm --filter @whatsapp-platform/worker message:replay <tenant-uuid> <message-uuid>
```

Only confirmed retryable FAILED rows without provider IDs qualify. Reset, new
identifier-only outbox event and redacted audit evidence commit together. The normal
worker revalidates policy again. Accepted sends, webhook delivery failures and UNKNOWN
or SENDING messages cannot be replayed. Output contains only success/eligibility.
This command is restricted to trusted operators with worker/database credentials;
it is not a Super Admin customer-content endpoint.

## Provider boundary and limitations

packages/whatsapp-provider is the single server-only API/worker implementation. The
adapter uses POST /{phone-number-id}/messages with a 30-second deadline. It supports
TEXT and TEMPLATE text HEADER/BODY parameters (positional/named). Unsupported media
headers/buttons fail closed. Only normalized acceptance/errors persist, never raw
responses or credentials. The existing development credential reference is preserved;
production credential ownership and Embedded Signup remain deferred.

HTTP rejection and Graph is_transient=true are normalized. Numeric code mappings
outside this verified boundary remain conservative: non-transient HTTP 4xx is terminal
validation until a reviewed numeric mapping is added. Retry-After supports seconds
and HTTP dates.

Primary references: [Meta send endpoint](https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message),
[Meta template payload](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/),
[Meta SDK transient field](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/exceptions.py).
The archived SDK is only a payload reference; no SDK dependency was added. Meta's
current developer message/error pages returned HTTP 429 during this inspection.

## Local verification

```powershell
pnpm check
pnpm schema:test:integration
pnpm --filter @whatsapp-platform/worker test:messaging:integration
```

Tests use fake provider responses, rolled-back PostgreSQL fixtures and a unique Redis
test prefix. They send no real WhatsApp messages. Test integration credentials must
never point to production.
