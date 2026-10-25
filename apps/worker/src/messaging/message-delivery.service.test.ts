import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import {
  type MetaWhatsAppProviderAdapter,
  WhatsAppProviderError,
} from "@whatsapp-platform/whatsapp-provider";
import type { MessageDeliveryRepository } from "./message-delivery.repository.js";
import {
  MessageDeliveryError,
  MessageDeliveryService,
  CampaignDeliveryDeferred,
} from "./message-delivery.service.js";
import type { MessageTransactionManager } from "./message-transaction.manager.js";
import type { DeliverySnapshot, DeliveryFailure } from "./message-delivery.types.js";
import { templateContent } from "./message-dispatch.policy.js";

function snapshot(): DeliverySnapshot {
  return {
    id: "5af939b3-4022-48ef-8c65-a101c3c3799c",
    tenant_id: "tenant",
    status: "QUEUED",
    message_type: "TEXT",
    campaign_id: null,
    provider_message_id: null,
    content: { text: "Hello" },
    policy_decision: { outcome: "ALLOWED", source: "INBOX" },
    tenant_status: "ACTIVE",
    phone_e164: "+919876543210",
    consent_status: "OPTED_IN",
    window_expires_at: new Date(Date.now() + 3600000).toISOString(),
    account_status: "CONNECTED",
    credential_status: "ACTIVE",
    secret_ref: "env://test",
    whatsapp_account_id: "account",
    phone_number_id: "123",
    subscription_status: "ACTIVE",
    plan_status: "ACTIVE",
    template: null,
  };
}
function harness(record = snapshot(), providerError?: Error, persistFails = false) {
  let sends = 0;
  const writes: string[] = [];
  const failures: DeliveryFailure[] = [];
  const repository = {
    findForDispatch: () => Promise.resolve(record),
    markSending: () => {
      record = { ...record, status: "SENDING" };
      writes.push("SENDING");
      return Promise.resolve();
    },
    markAccepted: () => {
      if (persistFails) return Promise.reject(new Error("DB unavailable"));
      record = { ...record, status: "SENT", provider_message_id: "wamid.test" };
      writes.push("SENT");
      return Promise.resolve();
    },
    markFailure: (_session: PoolClient, _record: DeliverySnapshot, failure: DeliveryFailure) => {
      failures.push(failure);
      record = { ...record, status: failure.retryable && !failure.exhausted ? "QUEUED" : "FAILED" };
      return Promise.resolve();
    },
  } as unknown as MessageDeliveryRepository;
  const transactions = {
    execute: <T>(work: (session: PoolClient) => Promise<T>) => work({} as PoolClient),
  } as MessageTransactionManager;
  const provider = {
    sendTemplate: () => {
      sends++;
      return Promise.resolve({
        providerMessageId: "wamid.template",
        acceptedAt: new Date().toISOString(),
      });
    },
    sendText: () => {
      sends++;
      if (providerError !== undefined) return Promise.reject(providerError);
      return Promise.resolve({
        providerMessageId: "wamid.test",
        acceptedAt: new Date().toISOString(),
      });
    },
  } as unknown as MetaWhatsAppProviderAdapter;
  const config = { messaging: { maxAttempts: 5, retryBaseDelayMs: 1000 } } as RuntimeConfig;
  return {
    service: new MessageDeliveryService(repository, transactions, provider, config),
    writes,
    failures,
    sends: () => sends,
  };
}
function campaignSnapshot(): DeliverySnapshot {
  return {
    ...snapshot(),
    campaign_id: "campaign",
    message_type: "TEMPLATE",
    content: { name: "hello", language: "en_US", variables: { "1": "World" } },
    policy_decision: {
      outcome: "ALLOWED",
      source: "CAMPAIGN",
      template: { contentVersion: 1 },
      campaign: { contentVersion: 1, templateContentVersion: 1 },
    },
    campaign: {
      status: "RUNNING",
      contentVersion: 1,
      templateContentVersion: 1,
      approvalStatus: "APPROVED",
      approvedVersion: 1,
      reviewerActive: true,
      senderActive: true,
    },
    template: {
      name: "hello",
      language: "en_US",
      content_version: 1,
      provider_status: "APPROVED",
      approval_status: "NOT_REQUIRED",
      components: [{ type: "BODY", text: "Hello {{1}}" }],
    },
  };
}
void test("automation dispatch blocks revoked publisher, version/account changes, pause and human takeover", async () => {
  const automation = {
    entitled: true,
    publisherActive: true,
    publisherId: "publisher",
    versionId: "version",
    accountId: "account",
    flowStatus: "ACTIVE",
    runStatus: "WAITING",
    conversationState: "ACTIVE",
  };
  const record: DeliverySnapshot = {
    ...snapshot(),
    automation,
    policy_decision: {
      outcome: "ALLOWED",
      source: "AUTOMATION",
      automation: { publisherId: "publisher", versionId: "version" },
    },
  };
  const good = harness(record);
  await good.service.process("automation-message");
  assert.equal(good.sends(), 1);
  for (const patch of [
    { entitled: false },
    { publisherActive: false },
    { publisherId: "other" },
    { versionId: "other" },
    { accountId: "other" },
    { flowStatus: "PAUSED" },
    { runStatus: "HANDED_OFF" },
    { conversationState: "HANDED_OFF" },
  ]) {
    const blocked = harness({ ...record, automation: { ...automation, ...patch } });
    await assert.rejects(blocked.service.process("automation-message"), MessageDeliveryError);
    assert.equal(blocked.sends(), 0);
    assert.ok(blocked.failures.length > 0);
  }
});
void test("campaign delivery rechecks versions, reviewer/sender access, opt-out and cancellation", async () => {
  const good = harness(campaignSnapshot());
  await good.service.process("campaign-message");
  assert.equal(good.sends(), 1);
  for (const patch of [
    { status: "CANCELLED" },
    { contentVersion: 2 },
    { templateContentVersion: 2 },
    { reviewerActive: false },
    { senderActive: false },
  ]) {
    const base = campaignSnapshot();
    const h = harness({ ...base, campaign: { ...base.campaign, ...patch } });
    await assert.rejects(h.service.process("campaign-message"), MessageDeliveryError);
    assert.equal(h.sends(), 0);
  }
  const optedOut = harness({ ...campaignSnapshot(), consent_status: "OPTED_OUT" });
  await assert.rejects(optedOut.service.process("campaign-message"), MessageDeliveryError);
  assert.equal(optedOut.sends(), 0);
});
void test("paused campaign defers before SENDING without a failure or provider attempt", async () => {
  const base = campaignSnapshot();
  const h = harness({ ...base, campaign: { ...base.campaign, status: "PAUSED" } });
  await assert.rejects(h.service.process("campaign-message"), CampaignDeliveryDeferred);
  assert.equal(h.sends(), 0);
  assert.equal(h.failures.length, 0);
  assert.deepEqual(h.writes, []);
});
void test("persists SENDING before acceptance and does not resend an accepted duplicate", async () => {
  const h = harness();
  await h.service.process("message");
  await h.service.process("message");
  assert.deepEqual(h.writes, ["SENDING", "SENT"]);
  assert.equal(h.sends(), 1);
});
void test("delivers a current approved text-parameter template through the template adapter", async () => {
  const h = harness({
    ...snapshot(),
    message_type: "TEMPLATE",
    policy_decision: { outcome: "ALLOWED", source: "INBOX", template: { contentVersion: 1 } },
    content: { name: "hello", language: "en_US", variables: { "1": "World" } },
    template: {
      name: "hello",
      language: "en_US",
      content_version: 1,
      provider_status: "APPROVED",
      approval_status: "NOT_REQUIRED",
      components: [{ type: "BODY", text: "Hello {{1}}" }],
    },
  });
  await h.service.process("message");
  assert.deepEqual(h.writes, ["SENDING", "SENT"]);
  assert.equal(h.sends(), 1);
});
void test("a durable SENDING claim prevents blind resubmission after acceptance persistence fails", async () => {
  const h = harness(snapshot(), undefined, true);
  await assert.rejects(() => h.service.process("message"));
  await h.service.process("message");
  assert.equal(h.sends(), 1);
  assert.equal(h.failures.length, 0);
});
void test("revalidates opt-out, suspension, window and stale template approval before provider submission", async () => {
  for (const patch of [
    { consent_status: "OPTED_OUT" },
    { tenant_status: "SUSPENDED" },
    { window_expires_at: "2020-01-01" },
    { message_type: "TEMPLATE", template: null },
  ]) {
    const h = harness({ ...snapshot(), ...patch });
    await assert.rejects(() => h.service.process("message"), MessageDeliveryError);
    assert.equal(h.sends(), 0);
    assert.equal(h.failures[0]?.retryable, false);
  }
});
void test("honors longer Retry-After and stops after five attempts", async () => {
  const h = harness(snapshot(), new WhatsAppProviderError("RATE_LIMITED", "safe", 60));
  await assert.rejects(
    () => h.service.process("message", 1),
    (error: unknown) => error instanceof MessageDeliveryError && (error.retryDelayMs ?? 0) >= 60000,
  );
  await assert.rejects(
    () => h.service.process("message", 5),
    (error: unknown) =>
      error instanceof MessageDeliveryError &&
      error.retryDelayMs === null &&
      error.code === "MESSAGE_DELIVERY_RETRIES_EXHAUSTED",
  );
  assert.equal(h.failures[1]?.exhausted, true);
});
void test("unknown acceptance and permanent provider errors never retry", async () => {
  for (const code of [
    "UNKNOWN",
    "AUTHENTICATION",
    "VALIDATION",
    "CONFIGURATION",
    "POLICY",
  ] as const) {
    const h = harness(snapshot(), new WhatsAppProviderError(code, "safe"));
    await assert.rejects(
      () => h.service.process("message"),
      (error: unknown) => error instanceof MessageDeliveryError && error.retryDelayMs === null,
    );
    assert.equal(h.failures[0]?.retryable, false);
  }
});
void test("maps positional template parameters in index order and rejects unsupported components", () => {
  const message = {
    ...snapshot(),
    content: { name: "hello", language: "en_US", variables: { "2": "second", "1": "first" } },
    template: { components: [{ type: "BODY", text: "{{2}} {{1}}" }] },
  };
  assert.deepEqual(templateContent(message).components[0]?.parameters, [
    { type: "text", text: "first" },
    { type: "text", text: "second" },
  ]);
  assert.throws(() =>
    templateContent({
      ...message,
      template: { components: [{ type: "HEADER", format: "IMAGE" }] },
    }),
  );
});
