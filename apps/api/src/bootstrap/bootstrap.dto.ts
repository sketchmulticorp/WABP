import { BadRequestException } from "@nestjs/common";
import { parseLoginInput } from "../auth/auth.dto.js";
import type { FirstSuperAdminInput } from "./bootstrap.types.js";

export function parseBootstrapInput(body: unknown): FirstSuperAdminInput {
  const input = parseLoginInput(body);
  if (
    typeof body !== "object" ||
    body === null ||
    Object.keys(body).some((key) => key !== "email" && key !== "password")
  ) {
    throw new BadRequestException(["only email and password are accepted"]);
  }
  const password = input.password;
  if (
    password.length < 12 ||
    !/[a-z]/u.test(password) ||
    !/[A-Z]/u.test(password) ||
    !/[0-9]/u.test(password) ||
    !/[^A-Za-z0-9]/u.test(password)
  ) {
    throw new BadRequestException([
      "password must contain 12 to 128 characters, uppercase, lowercase, number and symbol",
    ]);
  }
  return input;
}
