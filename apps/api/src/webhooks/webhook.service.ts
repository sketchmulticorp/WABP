import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ApplicationError } from "../common/errors/application-error.js";
import { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import { OutboxRepository } from "../database/outbox/outbox.repository.js";
import { META_WEBHOOK_CONFIG } from "./webhook.constants.js";
import { WebhookRepository } from "./webhook.repository.js";
import type { MetaWebhookConfig } from "./webhook.types.js";

const META_WEBHOOK_OBJECT = "whatsapp_business_account";

@Injectable()
export class WebhookService {
  constructor(
    private readonly repository: WebhookRepository,
    private readonly transactions: DatabaseTransactionManager,
    private readonly outboxRepository: OutboxRepository,
    @Inject(META_WEBHOOK_CONFIG) private readonly config: MetaWebhookConfig,
  ) {}

  verifySubscription(input: {
    readonly challenge: unknown;
    readonly mode: unknown;
    readonly verifyToken: unknown;
  }): string {
    const configuredToken = this.requiredVerifyToken();
    if (
      input.mode !== "subscribe" ||
      typeof input.challenge !== "string" ||
      !constantTimeEqual(input.verifyToken, configuredToken)
    ) {
      throw forbiddenWebhookRequest();
    }
    return input.challenge;
  }

  async receiveMetaEvent(rawBody: Buffer | undefined, signature: string | undefined) {
    const appSecret = this.requiredAppSecret();
    if (rawBody === undefined) {
      throw new ApplicationError({
        code: "WEBHOOK_RAW_BODY_UNAVAILABLE",
        message: "Webhook verification is unavailable.",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
    if (!isValidMetaSignature(signature, rawBody, appSecret)) throw forbiddenWebhookRequest();

    const payload = parseMetaPayload(rawBody);
    const phoneNumberId = extractSinglePhoneNumberId(payload);
    const account =
      phoneNumberId === null
        ? undefined
        : await this.repository.findAccountByPhoneNumberId(phoneNumberId);
    const externalEventKey = createHash("sha256").update(rawBody).digest("hex");
    const result = await this.transactions.execute(async (transaction) => {
      const persisted = await this.repository.persistVerifiedMetaEvent({
        executor: transaction,
        externalEventKey,
        payload,
        tenantId: account?.tenantId ?? null,
        whatsappAccountId: account?.id ?? null,
      });
      if (persisted.event !== null) {
        await this.outboxRepository.create(transaction, {
          aggregateId: persisted.event.id,
          aggregateType: "webhook_event",
          correlationId: externalEventKey,
          eventType: "webhook.event.received",
          payload: { webhook_event_id: persisted.event.id },
          tenantId: account?.tenantId ?? null,
        });
      }
      return persisted;
    });

    // The worker consumes this committed handoff after the HTTP acknowledgement.
    return { duplicate: result.isDuplicate, received: true };
  }

  private requiredAppSecret(): string {
    if (hasSecret(this.config.appSecret)) return this.config.appSecret;
    throw unavailableWebhookConfiguration();
  }

  private requiredVerifyToken(): string {
    if (hasSecret(this.config.verifyToken)) return this.config.verifyToken;
    throw unavailableWebhookConfiguration();
  }
}

function parseMetaPayload(rawBody: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    throw new ApplicationError({
      code: "WEBHOOK_PAYLOAD_INVALID",
      message: "The webhook payload is invalid.",
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }
  if (!isRecord(parsed) || parsed.object !== META_WEBHOOK_OBJECT) {
    throw new ApplicationError({
      code: "WEBHOOK_PAYLOAD_INVALID",
      message: "The webhook payload is invalid.",
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }
  return parsed;
}

function extractSinglePhoneNumberId(payload: Record<string, unknown>): string | null {
  const phoneNumberIds = new Set<string>();
  const entries = payload.entry;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !isRecord(change.value.metadata))
        continue;
      const phoneNumberId = change.value.metadata.phone_number_id;
      if (typeof phoneNumberId === "string" && phoneNumberId.length > 0) {
        phoneNumberIds.add(phoneNumberId);
      }
    }
  }
  return phoneNumberIds.size === 1 ? ([...phoneNumberIds][0] ?? null) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidMetaSignature(
  signature: string | undefined,
  rawBody: Buffer,
  appSecret: string,
): boolean {
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/iu.test(signature)) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return constantTimeEqual(signature.toLowerCase(), expected);
}

function constantTimeEqual(supplied: unknown, expected: string): boolean {
  if (typeof supplied !== "string") return false;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

function hasSecret(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function forbiddenWebhookRequest(): ApplicationError {
  return new ApplicationError({
    code: "WEBHOOK_VERIFICATION_FAILED",
    message: "Webhook verification failed.",
    statusCode: HttpStatus.FORBIDDEN,
  });
}

function unavailableWebhookConfiguration(): ApplicationError {
  return new ApplicationError({
    code: "WEBHOOK_CONFIGURATION_UNAVAILABLE",
    message: "Webhook verification is unavailable.",
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
  });
}

export const webhookTestHelpers = {
  extractSinglePhoneNumberId,
  isValidMetaSignature,
};
