import { BadRequestException } from "@nestjs/common";

export interface CreateContactInput {
  readonly address: string | null;
  readonly assignedUserId: string | null;
  readonly company: string | null;
  readonly customFields: Readonly<Record<string, unknown>>;
  readonly email: string | null;
  readonly name: string | null;
  readonly phone: string;
}

export interface ListContactsInput {
  readonly cursor: ContactCursor | null;
  readonly limit: number;
}

export interface ContactCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface UpdateContactInput {
  readonly address?: string | null;
  readonly assignedUserId?: string | null;
  readonly company?: string | null;
  readonly customFields?: Readonly<Record<string, unknown>>;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly phone?: string;
}

export interface UpdateContactConsentInput {
  readonly category: string | null;
  readonly proofReference: string | null;
  readonly source: string;
  readonly status: "OPTED_IN" | "OPTED_OUT" | "SUPPRESSED";
  readonly occurredAt: string | null;
  readonly suppressionReason: string | null;
}

export function parseCreateContactInput(value: unknown): CreateContactInput {
  const body = object(value);
  return {
    address: optionalText(body.address, 1_000),
    assignedUserId: optionalUuid(body.assigned_user_id),
    company: optionalText(body.company, 256),
    customFields: jsonObject(body.custom_fields),
    email: optionalEmail(body.email),
    name: optionalText(body.name, 256),
    phone: requiredPhone(body.phone),
  };
}

export function parseUpdateContactInput(value: unknown): UpdateContactInput {
  const body = object(value);
  const input = {
    ...(has(body, "address") ? { address: optionalText(body.address, 1_000) } : {}),
    ...(has(body, "assigned_user_id")
      ? { assignedUserId: optionalUuid(body.assigned_user_id) }
      : {}),
    ...(has(body, "company") ? { company: optionalText(body.company, 256) } : {}),
    ...(has(body, "custom_fields") ? { customFields: jsonObject(body.custom_fields) } : {}),
    ...(has(body, "email") ? { email: optionalEmail(body.email) } : {}),
    ...(has(body, "name") ? { name: optionalText(body.name, 256) } : {}),
    ...(has(body, "phone") ? { phone: requiredPhone(body.phone) } : {}),
  };
  if (Object.keys(input).length === 0) throw invalid("contact update must contain a field");
  return input;
}

export function parseUpdateContactConsentInput(value: unknown): UpdateContactConsentInput {
  const body = object(value);
  const status = body.status;
  if (status !== "OPTED_IN" && status !== "OPTED_OUT" && status !== "SUPPRESSED") {
    throw invalid("consent status is invalid");
  }
  const source = requiredText(body.source, 120);
  const occurredAt =
    body.occurred_at === undefined || body.occurred_at === null
      ? null
      : isoTimestamp(body.occurred_at);
  const proofReference = optionalText(body.proof_reference, 1_000);
  const suppressionReason = optionalText(body.suppression_reason, 1_000);
  if (status === "OPTED_IN" && proofReference === null) {
    throw invalid("proof_reference is required for opt-in consent");
  }
  if (status === "SUPPRESSED" && suppressionReason === null) {
    throw invalid("suppression_reason is required for suppression");
  }
  return {
    category: optionalText(body.category, 120),
    occurredAt,
    proofReference,
    source,
    status,
    suppressionReason,
  };
}

export function parseListContactsInput(value: unknown): ListContactsInput {
  const query = object(value);
  return {
    cursor: query.cursor === undefined ? null : cursor(query.cursor),
    limit: query.limit === undefined ? 25 : pageSize(query.limit),
  };
}

function cursor(value: unknown): ContactCursor {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw invalid("cursor is invalid");
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    const result = object(decoded);
    const createdAt = requiredText(result.created_at, 64);
    if (Number.isNaN(Date.parse(createdAt))) throw invalid("cursor is invalid");
    return { createdAt, id: uuid(result.id) };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalid("cursor is invalid");
  }
}

export function formatContactCursor(input: ContactCursor): string {
  return Buffer.from(JSON.stringify({ created_at: input.createdAt, id: input.id })).toString(
    "base64url",
  );
}

function pageSize(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw invalid("limit must be an integer between 1 and 100");
  }
  return parsed;
}

function requiredPhone(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < 7 || result.length > 32) throw invalid("phone is invalid");
  return result;
}

function optionalEmail(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = optionalText(value, 320);
  if (result === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result)) {
    throw invalid("email is invalid");
  }
  return result.toLowerCase();
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length === 0 || result.length > maximum) throw invalid("text field is invalid");
  return result;
}

function optionalUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value);
}

function uuid(value: unknown): string {
  const result = requiredText(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result)) {
    throw invalid("UUID field is invalid");
  }
  return result;
}

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value === undefined) return {};
  if (!isRecord(value) || Array.isArray(value)) throw invalid("custom_fields must be an object");
  return Object.freeze(
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)])),
  );
}

function sanitizeJson(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string")
    return value.length <= 4_000 ? value : invalid("custom field is too long");
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (isRecord(value)) return jsonObject(value);
  throw invalid("custom_fields contain an unsupported value");
}

function requiredText(value: unknown, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length === 0 || result.length > maximum) throw invalid("text field is invalid");
  return result;
}

function isoTimestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw invalid("occurred_at must be an ISO-8601 timestamp");
  }
  return new Date(value).toISOString();
}

function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) throw invalid("value must be an object");
  return value;
}

function has(value: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException([message]);
}
