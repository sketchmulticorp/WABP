import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthorizationContext } from "../../authorization/authorization.types.js";
import {
  WhatsAppOnboardingService,
  type OnboardingConfig,
} from "../whatsapp-onboarding.service.js";
import { parseSignupCompletion } from "./embedded-signup.dto.js";
import { MetaEmbeddedSignupAdapter } from "./meta-embedded-signup.adapter.js";

const context = { tenantId: "tenant", isPlatformActor: false } as AuthorizationContext;
const configured: OnboardingConfig = {
  whatsappOnboarding: { mode: "embedded_signup", configurationId: "5678" },
  meta: {
    appId: "1234",
    appSecret: "synthetic-app-secret",
    graphApiVersion: "v99.0",
    webhookVerifyToken: undefined,
    developmentAccessToken: undefined,
  },
  credentialEncryption: { keys: { v1: Buffer.alloc(32, 1).toString("base64") }, activeKeyId: "v1" },
};

void test("onboarding defaults development, fails closed missing config, never exposes secrets", () => {
  assert.equal(new WhatsAppOnboardingService({}).describe(context).mode, "development");
  const incomplete = new WhatsAppOnboardingService({
    whatsappOnboarding: configured.whatsappOnboarding,
  });
  assert.equal(incomplete.describe(context).status, "NOT_CONFIGURED");
  assert.throws(() => {
    incomplete.requireDevelopmentConnection(context);
  });
  const ready = new WhatsAppOnboardingService(configured);
  assert.deepEqual(ready.describe(context), {
    mode: "embedded_signup",
    connection_available: true,
    status: "READY_TO_CONNECT",
  });
  assert.equal(JSON.stringify(ready.describe(context)).includes("synthetic"), false);
  assert.throws(() => ready.describe({ ...context, isPlatformActor: true, tenantId: null }));
});
void test("signup completion strictly validates fields, IDs and nonce without accepting token/tenant overrides", () => {
  const input = {
    attemptId: "00000000-0000-4000-8000-000000000001",
    nonce: "n".repeat(43),
    code: "synthetic-code",
    wabaId: "100",
    phoneNumberId: "200",
  };
  assert.deepEqual(parseSignupCompletion(input), input);
  for (const raw of [
    null,
    [],
    { ...input, token: "bad" },
    { ...input, tenantId: "foreign" },
    { ...input, nonce: "bad" },
    { ...input, wabaId: "../me" },
    { ...input, code: " " },
  ])
    assert.throws(() => parseSignupCompletion(raw));
});
void test("Meta exchange verifies app/scopes/WABA/phone and sanitizes provider failures", async (suite) => {
  const original = globalThis.fetch;
  try {
    for (const variant of [
      "valid",
      "foreign-app",
      "missing-scope",
      "foreign-waba",
      "foreign-phone",
      "expired",
      "http-error",
      "bad-json",
    ]) {
      await suite.test(variant, async () => {
        let calls = 0;
        globalThis.fetch = (input) => {
          calls++;
          const url = new URL(
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          );
          assert.equal(url.origin, "https://graph.facebook.com");
          if (variant === "http-error")
            return Promise.resolve(new Response("secret-provider-body", { status: 401 }));
          if (variant === "bad-json") return Promise.resolve(new Response("not-json"));
          let value: unknown;
          if (url.pathname.endsWith("/oauth/access_token"))
            value = { access_token: "synthetic-business-token" };
          else if (url.pathname.endsWith("/debug_token"))
            value = {
              data: {
                is_valid: true,
                app_id: variant === "foreign-app" ? "other" : "1234",
                scopes:
                  variant === "missing-scope"
                    ? []
                    : ["whatsapp_business_management", "whatsapp_business_messaging"],
                expires_at: variant === "expired" ? 1 : 0,
                granular_scopes: [
                  {
                    scope: "whatsapp_business_management",
                    target_ids: [variant === "foreign-waba" ? "other" : "100"],
                  },
                ],
              },
            };
          else if (url.pathname.endsWith("/phone_numbers"))
            value = {
              data: [
                {
                  id: variant === "foreign-phone" ? "other" : "200",
                  display_phone_number: "+919876543210",
                  verified_name: "Test",
                },
              ],
            };
          else value = { id: "100" };
          return Promise.resolve(Response.json(value));
        };
        const adapter = new MetaEmbeddedSignupAdapter(configured);
        if (variant === "valid") {
          const verified = await adapter.exchangeAndVerify("synthetic-code", "100", "200");
          assert.equal(verified.phoneNumberId, "200");
          assert.equal(calls, 4);
        } else
          await assert.rejects(
            () => adapter.exchangeAndVerify("synthetic-code", "100", "200"),
            (error: unknown) => {
              assert.ok(error instanceof Error);
              assert.equal(error.message.includes("secret-provider-body"), false);
              assert.equal(error.message.includes("synthetic"), false);
              return true;
            },
          );
      });
    }
  } finally {
    globalThis.fetch = original;
  }
});
