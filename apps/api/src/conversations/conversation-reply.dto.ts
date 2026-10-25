import { BadRequestException } from "@nestjs/common";
import type { OutboundTemplateContent, OutboundTextContent } from "../messaging/messaging.types.js";

export interface ConversationReplyInput {
  readonly clientMessageKey: string;
  readonly content: OutboundTextContent | OutboundTemplateContent;
}

/** Accept presentation input only; tenant, source, account and Contact are server-resolved. */
export function parseConversationReply(value: unknown): ConversationReplyInput {
  const body = object(value);
  keys(body, ["clientMessageKey", "content"]);
  if (
    typeof body.clientMessageKey !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(body.clientMessageKey)
  )
    throw invalid();
  const content = object(body.content);
  if (content.type === "TEXT") {
    keys(content, ["type", "text"]);
    if (
      typeof content.text !== "string" ||
      content.text.trim().length === 0 ||
      content.text.trim().length > 4096
    )
      throw invalid();
    return {
      clientMessageKey: body.clientMessageKey,
      content: { type: "TEXT", text: content.text.trim() },
    };
  }
  if (content.type !== "TEMPLATE") throw invalid();
  keys(content, ["type", "templateId", "variables"]);
  if (
    typeof content.templateId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      content.templateId,
    )
  )
    throw invalid();
  const raw = object(content.variables);
  if (Object.keys(raw).length > 100) throw invalid();
  const entries: [string, string][] = [];
  for (const [key, item] of Object.entries(raw)) {
    if (
      !/^[A-Za-z0-9_]{1,64}$/u.test(key) ||
      ["__proto__", "prototype", "constructor"].includes(key) ||
      typeof item !== "string" ||
      item.trim().length === 0 ||
      item.length > 4096
    )
      throw invalid();
    entries.push([key, item.trim()]);
  }
  return {
    clientMessageKey: body.clientMessageKey,
    content: {
      type: "TEMPLATE",
      templateId: content.templateId,
      variables: Object.fromEntries(entries),
    },
  };
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw invalid();
}
function invalid() {
  return new BadRequestException("Invalid conversation reply.");
}
