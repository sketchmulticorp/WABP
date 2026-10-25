import { BadRequestException } from "@nestjs/common";

export interface CreateContactImportInput {
  readonly defaultCountryCode: string | null;
  readonly groupId: string | null;
  readonly mapping: ContactImportMapping;
}

export interface ListContactImportErrorsInput {
  readonly afterRowNumber: number | null;
  readonly limit: number;
}

export interface ListContactImportsInput {
  readonly limit: number;
}

/** Maps stable contact fields to exact CSV/XLSX header names. */
export interface ContactImportMapping {
  readonly phone: string;
  readonly name?: string | undefined;
  readonly email?: string | undefined;
  readonly company?: string | undefined;
  readonly address?: string | undefined;
  readonly customFields?: string | undefined;
  readonly consentSource?: string | undefined;
  readonly consentOccurredAt?: string | undefined;
  readonly consentProofReference?: string | undefined;
}

export function parseCreateContactImportInput(value: unknown): CreateContactImportInput {
  const body = object(value);
  return {
    defaultCountryCode: country(body.default_country_code),
    groupId: optionalUuid(body.group_id),
    mapping: json(body.mapping),
  };
}

export function parseListContactImportErrorsInput(value: unknown): ListContactImportErrorsInput {
  const query = object(value);
  const after =
    query.after_row_number === undefined || query.after_row_number === ""
      ? null
      : requiredInteger(query.after_row_number, "after_row_number", 0);
  const limit =
    query.limit === undefined || query.limit === ""
      ? 100
      : requiredInteger(query.limit, "limit", 1);
  if (limit > 200) throw invalid("limit must be 200 or less");
  return { afterRowNumber: after, limit };
}

export function parseListContactImportsInput(value: unknown): ListContactImportsInput {
  const query = object(value);
  const limit =
    query.limit === undefined || query.limit === "" ? 25 : requiredInteger(query.limit, "limit", 1);
  if (limit > 100) throw invalid("limit must be 100 or less");
  return { limit };
}

function country(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z]{2}$/u.test(value.trim())) {
    throw invalid("default_country_code must be an ISO alpha-2 country code");
  }
  return value.trim().toUpperCase();
}

function optionalUuid(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw invalid("group_id must be a UUID");
  }
  return value;
}

function json(value: unknown): ContactImportMapping {
  if (value === undefined || value === "") throw invalid("mapping.phone is required");
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalid("mapping must be an object");
  }
  const mapping = parsed as Record<string, unknown>;
  return {
    phone: header(mapping.phone, "mapping.phone", true),
    name: optionalHeader(mapping.name, "mapping.name"),
    email: optionalHeader(mapping.email, "mapping.email"),
    company: optionalHeader(mapping.company, "mapping.company"),
    address: optionalHeader(mapping.address, "mapping.address"),
    customFields: optionalHeader(mapping.custom_fields, "mapping.custom_fields"),
    consentSource: optionalHeader(mapping.consent_source, "mapping.consent_source"),
    consentOccurredAt: optionalHeader(mapping.consent_occurred_at, "mapping.consent_occurred_at"),
    consentProofReference: optionalHeader(
      mapping.consent_proof_reference,
      "mapping.consent_proof_reference",
    ),
  };
}

function optionalHeader(value: unknown, field: string): string | undefined {
  return value === undefined || value === null || value === ""
    ? undefined
    : header(value, field, false);
}

function header(value: unknown, field: string, required: boolean): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalid(required ? `${field} is required` : `${field} must be a non-empty column header`);
  }
  return value.trim();
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw invalid("mapping must be valid JSON");
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid("value must be an object");
  return value as Record<string, unknown>;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException([message]);
}

function requiredInteger(value: unknown, field: string, minimum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw invalid(`${field} must be a valid integer`);
  }
  return parsed;
}
