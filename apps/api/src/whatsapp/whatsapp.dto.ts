import { BadRequestException } from "@nestjs/common";

export interface DevelopmentConnectionInput {
  readonly businessId: string | null;
  readonly displayName: string | null;
  readonly displayPhone: string;
  readonly phoneNumberId: string;
  readonly secretRef: string;
  readonly wabaId: string;
}

/** Parses asset identifiers and an opaque server-side credential reference, never a token. */
export function parseDevelopmentConnectionInput(value: unknown): DevelopmentConnectionInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(["body must be a JSON object"]);
  }
  const body = value as Record<string, unknown>;
  return {
    businessId: optional(body.business_id),
    displayName: optional(body.display_name),
    displayPhone: required(body.display_phone),
    phoneNumberId: required(body.phone_number_id),
    secretRef: requiredSecretReference(body.secret_ref),
    wabaId: required(body.waba_id),
  };
}
function required(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length === 0 || result.length > 512)
    throw new BadRequestException(["required field is invalid"]);
  return result;
}

function optional(value: unknown): string | null {
  return value === undefined || value === null ? null : required(value);
}

function requiredSecretReference(value: unknown): string {
  const reference = required(value);
  if (!/^env:\/\/[A-Z][A-Z0-9_]*$/.test(reference)) {
    throw new BadRequestException(["secret_ref must be an env:// server-side reference"]);
  }
  return reference;
}
