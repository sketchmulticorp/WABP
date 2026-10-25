import { Injectable } from "@nestjs/common";
import { WhatsAppProviderError } from "./whatsapp-provider.error.js";
import type {
  AccountSyncResult,
  ProviderMessageResult,
  ProviderTemplate,
  WhatsAppProvider,
} from "./whatsapp-provider.types.js";

/** Safe TASK-030 placeholder: TASK-031 replaces this with the Meta adapter. */
@Injectable()
export class UnconfiguredWhatsAppProviderAdapter implements WhatsAppProvider {
  sendText(): Promise<ProviderMessageResult> {
    return Promise.reject(unconfigured());
  }
  sendTemplate(): Promise<ProviderMessageResult> {
    return Promise.reject(unconfigured());
  }
  disconnectAccount(): Promise<void> {
    return Promise.reject(unconfigured());
  }
  syncAccount(): Promise<AccountSyncResult> {
    return Promise.reject(unconfigured());
  }
  syncTemplates(): Promise<readonly ProviderTemplate[]> {
    return Promise.reject(unconfigured());
  }
}
function unconfigured() {
  return new WhatsAppProviderError(
    "CONFIGURATION",
    "WhatsApp provider configuration is not available.",
  );
}
