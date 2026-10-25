import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { TenantScopeService } from "../authorization/authorization.service.js";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { OutboxRepository } from "../database/outbox/outbox.repository.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type { MessagingRepository } from "./messaging.repository.js";
import { MessagingService } from "./messaging.service.js";
import type {
  CreateOutboundMessageInput,
  OutboundMessageRecord,
  OutboundPolicyDecision,
  OutboundPolicySnapshot,
  OutboundTemplateSnapshot,
} from "./messaging.types.js";

void test("creates a free-form message inside the service window and reserves quota once", async () => {
  const harness = createHarness();
  const result = await harness.service.createOutboundMessage(context(), textInput());

  assert.equal(result.status, "CREATED");
  assert.equal(result.idempotent, false);
  assert.equal(harness.state.usageReservations, 1);
  assert.equal(harness.state.outboxEvents, 1);
  assert.equal(harness.state.lastStatus, "CREATED");
  assert.equal(harness.state.lastDecision?.outcome, "ALLOWED");
});

void test("persists a stable policy block when the customer-service window is closed", async () => {
  const harness = createHarness({
    snapshot: { ...policySnapshot(), conversationWindowExpiresAt: "2020-01-01T00:00:00.000Z" },
  });

  await assert.rejects(
    () => harness.service.createOutboundMessage(context(), textInput()),
    hasErrorCode("CUSTOMER_SERVICE_WINDOW_CLOSED"),
  );
  assert.equal(harness.state.lastStatus, "FAILED");
  assert.equal(harness.state.lastDecision?.blockCode, "CUSTOMER_SERVICE_WINDOW_CLOSED");
  assert.equal(harness.state.usageReservations, 0);
  assert.equal(harness.state.outboxEvents, 0);
});

void test("requires opt-in and exact template variables for business-initiated templates", async () => {
  const noConsent = createHarness({
    snapshot: { ...policySnapshot(), contactConsentStatus: "UNKNOWN" },
    template: approvedTemplate(),
  });
  await assert.rejects(
    () => noConsent.service.createOutboundMessage(context(), templateInput()),
    hasErrorCode("CONTACT_OPT_IN_REQUIRED"),
  );

  const invalidVariables = createHarness({ template: approvedTemplate() });
  await assert.rejects(
    () =>
      invalidVariables.service.createOutboundMessage(context(), {
        ...templateInput(),
        content: { templateId: TEMPLATE_ID, type: "TEMPLATE", variables: {} },
      }),
    hasErrorCode("TEMPLATE_VARIABLES_INVALID"),
  );
});

void test("returns the first result for an identical client key without consuming quota twice", async () => {
  const harness = createHarness();
  const input = textInput();
  const first = await harness.service.createOutboundMessage(context(), input);
  assert.ok(harness.state.existing);
  harness.state.existing = {
    ...harness.state.existing,
    errorCode: "PROVIDER_TRANSIENT_FAILURE",
    status: "FAILED",
  };
  const second = await harness.service.createOutboundMessage(context(), input);

  assert.equal(second.id, first.id);
  assert.equal(second.idempotent, true);
  assert.equal(harness.state.usageReservations, 1);
  assert.equal(harness.state.createdMessages, 1);
  assert.equal(harness.state.outboxEvents, 1);
});

void test("rejects reuse of a client key with different normalized content", async () => {
  const harness = createHarness();
  const input = textInput();
  await harness.service.createOutboundMessage(context(), input);

  await assert.rejects(
    () =>
      harness.service.createOutboundMessage(context(), {
        ...input,
        content: { text: "Different content", type: "TEXT" },
      }),
    hasErrorCode("MESSAGE_IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(harness.state.usageReservations, 1);
  assert.equal(harness.state.createdMessages, 1);
});

void test("blocks the message atomically when the monthly reservation limit is reached", async () => {
  const harness = createHarness({ reservedMessages: 10, snapshot: policySnapshot(10) });
  await assert.rejects(
    () => harness.service.createOutboundMessage(context(), textInput()),
    hasErrorCode("MESSAGE_QUOTA_EXCEEDED"),
  );
  assert.equal(harness.state.lastDecision?.quota?.usedBefore, 10);
  assert.equal(harness.state.usageReservations, 0);
});

const TENANT_ID = randomUUID();
const TEMPLATE_ID = randomUUID();

function createHarness(options?: {
  readonly reservedMessages?: number;
  readonly snapshot?: OutboundPolicySnapshot;
  readonly template?: OutboundTemplateSnapshot;
}) {
  const state: {
    createdMessages: number;
    existing?: OutboundMessageRecord;
    lastDecision?: OutboundPolicyDecision;
    lastStatus?: "CREATED" | "FAILED";
    usageReservations: number;
    outboxEvents: number;
  } = { createdMessages: 0, outboxEvents: 0, usageReservations: 0 };
  const repository = {
    acquireCompositionLocks: () => Promise.resolve(),
    audit: () => Promise.resolve(),
    countReservedMessages: () => Promise.resolve(options?.reservedMessages ?? 0),
    createMessage: (
      _transaction: AppDatabaseTransaction,
      _tenantId: string,
      input: CreateOutboundMessageInput,
      _content: Readonly<Record<string, unknown>>,
      decision: OutboundPolicyDecision,
      status: "CREATED" | "FAILED",
      errorCode: string | null,
    ) => {
      const message = {
        clientMessageKey: input.clientMessageKey,
        errorCode,
        id: randomUUID(),
        messageType: input.content.type,
        policyDecision: decision,
        status,
      };
      state.createdMessages += 1;
      state.existing = message;
      state.lastDecision = decision;
      state.lastStatus = status;
      return Promise.resolve(message);
    },
    findByClientMessageKey: () => Promise.resolve(state.existing),
    lockInboxState: () => Promise.resolve({ status: "OPEN", automationState: "NONE" }),
    touchInboxActivity: () => Promise.resolve(),
    findPolicySnapshot: () => Promise.resolve(options?.snapshot ?? policySnapshot()),
    findTemplate: () => Promise.resolve(options?.template),
    reserveUsage: () => {
      state.usageReservations += 1;
      return Promise.resolve();
    },
  } as unknown as MessagingRepository;
  const transactions = {
    execute: <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>) =>
      work({} as AppDatabaseTransaction),
  } as DatabaseTransactionManager;
  const outbox = {
    create: (_transaction: AppDatabaseTransaction, event: { payload: Record<string, unknown> }) => {
      assert.deepEqual(Object.keys(event.payload), ["message_id"]);
      state.outboxEvents += 1;
      return Promise.resolve({});
    },
  } as unknown as OutboxRepository;
  return {
    service: new MessagingService(repository, transactions, new TenantScopeService(), outbox),
    state,
  };
}

function context(): AuthorizationContext {
  return {
    actorId: randomUUID(),
    email: "admin@example.test",
    isPlatformActor: false,
    permissions: new Set(["conversation.reply"]),
    requestId: randomUUID(),
    roleId: randomUUID(),
    roleName: "Tenant Admin",
    roleSystemKey: "TENANT_ADMIN",
    sessionId: randomUUID(),
    tenantId: TENANT_ID,
  };
}

function textInput(): CreateOutboundMessageInput {
  return {
    clientMessageKey: "inbox:test-message-1",
    contactId: randomUUID(),
    content: { text: "Hello", type: "TEXT" },
    conversationId: randomUUID(),
    source: "INBOX",
    whatsappAccountId: randomUUID(),
  };
}

function templateInput(): CreateOutboundMessageInput {
  return {
    clientMessageKey: `inbox:template-${randomUUID()}`,
    contactId: randomUUID(),
    content: { templateId: TEMPLATE_ID, type: "TEMPLATE", variables: { "1": "Sai" } },
    conversationId: randomUUID(),
    source: "INBOX",
    whatsappAccountId: randomUUID(),
  };
}

function policySnapshot(limit = 100): OutboundPolicySnapshot {
  return {
    accountCredentialStatus: "ACTIVE",
    accountStatus: "CONNECTED",
    contactConsentStatus: "OPTED_IN",
    conversationWindowExpiresAt: "2999-01-01T00:00:00.000Z",
    planLimits: { monthly_message_limit: limit },
    planStatus: "ACTIVE",
    subscriptionStatus: "ACTIVE",
    tenantStatus: "ACTIVE",
  };
}

function approvedTemplate(): OutboundTemplateSnapshot {
  return {
    approvalStatus: "APPROVED",
    approvedVersion: 2,
    category: "MARKETING",
    components: [{ text: "Hello {{1}}", type: "BODY" }],
    contentVersion: 2,
    id: TEMPLATE_ID,
    language: "en_US",
    name: "hello_customer",
    providerStatus: "APPROVED",
  };
}

function hasErrorCode(expected: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && "code" in error && error.code === expected;
}
