import { BadRequestException } from "@nestjs/common";

export interface SignupCompletion {
  readonly attemptId: string;
  readonly nonce: string;
  readonly code: string;
  readonly wabaId: string;
  readonly phoneNumberId: string;
}
export function parseSignupCompletion(raw: unknown): SignupCompletion {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid();
  const input = raw as Record<string, unknown>;
  const allowed = ["attemptId", "nonce", "code", "wabaId", "phoneNumberId"];
  if (
    Object.keys(input).length !== allowed.length ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    throw invalid();
  const value = (key: string, pattern: RegExp, max: number) => {
    const text = input[key];
    if (typeof text !== "string" || text.length > max || !pattern.test(text)) throw invalid();
    return text;
  };
  return {
    attemptId: value(
      "attemptId",
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      36,
    ),
    nonce: value("nonce", /^[A-Za-z0-9_-]{43}$/u, 43),
    code: value("code", /^\S+$/u, 4096),
    wabaId: value("wabaId", /^\d+$/u, 64),
    phoneNumberId: value("phoneNumberId", /^\d+$/u, 64),
  };
}
function invalid() {
  return new BadRequestException("Invalid WhatsApp signup completion.");
}
