import { BadRequestException } from "@nestjs/common";

/** Explicit allowlist: self-service cannot change email, role, tenant or another user. */
export function parseProfileInput(body: unknown): { displayName: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new BadRequestException(["body must be a JSON object"]);
  const record = body as Record<string, unknown>;
  const displayName = typeof record.display_name === "string" ? record.display_name.trim() : "";
  if (
    Object.keys(record).some((key) => key !== "display_name") ||
    displayName.length < 1 ||
    displayName.length > 255 ||
    Array.from(displayName).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException(["Supply only display_name, between 1 and 255 characters"]);
  return { displayName };
}
