import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { WhatsAppProviderError } from "./whatsapp-provider.error.js";

export interface CredentialBinding {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
}

/** Versioned authenticated encryption; AAD prevents copying tokens across business records. */
export class ProviderCredentialCipher {
  constructor(private readonly config: RuntimeConfig["credentialEncryption"]) {}

  encrypt(token: string, binding: CredentialBinding): string {
    const keyId = this.config?.activeKeyId;
    if (!keyId || token.length < 1 || Buffer.byteLength(token, "utf8") > 16384) throw unavailable();
    const key = this.key(keyId);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(this.aad(binding, keyId));
      const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
      return JSON.stringify({
        version: 1,
        keyId,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: ciphertext.toString("base64"),
      });
    } finally {
      key.fill(0);
    }
  }

  decrypt(envelope: string, binding: CredentialBinding): string {
    try {
      if (envelope.length > 32768) throw unavailable();
      const raw: unknown = JSON.parse(envelope);
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw unavailable();
      const value = raw as Record<string, unknown>;
      if (
        value.version !== 1 ||
        typeof value.keyId !== "string" ||
        Object.keys(value).sort().join(",") !== "data,iv,keyId,tag,version"
      )
        throw unavailable();
      const key = this.key(value.keyId);
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, decode(value.iv, 12));
        decipher.setAAD(this.aad(binding, value.keyId));
        decipher.setAuthTag(decode(value.tag, 16));
        const plaintext = Buffer.concat([decipher.update(decode(value.data)), decipher.final()]);
        try {
          if (plaintext.length === 0 || plaintext.length > 16384) throw unavailable();
          return plaintext.toString("utf8");
        } finally {
          plaintext.fill(0);
        }
      } finally {
        key.fill(0);
      }
    } catch {
      throw unavailable();
    }
  }

  private key(id: string): Buffer {
    const encoded = this.config?.keys?.[id];
    if (typeof encoded !== "string" || !Object.hasOwn(this.config?.keys ?? {}, id))
      throw unavailable();
    return decode(encoded, 32);
  }

  private aad(binding: CredentialBinding, keyId: string): Buffer {
    return Buffer.from(
      JSON.stringify(["whatsapp-token", 1, keyId, binding.tenantId, binding.accountId, binding.id]),
      "utf8",
    );
  }
}

function decode(value: unknown, length?: number): Buffer {
  if (typeof value !== "string" || value.length === 0 || value.length > 32768) throw unavailable();
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || (length !== undefined && bytes.length !== length))
    throw unavailable();
  return bytes;
}

export function unavailable(): WhatsAppProviderError {
  return new WhatsAppProviderError("CONFIGURATION", "The provider credential is unavailable.");
}
