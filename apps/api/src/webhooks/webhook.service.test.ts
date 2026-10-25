import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { ApplicationError } from "../common/errors/application-error.js";
import type { WebhookRepository } from "./webhook.repository.js";
import { WebhookService } from "./webhook.service.js";

const APP_SECRET = "webhook-test-app-secret";

void test("verifies Meta's raw bytes and persists an account-routed delivery once", async () => {
  const calls: unknown[] = [];
  const repository = {
    findAccountByPhoneNumberId: (phoneNumberId: string) => {
      assert.equal(phoneNumberId, "phone-123");
      return Promise.resolve({ id: "account-123", tenantId: "tenant-123" });
    },
    persistVerifiedMetaEvent: (input: unknown) => {
      if (typeof input === "object" && input !== null && "executor" in input) {
        const event = { ...(input as Record<string, unknown>) };
        delete event.executor;
        calls.push(event);
      }
      return Promise.resolve({
        event: { id: "event-123", receivedAt: "2026-10-11T00:00:00.000Z" },
        isDuplicate: false,
      });
    },
  };
  const service = createService(repository as unknown as WebhookRepository);
  const rawBody = Buffer.from(
    JSON.stringify({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-123" } } }] }],
      object: "whatsapp_business_account",
    }),
  );
  const signature = `sha256=${createHmac("sha256", APP_SECRET).update(rawBody).digest("hex")}`;

  const result = await service.receiveMetaEvent(rawBody, signature);

  assert.deepEqual(result, { duplicate: false, received: true });
  assert.deepEqual(calls, [
    {
      externalEventKey: "6f839a229909e6915fdfbf516eaf5031eb71e3e9c9c72757434d917631f35753",
      payload: {
        entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-123" } } }] }],
        object: "whatsapp_business_account",
      },
      tenantId: "tenant-123",
      whatsappAccountId: "account-123",
    },
  ]);
});

void test("rejects an invalid Meta signature before it reads or persists the payload", async () => {
  const repository = {
    findAccountByPhoneNumberId: () => Promise.reject(new Error("should not resolve an account")),
    persistVerifiedMetaEvent: () => Promise.reject(new Error("should not persist an event")),
  };
  const service = createService(repository as unknown as WebhookRepository);

  await assert.rejects(
    service.receiveMetaEvent(
      Buffer.from('{"object":"whatsapp_business_account"}'),
      "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    ),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === "WEBHOOK_VERIFICATION_FAILED",
  );
});

void test("returns the challenge only for the configured Meta verification token", () => {
  const service = createService({} as WebhookRepository);

  assert.equal(
    service.verifySubscription({
      challenge: "challenge-value",
      mode: "subscribe",
      verifyToken: "verify-token",
    }),
    "challenge-value",
  );
  assert.throws(
    () =>
      service.verifySubscription({
        challenge: "challenge-value",
        mode: "subscribe",
        verifyToken: "wrong-token",
      }),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === "WEBHOOK_VERIFICATION_FAILED",
  );
});

function createService(repository: WebhookRepository): WebhookService {
  const transactions = {
    execute: <T>(work: (transaction: unknown) => Promise<T>) => work({}),
  };
  const outbox = { create: () => Promise.resolve({}) };
  return new WebhookService(repository, transactions as never, outbox as never, {
    appSecret: APP_SECRET,
    verifyToken: "verify-token",
  });
}
