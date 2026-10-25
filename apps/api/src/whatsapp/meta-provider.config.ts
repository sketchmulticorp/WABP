import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";

import { WhatsAppProviderError } from "./whatsapp-provider.error.js";

/** Server-only Meta configuration. Values come from runtime variables, never tenant input. */
export interface MetaProviderConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphApiVersion: string;
  readonly webhookVerifyToken: string;
}

export function loadMetaProviderConfig(config: RuntimeConfig): MetaProviderConfig {
  const meta = config.meta;
  if (
    meta.graphApiVersion === undefined ||
    meta.appId === undefined ||
    meta.appSecret === undefined ||
    meta.webhookVerifyToken === undefined
  ) {
    throw new WhatsAppProviderError(
      "CONFIGURATION",
      "WhatsApp provider configuration is incomplete.",
    );
  }
  return Object.freeze({
    appId: meta.appId,
    appSecret: meta.appSecret,
    graphApiVersion: meta.graphApiVersion,
    webhookVerifyToken: meta.webhookVerifyToken,
  });
}
