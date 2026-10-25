import { BadRequestException } from "@nestjs/common";

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function parseLoginInput(value: unknown): LoginInput {
  if (!isRecord(value)) {
    throw new BadRequestException(["body must be a JSON object"]);
  }

  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const password = typeof value.password === "string" ? value.password : "";
  const errors: string[] = [];
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.push("email must be a valid email address");
  }
  if (password.length < 1 || password.length > 128) {
    errors.push("password must contain between 1 and 128 characters");
  }
  if (errors.length > 0) {
    throw new BadRequestException(errors);
  }

  return { email, password };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
