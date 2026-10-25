import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsAppProviderError } from "./whatsapp-provider.error.js";
void test("normalizes provider failures without provider payload leakage", () => {
  const error = normalizeWhatsAppProviderError({ httpStatus: 429, retryAfterSeconds: 30 });
  assert.equal(error.code, "WHATSAPP_PROVIDER_RATE_LIMITED");
  assert.equal(error.retryable, true);
  assert.equal(error.retryAfterSeconds, 30);
  assert.doesNotMatch(error.message, /token|payload/i);
});
