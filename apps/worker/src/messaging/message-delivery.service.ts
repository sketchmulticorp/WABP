import { Injectable, Inject } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { WhatsAppProviderError, type WhatsAppProvider } from "@whatsapp-platform/whatsapp-provider";
import { MESSAGE_PROVIDER } from "./message.constants.js";
import { WORKER_RUNTIME_CONFIG } from "../webhooks/webhook.constants.js";
import { MessageDeliveryRepository } from "./message-delivery.repository.js";
import { MessageTransactionManager } from "./message-transaction.manager.js";
import { dispatchBlock, templateContent, interactiveContent } from "./message-dispatch.policy.js";

export class MessageDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryDelayMs: number | null,
  ) {
    super(code);
    this.name = "MessageDeliveryError";
  }
}
export class CampaignDeliveryDeferred extends Error {}

/** Owns live policy, durable claims, external delivery, and recovery decisions. */
@Injectable()
export class MessageDeliveryService {
  constructor(
    private readonly repository: MessageDeliveryRepository,
    private readonly transactions: MessageTransactionManager,
    @Inject(MESSAGE_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(WORKER_RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async process(messageId: string, attempt = 1): Promise<void> {
    const message = await this.transactions.execute(async (session) => {
      const snapshot = await this.repository.findForDispatch(session, messageId);
      // SENDING is never reclaimed blindly: Meta might already have accepted the request.
      if (
        snapshot === undefined ||
        !["CREATED", "QUEUED"].includes(snapshot.status) ||
        snapshot.provider_message_id !== null
      )
        return undefined;
      const block = dispatchBlock(snapshot, Date.now());
      if (block === "CAMPAIGN_PAUSED") return { snapshot, blocked: block };
      if (block !== null) {
        await this.repository.markFailure(session, snapshot, {
          code: block,
          retryable: false,
          exhausted: false,
        });
        return { snapshot, blocked: block };
      }
      if (snapshot.message_type === "TEMPLATE") {
        try {
          templateContent(snapshot);
        } catch {
          await this.repository.markFailure(session, snapshot, {
            code: "TEMPLATE_PARAMETERS_UNSUPPORTED",
            retryable: false,
            exhausted: false,
          });
          return { snapshot, blocked: "TEMPLATE_PARAMETERS_UNSUPPORTED" };
        }
      }
      await this.repository.markSending(session, snapshot, attempt);
      return { snapshot, blocked: null };
    });
    if (message === undefined) return;
    if (message.blocked === "CAMPAIGN_PAUSED")
      throw new CampaignDeliveryDeferred("CAMPAIGN_PAUSED");
    if (message.blocked !== null) throw new MessageDeliveryError(message.blocked, null);
    const snapshot = message.snapshot;
    const input = {
      accountId: snapshot.whatsapp_account_id,
      credentialReference: snapshot.secret_ref ?? "",
      phoneNumberId: snapshot.phone_number_id,
      idempotencyKey: snapshot.id,
      recipient: (snapshot.phone_e164 ?? "").replace(/^\+/u, ""),
    };
    let result;
    try {
      if (snapshot.message_type === "INTERACTIVE") {
        if (this.provider.sendInteractive === undefined)
          throw new WhatsAppProviderError("CONFIGURATION", "Interactive sending is unavailable.");
        result = await this.provider.sendInteractive({ ...input, ...interactiveContent(snapshot) });
      } else
        result =
          snapshot.message_type === "TEXT"
            ? await this.provider.sendText({ ...input, text: String(snapshot.content.text) })
            : await this.provider.sendTemplate({ ...input, ...templateContent(snapshot) });
    } catch (error) {
      const code =
        error instanceof WhatsAppProviderError ? error.code : "WHATSAPP_PROVIDER_UNKNOWN";
      const retryable = error instanceof WhatsAppProviderError && error.retryable;
      const exhausted = retryable && attempt >= this.config.messaging.maxAttempts;
      await this.transactions.execute((session) =>
        this.repository.markFailure(session, snapshot, { code, retryable, exhausted }),
      );
      const delay =
        retryable && !exhausted
          ? Math.max(
              this.config.messaging.retryBaseDelayMs * 2 ** (attempt - 1) * (1 + Math.random()),
              (error instanceof WhatsAppProviderError ? (error.retryAfterSeconds ?? 0) : 0) * 1000,
            )
          : null;
      throw new MessageDeliveryError(
        exhausted ? "MESSAGE_DELIVERY_RETRIES_EXHAUSTED" : code,
        delay === null ? null : Math.ceil(delay),
      );
    }
    // A persistence failure after acceptance leaves SENDING for review, never a new send.
    await this.transactions.execute((session) =>
      this.repository.markAccepted(session, snapshot, result.providerMessageId, result.acceptedAt),
    );
  }

  replay(tenantId: string, messageId: string): Promise<boolean> {
    return this.transactions.execute((session) =>
      this.repository.replay(session, tenantId, messageId, randomUUID()),
    );
  }
}
