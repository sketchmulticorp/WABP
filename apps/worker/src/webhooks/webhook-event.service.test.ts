import assert from "node:assert/strict";
import test from "node:test";

import type { WebhookEventRepository } from "./webhook-event.repository.js";
import { WebhookEventService, webhookEventTestHelpers } from "./webhook-event.service.js";

void test("normalizes an inbound message and delivery statuses, without applying deleted status", () => {
  const effects = webhookEventTestHelpers.parseWebhookEffects({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ profile: { name: "Asha" }, wa_id: "919876543210" }],
              messages: [
                {
                  from: "919876543210",
                  id: "wamid.inbound-1",
                  text: { body: "Hello" },
                  timestamp: "1791801000",
                  type: "text",
                },
              ],
              statuses: [
                { id: "wamid.outbound-1", status: "delivered", timestamp: "1791801001" },
                { id: "wamid.outbound-1", status: "deleted", timestamp: "1791801002" },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(effects.inboundMessages, [
    {
      contactName: "Asha",
      content: { data: { body: "Hello" }, provider_type: "text" },
      messageType: "TEXT",
      phoneE164: "+919876543210",
      providerCreatedAt: "2026-10-12T10:30:00.000Z",
      providerMessageId: "wamid.inbound-1",
      triggersTenantOptOut: false,
    },
  ]);
  assert.deepEqual(effects.statuses, [
    {
      occurredAt: "2026-10-12T10:30:01.000Z",
      providerMessageId: "wamid.outbound-1",
      status: "DELIVERED",
    },
  ]);
});

void test("marks only whole-message STOP keywords for tenant-wide opt-out", () => {
  const effects = webhookEventTestHelpers.parseWebhookEffects({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [],
              messages: [
                {
                  from: "919876543210",
                  id: "stop-1",
                  text: { body: " stop " },
                  timestamp: "1",
                  type: "text",
                },
                {
                  from: "919876543210",
                  id: "stop-2",
                  text: { body: "please stop now" },
                  timestamp: "2",
                  type: "text",
                },
              ],
              statuses: [],
            },
          },
        ],
      },
    ],
  });

  assert.equal(effects.inboundMessages[0]?.triggersTenantOptOut, true);
  assert.equal(effects.inboundMessages[1]?.triggersTenantOptOut, false);
});

void test("processes a claimed webhook once and ignores a job already claimed by another worker", async () => {
  const applied: unknown[] = [];
  let shouldClaim = true;
  const repository = {
    withTransaction: async (work: (tx: object) => Promise<void>) => {
      await work({});
    },
    account: () => Promise.resolve({ phone_number_id: "phone-1" }),
    complete: () => {
      applied.push("completed");
      return Promise.resolve();
    },
    claimForProcessing: () => {
      if (!shouldClaim) return Promise.resolve(undefined);
      return Promise.resolve({
        id: "event-1",
        payload: { entry: [] },
        tenantId: "tenant-1",
        whatsappAccountId: "account-1",
      });
    },
    markFailed: () => Promise.resolve(),
    replay: () => Promise.resolve(true),
  };
  const service = new WebhookEventService(repository as unknown as WebhookEventRepository);

  await service.process("event-1");
  assert.equal(applied.length, 1);

  shouldClaim = false;
  await service.process("event-1");
  assert.equal(applied.length, 1);
});

void test("marks unexpected failures with a safe code and delegates replay to the repository", async () => {
  const failures: unknown[] = [];
  const repository = {
    applyEffects: () => Promise.resolve(),
    claimForProcessing: () => Promise.resolve(undefined),
    markFailed: (...input: unknown[]) => {
      failures.push(input);
      return Promise.resolve();
    },
    replay: (eventId: string) => Promise.resolve(eventId === "event-1"),
  };
  const service = new WebhookEventService(repository as unknown as WebhookEventRepository);

  await service.fail("event-1", new Error("provider payload should not be exposed"), false);
  assert.deepEqual(failures, [["event-1", "WEBHOOK_PROCESSING_FAILED", false]]);
  assert.equal(await service.replay("event-1"), true);
});
