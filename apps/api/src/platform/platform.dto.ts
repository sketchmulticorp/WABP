import { BadRequestException } from "@nestjs/common";

import type {
  ChangeSubscriptionInput,
  CreatePlanInput,
  CreatePlatformTenantInput,
  PlatformSubscriptionStatus,
  PlatformTenantStatus,
  RecordPaymentInput,
} from "./platform.types.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const currencyPattern = /^[A-Z]{3}$/u;
const createTenantKeys = new Set([
  "admin_display_name",
  "admin_email",
  "admin_temporary_password",
  "default_country_code",
  "default_timezone",
  "name",
  "slug",
]);

export function parseCreateTenantInput(value: unknown): CreatePlatformTenantInput {
  const body = record(value);
  const adminEmail = string(body.admin_email).toLowerCase();
  const password = string(body.admin_temporary_password, false);
  const timezone = string(body.default_timezone);
  const unknownKeys = Object.keys(body).filter((key) => !createTenantKeys.has(key));
  const errors = [
    unknownKeys.length > 0 ? `unknown fields: ${unknownKeys.join(", ")}` : "",
    !emailPattern.test(adminEmail) || adminEmail.length > 320 ? "admin_email must be valid" : "",
    password.length < 12 || password.length > 128
      ? "admin_temporary_password must contain 12 to 128 characters"
      : "",
    !/[a-z]/u.test(password) ? "admin_temporary_password must contain a lowercase letter" : "",
    !/[A-Z]/u.test(password) ? "admin_temporary_password must contain an uppercase letter" : "",
    !/[0-9]/u.test(password) ? "admin_temporary_password must contain a number" : "",
    !/[^A-Za-z0-9]/u.test(password) ? "admin_temporary_password must contain a symbol" : "",
    !slugPattern.test(string(body.slug)) ? "slug must be lowercase kebab-case" : "",
    !isTimezone(timezone) ? "default_timezone must be a valid IANA timezone" : "",
  ].filter(Boolean);
  if (errors.length > 0) throw new BadRequestException(errors);
  return {
    adminDisplayName: required(body.admin_display_name),
    adminEmail,
    adminTemporaryPassword: password,
    defaultCountryCode: optionalCountry(body.default_country_code),
    defaultTimezone: timezone,
    name: required(body.name),
    slug: required(body.slug),
  };
}

export function parseTenantStatus(value: unknown): PlatformTenantStatus {
  const status = string(record(value).status);
  if (status !== "ACTIVE" && status !== "SUSPENDED")
    throw new BadRequestException(["status must be ACTIVE or SUSPENDED"]);
  return status;
}

export function parsePlanInput(value: unknown): CreatePlanInput {
  const body = record(value);
  const currency = optionalCurrency(body.currency);
  const priceMinor = body.price_minor;
  if (!isSafeInteger(priceMinor) || priceMinor < 0 || !slugPattern.test(string(body.code)))
    throw new BadRequestException(["plan input is invalid"]);
  return {
    code: required(body.code),
    currency,
    featureFlags: jsonObject(body.feature_flags),
    limits: jsonObject(body.limits),
    name: required(body.name),
    priceMinor,
    validityDays: optionalPositiveInteger(body.validity_days),
  };
}

export function parseSubscriptionInput(value: unknown): ChangeSubscriptionInput {
  const body = record(value);
  const status = string(body.status) as PlatformSubscriptionStatus;
  if (
    !["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"].includes(status) ||
    !isTimestamp(body.starts_at) ||
    (body.ends_at !== null && !isTimestamp(body.ends_at))
  )
    throw new BadRequestException(["subscription input is invalid"]);
  return { planId: required(body.plan_id), status, startsAt: body.starts_at, endsAt: body.ends_at };
}

export function parsePaymentInput(value: unknown): RecordPaymentInput {
  const body = record(value);
  const currency = string(body.currency);
  if (
    !isSafeInteger(body.amount_minor) ||
    body.amount_minor <= 0 ||
    !currencyPattern.test(currency) ||
    !isTimestamp(body.paid_at)
  )
    throw new BadRequestException(["payment input is invalid"]);
  return {
    amountMinor: body.amount_minor,
    currency,
    note: optionalString(body.note),
    paidAt: body.paid_at,
    reference: required(body.reference),
  };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new BadRequestException(["body must be a JSON object"]);
  return value as Record<string, unknown>;
}
function string(value: unknown, trim = true): string {
  return typeof value === "string" ? (trim ? value.trim() : value) : "";
}
function required(value: unknown): string {
  const result = string(value);
  if (result.length === 0 || result.length > 255)
    throw new BadRequestException(["required string field is invalid"]);
  return result;
}
function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return required(value);
}
function optionalCountry(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const result = string(value).toUpperCase();
  if (!/^[A-Z]{2}$/u.test(result))
    throw new BadRequestException(["default_country_code must be ISO alpha-2"]);
  return result;
}
function optionalCurrency(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const result = string(value);
  if (!currencyPattern.test(result))
    throw new BadRequestException(["currency must be ISO 4217 alpha-3"]);
  return result;
}
function optionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!isSafeInteger(value) || value <= 0)
    throw new BadRequestException(["validity_days must be positive"]);
  return value;
}
function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new BadRequestException(["limits and feature_flags must be objects"]);
  return value as Readonly<Record<string, unknown>>;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isTimezone(value: string): boolean {
  if (value.length === 0 || value.length > 255) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
