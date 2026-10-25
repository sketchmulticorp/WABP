import assert from "node:assert/strict";
import test from "node:test";
import { MetaWhatsAppProviderAdapter } from "./meta-whatsapp-provider.adapter.js";
import { WhatsAppProviderError } from "./whatsapp-provider.error.js";

const provider = new MetaWhatsAppProviderAdapter({
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
  idempotencyKey: "local-key",
  recipient: "919876543210",
  text: "Hello",
};

void test("interactive buttons and lists use official normalized payloads without a live request", async (context) => {
  const payloads: unknown[] = [];
  context.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    payloads.push(JSON.parse(options.body as string));
    return Promise.resolve(
      new Response(JSON.stringify({ messages: [{ id: "wamid.interactive" }] })),
    );
  });
  const choices = [{ id: "a:run:node:yes", title: "Yes" }];
  for (const kind of ["BUTTONS", "LIST"] as const)
    assert.equal(
      (await provider.sendInteractive({ ...input, kind, choices })).providerMessageId,
      "wamid.interactive",
    );
  const common = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.recipient,
    type: "interactive",
  };
  assert.deepEqual(payloads, [
    {
      ...common,
      interactive: {
        type: "button",
        body: { text: "Hello" },
        action: { buttons: [{ type: "reply", reply: choices[0] }] },
      },
    },
    {
      ...common,
      interactive: {
        type: "list",
        body: { text: "Hello" },
        action: { button: "Choose an option", sections: [{ rows: choices }] },
      },
    },
  ]);
});

void test("sends official text/template payloads and returns only normalized acceptance", async (context) => {
  const payloads: unknown[] = [];
  context.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    assert.equal(typeof options.body, "string");
    payloads.push(JSON.parse(options.body as string));
    return Promise.resolve(
      new Response(
        JSON.stringify({ messages: [{ id: "wamid.test" }], contacts: [{ wa_id: "private" }] }),
      ),
    );
  });
  assert.equal((await provider.sendText(input)).providerMessageId, "wamid.test");
  await provider.sendTemplate({ ...input, name: "hello_world", language: "en_US", components: [] });
  assert.deepEqual(payloads[0], {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.recipient,
    type: "text",
    text: { body: "Hello", preview_url: false },
  });
  assert.deepEqual(payloads[1], {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.recipient,
    type: "template",
    template: { name: "hello_world", language: { code: "en_US" }, components: [] },
  });
});
void test("a network timeout or malformed acceptance is UNKNOWN and cannot automatically retry", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", () =>
    Promise.reject(new Error("secret-sensitive-network-error")),
  );
  await assert.rejects(
    () => provider.sendText(input),
    (error: unknown) =>
      error instanceof WhatsAppProviderError &&
      !error.retryable &&
      error.providerCode === "UNKNOWN" &&
      !error.message.includes("secret"),
  );
  fetchMock.mock.mockImplementation(() => Promise.resolve(new Response("{}")));
  await assert.rejects(
    () => provider.sendText(input),
    (error: unknown) => error instanceof WhatsAppProviderError && !error.retryable,
  );
});
void test("normalizes rate rejection and Retry-After without response-body leakage", async (context) => {
  context.mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response("private error", { status: 429, headers: { "retry-after": "60" } }),
    ),
  );
  await assert.rejects(
    () => provider.sendText(input),
    (error: unknown) =>
      error instanceof WhatsAppProviderError &&
      error.retryable &&
      error.retryAfterSeconds === 60 &&
      !error.message.includes("private"),
  );
});
