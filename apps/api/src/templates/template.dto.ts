import { BadRequestException } from "@nestjs/common";

export interface TemplateContentInput {
  readonly category: string;
  readonly components: readonly Readonly<Record<string, unknown>>[];
  readonly language: string;
  readonly name: string;
}

export interface CreateTemplateInput extends TemplateContentInput {
  readonly whatsappAccountId: string;
}

export interface UpdateTemplateInput extends TemplateContentInput {
  readonly expectedContentVersion: number;
}

export function parseCreateTemplateInput(value: unknown): CreateTemplateInput {
  const body = object(value);
  return { ...content(body), whatsappAccountId: uuid(body.whatsapp_account_id) };
}

export function parseUpdateTemplateInput(value: unknown): UpdateTemplateInput {
  const body = object(value);
  return {
    ...content(body),
    expectedContentVersion: positiveInteger(body.expected_content_version),
  };
}

export function parseExpectedContentVersion(value: unknown): number {
  return positiveInteger(object(value).expected_content_version);
}

export function parseRejectTemplateInput(value: unknown): {
  readonly expectedContentVersion: number;
  readonly reason: string;
} {
  const body = object(value);
  return {
    expectedContentVersion: positiveInteger(body.expected_content_version),
    reason: text(body.reason, 1, 1_000),
  };
}

export function parseSyncTemplatesInput(value: unknown): { readonly whatsappAccountId: string } {
  return { whatsappAccountId: uuid(object(value).whatsapp_account_id) };
}

function content(body: Record<string, unknown>): TemplateContentInput {
  return {
    category: text(body.category, 1, 64).toUpperCase(),
    components: components(body.components),
    language: text(body.language, 1, 32),
    name: text(body.name, 1, 512),
  };
}

function components(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20 || !value.every(isRecord)) {
    throw invalid("components must be a non-empty array of objects");
  }
  return value.map((item) => sanitizeObject(item));
}

function sanitizeObject(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)])),
  );
}

function sanitizeJson(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string")
    return value.length <= 4_000 ? value : invalid("component text is too long");
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (isRecord(value)) return sanitizeObject(value);
  throw invalid("components contain an unsupported value");
}

function uuid(value: unknown): string {
  const result = text(value, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw invalid("UUID field is invalid");
  }
  return result;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw invalid("version is invalid");
  return value;
}

function text(value: unknown, minimum: number, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) throw invalid("text field is invalid");
  return result;
}

function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) throw invalid("body must be a JSON object");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException([message]);
}
