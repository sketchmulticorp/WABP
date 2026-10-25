import assert from "node:assert/strict";
import test from "node:test";
import { MetaWhatsAppProviderAdapter } from "./meta-whatsapp-provider.adapter.js";
import { WhatsAppProviderError } from "./whatsapp-provider.error.js";

void test("Graph transient flags support retry while HTTP auth and throttling keep their categories", async (context) => {
  const adapter = new MetaWhatsAppProviderAdapter({
    graphApiVersion: "v25.0",
    developmentAccessToken: "fake-test-value",
    appId: undefined,
    appSecret: undefined,
    webhookVerifyToken: undefined,
  });
  const input = {
    accountId: "account",
    credentialReference: "env://META_DEVELOPMENT_ACCESS_TOKEN",
    phoneNumberId: "123",
    idempotencyKey: "test",
    recipient: "919876543210",
    text: "test",
  };
  for (const [status, code] of [
    [400, "TRANSIENT"],
    [401, "AUTHENTICATION"],
    [429, "RATE_LIMITED"],
  ] as const) {
    const fetchMock = context.mock.method(globalThis, "fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { is_transient: true, message: "private" } }), {
          status,
          headers: { "retry-after": new Date(Date.now() + 60000).toUTCString() },
        }),
      ),
    );
    await assert.rejects(
      () => adapter.sendText(input),
      (error: unknown) =>
        error instanceof WhatsAppProviderError &&
        error.providerCode === code &&
        (error.retryAfterSeconds ?? 0) >= 59 &&
        !error.message.includes("private"),
    );
    fetchMock.mock.restore();
  }
});
