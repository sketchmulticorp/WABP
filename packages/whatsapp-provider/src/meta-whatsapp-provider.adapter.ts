import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";

import { EnvironmentCredentialReferenceResolver } from "./environment-credential-reference.resolver.js";
import type { CredentialReferenceResolver } from "./provider-credential.service.js";
import {
  normalizeWhatsAppProviderError,
  WhatsAppProviderError,
} from "./whatsapp-provider.error.js";
import type {
  AccountSyncResult,
  ProviderMessageResult,
  ProviderTemplate,
  SyncAccountInput,
  SyncTemplatesInput,
  WhatsAppProvider,
  SendTextInput,
  SendTemplateInput,
  SendInteractiveInput,
} from "./whatsapp-provider.types.js";

interface MetaPhoneNumber {
  readonly display_phone_number?: unknown;
  readonly id?: unknown;
  readonly quality_rating?: unknown;
  readonly verified_name?: unknown;
}

/** Official Graph API adapter. Product services use only provider-neutral values. */
export class MetaWhatsAppProviderAdapter implements WhatsAppProvider {
  private readonly credentialResolver: CredentialReferenceResolver;

  constructor(
    private readonly meta: RuntimeConfig["meta"],
    resolver?: CredentialReferenceResolver,
  ) {
    this.credentialResolver =
      resolver ?? new EnvironmentCredentialReferenceResolver(meta.developmentAccessToken);
  }

  async syncAccount(input: SyncAccountInput): Promise<AccountSyncResult> {
    const graphApiVersion = this.requiredGraphApiVersion();
    const token = await this.credentialResolver.resolve(input.credentialReference, input.accountId);
    const response = await this.request(
      `/${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
      graphApiVersion,
      token,
    );
    const phone = extractPhone(response, input.phoneNumberId);
    const qualityRating = optionalString(phone.quality_rating);
    return {
      displayName: optionalString(phone.verified_name),
      displayPhone: requiredString(phone.display_phone_number),
      health: qualityRating === "RED" ? "DEGRADED" : "CONNECTED",
      phoneNumberId: input.phoneNumberId,
      qualityRating,
      wabaId: input.wabaId,
    };
  }

  disconnectAccount(): Promise<void> {
    // Local credential revocation is intentional for the approved development-only scope.
    return Promise.resolve();
  }

  sendText(input: SendTextInput): Promise<ProviderMessageResult> {
    return this.send(input, { type: "text", text: { body: input.text, preview_url: false } });
  }

  sendTemplate(input: SendTemplateInput): Promise<ProviderMessageResult> {
    return this.send(input, {
      type: "template",
      template: {
        name: input.name,
        language: { code: input.language },
        components: input.components,
      },
    });
  }
  sendInteractive(input: SendInteractiveInput): Promise<ProviderMessageResult> {
    const maximum = input.kind === "BUTTONS" ? 3 : 10;
    if (
      input.choices.length < 1 ||
      input.choices.length > maximum ||
      input.text.length < 1 ||
      input.text.length > 1024 ||
      new Set(input.choices.map((c) => c.id)).size !== input.choices.length ||
      input.choices.some(
        (c) =>
          c.id.length < 1 ||
          c.id.length > 200 ||
          c.title.trim().length < 1 ||
          c.title.length > (input.kind === "BUTTONS" ? 20 : 24),
      )
    )
      throw new WhatsAppProviderError("VALIDATION", "Interactive message is invalid.");
    return this.send(input, {
      type: "interactive",
      interactive: {
        type: input.kind === "BUTTONS" ? "button" : "list",
        body: { text: input.text },
        action:
          input.kind === "BUTTONS"
            ? {
                buttons: input.choices.map((c) => ({
                  type: "reply",
                  reply: { id: c.id, title: c.title },
                })),
              }
            : {
                button: "Choose an option",
                sections: [{ rows: input.choices.map((c) => ({ id: c.id, title: c.title })) }],
              },
      },
    });
  }

  private async send(
    input: SendTextInput | SendTemplateInput | SendInteractiveInput,
    body: Record<string, unknown>,
  ): Promise<ProviderMessageResult> {
    const version = this.requiredGraphApiVersion();
    const token = await this.credentialResolver.resolve(input.credentialReference, input.accountId);
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${version}/${encodeURIComponent(input.phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.recipient,
            ...body,
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      // No response cannot prove rejection. Retrying here could send twice.
      throw new WhatsAppProviderError(
        "UNKNOWN",
        "Provider acceptance is unknown; review is required.",
      );
    }
    if (!response.ok) {
      const delay = retryAfterSeconds(response.headers.get("retry-after"));
      let rejection: unknown;
      try {
        rejection = await response.json();
      } catch {
        rejection = null;
      }
      if (
        isRecord(rejection) &&
        isRecord(rejection.error) &&
        rejection.error.is_transient === true &&
        response.status !== 401 &&
        response.status !== 403 &&
        response.status !== 429
      ) {
        throw new WhatsAppProviderError(
          "TRANSIENT",
          "The provider temporarily rejected the request.",
          delay,
        );
      }
      throw normalizeWhatsAppProviderError({
        httpStatus: response.status,
        ...(delay === undefined ? {} : { retryAfterSeconds: delay }),
      });
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new WhatsAppProviderError(
        "UNKNOWN",
        "Provider acceptance is unknown; review is required.",
      );
    }
    if (
      !isRecord(value) ||
      !Array.isArray(value.messages) ||
      !isRecord(value.messages[0]) ||
      typeof value.messages[0].id !== "string" ||
      value.messages[0].id.length === 0
    ) {
      throw new WhatsAppProviderError(
        "UNKNOWN",
        "Provider acceptance is unknown; review is required.",
      );
    }
    return { providerMessageId: value.messages[0].id, acceptedAt: new Date().toISOString() };
  }

  async syncTemplates(input: SyncTemplatesInput): Promise<readonly ProviderTemplate[]> {
    const graphApiVersion = this.requiredGraphApiVersion();
    const token = await this.credentialResolver.resolve(input.credentialReference, input.accountId);
    const basePath = `/${encodeURIComponent(input.wabaId)}/message_templates?fields=id,name,language,status,category,components,rejected_reason,last_updated_time&limit=100`;
    const templates: ProviderTemplate[] = [];
    let after: string | null = null;
    for (let page = 0; page < 100; page += 1) {
      const response = await this.request(
        after === null ? basePath : `${basePath}&after=${encodeURIComponent(after)}`,
        graphApiVersion,
        token,
      );
      if (!isRecord(response) || !Array.isArray(response.data)) {
        throw new WhatsAppProviderError(
          "VALIDATION",
          "The WhatsApp provider returned an invalid template response.",
        );
      }
      templates.push(...response.data.map((item) => normalizeTemplate(item)));
      after = afterCursor(response);
      if (after === null || response.data.length === 0) return templates;
    }
    throw new WhatsAppProviderError(
      "VALIDATION",
      "The WhatsApp template result exceeds the supported synchronization limit.",
    );
  }

  private requiredGraphApiVersion(): string {
    if (this.meta.graphApiVersion !== undefined) return this.meta.graphApiVersion;
    throw new WhatsAppProviderError(
      "CONFIGURATION",
      "The Meta Graph API version is not configured.",
    );
  }

  private async request(path: string, graphApiVersion: string, token: string): Promise<unknown> {
    try {
      const response = await fetch(`https://graph.facebook.com/${graphApiVersion}${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
        throw normalizeWhatsAppProviderError(
          retryAfter === undefined
            ? { httpStatus: response.status }
            : { httpStatus: response.status, retryAfterSeconds: retryAfter },
        );
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof WhatsAppProviderError) throw error;
      throw normalizeWhatsAppProviderError({ httpStatus: 503 });
    }
  }
}

function extractPhone(value: unknown, phoneNumberId: string): MetaPhoneNumber {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new WhatsAppProviderError(
      "VALIDATION",
      "The WhatsApp provider returned an invalid phone response.",
    );
  }
  const phone = value.data.find((item): item is MetaPhoneNumber => {
    return isRecord(item) && item.id === phoneNumberId;
  });
  if (phone === undefined) {
    throw new WhatsAppProviderError(
      "VALIDATION",
      "The configured WhatsApp phone number was not found.",
    );
  }
  return phone;
}

function requiredString(value: unknown): string {
  const result = optionalString(value);
  if (result === null)
    throw new WhatsAppProviderError("VALIDATION", "The provider phone data is incomplete.");
  return result;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isSafeInteger(seconds) && seconds >= 0) return seconds;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTemplate(value: unknown): ProviderTemplate {
  if (!isRecord(value)) {
    throw new WhatsAppProviderError("VALIDATION", "The provider returned an invalid template.");
  }
  const status = requiredString(value.status).toUpperCase();
  if (
    status !== "APPROVED" &&
    status !== "DISABLED" &&
    status !== "PAUSED" &&
    status !== "PENDING" &&
    status !== "REJECTED"
  ) {
    throw new WhatsAppProviderError(
      "VALIDATION",
      "The provider returned an unsupported template status.",
    );
  }
  if (!Array.isArray(value.components) || !value.components.every(isRecord)) {
    throw new WhatsAppProviderError("VALIDATION", "The provider template components are invalid.");
  }
  return {
    category: requiredString(value.category).toUpperCase(),
    components: value.components.map((component) => sanitizeJsonObject(component)),
    language: requiredString(value.language),
    lastUpdatedAt: normalizeProviderTimestamp(value.last_updated_time),
    name: requiredString(value.name),
    providerTemplateId: requiredString(value.id),
    rejectionReason: optionalString(value.rejected_reason),
    status,
  };
}

function sanitizeJsonObject(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)])),
  );
}

function sanitizeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item));
  if (isRecord(value)) return sanitizeJsonObject(value);
  throw new WhatsAppProviderError(
    "VALIDATION",
    "The provider template contains an unsupported value.",
  );
}

function normalizeProviderTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds)) return null;
  const result = new Date(seconds * 1000);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function afterCursor(value: Record<string, unknown>): string | null {
  const paging = value.paging;
  if (!isRecord(paging) || !isRecord(paging.cursors)) return null;
  return optionalString(paging.cursors.after);
}
