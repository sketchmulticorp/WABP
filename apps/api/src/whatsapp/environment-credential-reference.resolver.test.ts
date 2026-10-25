import assert from "node:assert/strict";
import test from "node:test";

import { EnvironmentCredentialReferenceResolver } from "./environment-credential-reference.resolver.js";

void test("resolves only the approved development credential reference", () => {
  const resolver = new EnvironmentCredentialReferenceResolver("test-development-token");

  assert.equal(resolver.resolve("env://META_DEVELOPMENT_ACCESS_TOKEN"), "test-development-token");
  assert.throws(() => resolver.resolve("env://UNRELATED_SECRET"), {
    code: "WHATSAPP_PROVIDER_CONFIGURATION",
  });
});

void test("does not resolve an unset development credential", () => {
  const resolver = new EnvironmentCredentialReferenceResolver(undefined);

  assert.throws(() => resolver.resolve("env://META_DEVELOPMENT_ACCESS_TOKEN"), {
    code: "WHATSAPP_PROVIDER_CONFIGURATION",
  });
});
