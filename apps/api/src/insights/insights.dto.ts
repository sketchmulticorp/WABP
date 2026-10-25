import { BadRequestException } from "@nestjs/common";

export interface InsightCursor {
  readonly at: string;
  readonly id: string;
}
export interface InsightQuery {
  readonly limit: number;
  readonly cursor: InsightCursor | null;
  readonly from: string;
  readonly to: string;
  readonly action: string | null;
  readonly actorId: string | null;
  readonly result: string | null;
  readonly tenantId: string | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function invalid(): never {
  throw new BadRequestException("Invalid reporting filter or cursor.");
}
/** Validate calendar/time fields before sending a client-supplied timestamp to PostgreSQL. */
function validTimestamp(value: string, cursor = false) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}(?::\d{2})?)$/u.exec(
      value,
    );
  if (match === null || (!cursor && !value.includes("T"))) return false;
  const date = value.slice(0, 10),
    midnight = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== date ||
    Number(match[1]) === 0 ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59
  )
    return false;
  const zone = match[7];
  return (
    zone !== undefined &&
    (zone === "Z" || (Number(zone.slice(1, 3)) <= 14 && Number(zone.slice(4) || "0") <= 59)) &&
    Number.isFinite(Date.parse(value))
  );
}
export function parseInsightQuery(
  raw: Record<string, unknown>,
  kind: "audit" | "page",
  platform = false,
): InsightQuery {
  const allowed =
    kind === "page"
      ? ["limit", "cursor"]
      : [
          "limit",
          "cursor",
          "from",
          "to",
          "action",
          "actorId",
          "result",
          ...(platform ? ["tenantId"] : []),
        ];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) invalid();
  const text = (key: string, max: number): string | null => {
    const value = raw[key];
    if (value === undefined) return null;
    if (typeof value !== "string" || !value.trim() || value.length > max) invalid();
    return value.trim();
  };
  const limitText = text("limit", 3),
    limit = limitText === null ? 50 : /^\d+$/u.test(limitText) ? Number(limitText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
  let cursor: InsightCursor | null = null;
  const encoded = text("cursor", 512);
  if (encoded !== null) {
    if (!/^[\w-]+$/u.test(encoded)) invalid();
    try {
      const value: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (
        typeof value !== "object" ||
        value === null ||
        !("at" in value) ||
        !("id" in value) ||
        Object.keys(value).length !== 2 ||
        typeof value.at !== "string" ||
        value.at.length > 64 ||
        !validTimestamp(value.at, true) ||
        typeof value.id !== "string" ||
        !uuid.test(value.id)
      )
        invalid();
      cursor = { at: value.at, id: value.id };
    } catch {
      invalid();
    }
  }
  const to = text("to", 40) ?? new Date().toISOString();
  if (!validTimestamp(to)) invalid();
  const from = text("from", 40) ?? new Date(Date.parse(to) - 30 * 86400000).toISOString();
  if (
    !validTimestamp(from) ||
    Date.parse(to) <= Date.parse(from) ||
    Date.parse(to) - Date.parse(from) > 90 * 86400000
  )
    invalid();
  const actorId = text("actorId", 36),
    tenantId = text("tenantId", 36),
    result = text("result", 16),
    action = text("action", 100);
  if (
    (actorId !== null && !uuid.test(actorId)) ||
    (tenantId !== null && !uuid.test(tenantId)) ||
    (result !== null && !["SUCCESS", "DENIED", "FAILED"].includes(result)) ||
    (action !== null && !/^[A-Z0-9_]+$/u.test(action))
  )
    invalid();
  return { limit, cursor, from, to, actorId, tenantId, result, action };
}
export function insightCursor(at: string, id: string) {
  return Buffer.from(JSON.stringify({ at, id })).toString("base64url");
}
