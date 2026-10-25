import { BadRequestException } from "@nestjs/common";

export interface PasswordChangeInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export function parsePasswordChangeInput(body: unknown): PasswordChangeInput {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new BadRequestException(["body must be a JSON object"]);
  const record = body as Record<string, unknown>;
  const currentPassword =
    typeof record.current_password === "string" ? record.current_password : "";
  const newPassword = typeof record.new_password === "string" ? record.new_password : "";
  if (
    Object.keys(record).some((key) => key !== "current_password" && key !== "new_password") ||
    currentPassword.length < 1 ||
    currentPassword.length > 128 ||
    newPassword.length < 12 ||
    newPassword.length > 128 ||
    !/[a-z]/u.test(newPassword) ||
    !/[A-Z]/u.test(newPassword) ||
    !/[0-9]/u.test(newPassword) ||
    !/[^A-Za-z0-9]/u.test(newPassword)
  ) {
    throw new BadRequestException([
      "Supply current_password and a new_password of 12–128 characters with uppercase, lowercase, number and symbol",
    ]);
  }
  return { currentPassword, newPassword };
}
