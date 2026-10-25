import assert from "node:assert/strict";
import test from "node:test";
import { ProviderCredentialCipher } from "./provider-credential-cipher.js";
import { ProviderCredentialService } from "./provider-credential.service.js";
import { EnvironmentCredentialReferenceResolver } from "./environment-credential-reference.resolver.js";

const binding = {
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-one",
  accountId: "account-one",
};
const keys = {
  v1: Buffer.alloc(32, 1).toString("base64"),
  v2: Buffer.alloc(32, 2).toString("base64"),
};

void test("credential encryption randomizes nonce and round-trips without plaintext in envelope", () => {
  const cipher = new ProviderCredentialCipher({ keys, activeKeyId: "v1" });
  const first = cipher.encrypt("synthetic-provider-token", binding),
    second = cipher.encrypt("synthetic-provider-token", binding);
  assert.notEqual(first, second);
  assert.equal(first.includes("synthetic-provider-token"), false);
  assert.equal(cipher.decrypt(first, binding), "synthetic-provider-token");
});
void test("cipher rejects tampering, foreign bindings, missing keys and malformed envelopes safely", () => {
  const cipher = new ProviderCredentialCipher({ keys, activeKeyId: "v1" });
  const encrypted = cipher.encrypt("synthetic-provider-token", binding);
  for (const changed of [
    { ...binding, id: "foreign" },
    { ...binding, tenantId: "foreign" },
    { ...binding, accountId: "foreign" },
  ])
    assert.throws(() => cipher.decrypt(encrypted, changed), /credential is unavailable/u);
  const envelope = JSON.parse(encrypted) as Record<string, unknown>;
  for (const raw of [
    "not-json",
    "{}",
    encrypted.slice(0, -2),
    JSON.stringify({ ...envelope, version: 2 }),
    JSON.stringify({ ...envelope, keyId: "missing" }),
    JSON.stringify({ ...envelope, tag: Buffer.alloc(16).toString("base64") }),
  ])
    assert.throws(() => cipher.decrypt(raw, binding), /credential is unavailable/u);
  assert.throws(() => new ProviderCredentialCipher(undefined).encrypt("token", binding));
  assert.throws(() => new ProviderCredentialCipher(undefined).decrypt(encrypted, binding));
});
void test("retained older keys decrypt after changing active key; missing old key fails closed", () => {
  const encrypted = new ProviderCredentialCipher({ keys, activeKeyId: "v1" }).encrypt(
    "old-token",
    binding,
  );
  assert.equal(
    new ProviderCredentialCipher({ keys, activeKeyId: "v2" }).decrypt(encrypted, binding),
    "old-token",
  );
  assert.throws(() =>
    new ProviderCredentialCipher({ keys: { v2: keys.v2 }, activeKeyId: "v2" }).decrypt(
      encrypted,
      binding,
    ),
  );
});
void test("shared resolver enforces account/reference identity and never falls back for ciphertext", async () => {
  const cipher = new ProviderCredentialCipher({ keys, activeKeyId: "v1" });
  const row = { ...binding, encryptedToken: cipher.encrypt("business-token", binding) };
  const resolver = new ProviderCredentialService(
    { findActive: () => Promise.resolve(row) },
    cipher,
    new EnvironmentCredentialReferenceResolver("development-token"),
  );
  assert.equal(
    await resolver.resolve(`encrypted://${binding.id}`, binding.accountId),
    "business-token",
  );
  assert.equal(
    await resolver.resolve("env://META_DEVELOPMENT_ACCESS_TOKEN", binding.accountId),
    "development-token",
  );
  await assert.rejects(() => resolver.resolve(`encrypted://${binding.id}`, "foreign-account"));
  await assert.rejects(() =>
    resolver.resolve("encrypted://00000000-0000-4000-8000-000000000002", binding.accountId),
  );
  await assert.rejects(() => resolver.resolve("encrypted://bad", binding.accountId));
  const missing = new ProviderCredentialService(
    { findActive: () => Promise.resolve(undefined) },
    cipher,
    new EnvironmentCredentialReferenceResolver("fallback"),
  );
  await assert.rejects(() => missing.resolve(`encrypted://${binding.id}`, binding.accountId));
});
