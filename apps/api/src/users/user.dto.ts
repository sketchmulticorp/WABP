import { BadRequestException } from "@nestjs/common";

export interface CreateAccountInput {
  readonly displayName: string;
  readonly email: string;
  readonly initialPassword: string;
}

export type CreateTenantUserInput = CreateAccountInput;

export interface ChangeTenantUserStatusInput {
  readonly status: "ACTIVE" | "DISABLED";
}

const allowedKeys = new Set(["display_name", "email", "initial_password"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function parseCreateTenantUserInput(value: unknown): CreateTenantUserInput {
  return parseCreateAccountInput(value);
}

/** Shared initial-account payload; the caller service, never the body, selects the role. */
export function parseCreateAccountInput(value: unknown): CreateAccountInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(["body must be a JSON object"]);
  }
  const body = value as Record<string, unknown>;
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.initial_password === "string" ? body.initial_password : "";
  const errors = [
    unknownKeys.length > 0 ? `unknown fields: ${unknownKeys.join(", ")}` : "",
    displayName.length === 0 || displayName.length > 255
      ? "display_name must contain 1 to 255 characters"
      : "",
    !emailPattern.test(email) || email.length > 320 ? "email must be valid" : "",
    ...passwordErrors(password),
  ].filter(Boolean);
  if (errors.length > 0) throw new BadRequestException(errors);
  return { displayName, email, initialPassword: password };
}

export function parseChangeTenantUserStatusInput(value: unknown): ChangeTenantUserStatusInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(["body must be a JSON object"]);
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "status")) {
    throw new BadRequestException(["body contains an unknown field"]);
  }
  if (body.status !== "ACTIVE" && body.status !== "DISABLED") {
    throw new BadRequestException(["status must be ACTIVE or DISABLED"]);
  }
  return { status: body.status };
}

function passwordErrors(password: string): string[] {
  return [
    password.length < 12 || password.length > 128
      ? "initial_password must contain 12 to 128 characters"
      : "",
    !/[a-z]/u.test(password) ? "initial_password must contain a lowercase letter" : "",
    !/[A-Z]/u.test(password) ? "initial_password must contain an uppercase letter" : "",
    !/[0-9]/u.test(password) ? "initial_password must contain a number" : "",
    !/[^A-Za-z0-9]/u.test(password) ? "initial_password must contain a symbol" : "",
  ].filter(Boolean);
}
