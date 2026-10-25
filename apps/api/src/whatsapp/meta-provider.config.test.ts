import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { loadMetaProviderConfig } from "./meta-provider.config.js";

void test("requires complete server-only Meta configuration", () => {
  const config = {
    meta: {
      appId: undefined,
      appSecret: undefined,
      graphApiVersion: undefined,
      webhookVerifyToken: undefined,
    },
  } as RuntimeConfig;
  assert.throws(() => loadMetaProviderConfig(config), { code: "WHATSAPP_PROVIDER_CONFIGURATION" });
});
