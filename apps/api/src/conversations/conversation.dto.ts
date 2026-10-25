import { BadRequestException } from "@nestjs/common";

export interface InboxCursor {
  readonly at: string;
  readonly id: string;
}
export interface InboxPage {
  readonly limit: number;
  readonly cursor: InboxCursor | null;
}
export interface InboxFilters extends InboxPage {
  readonly search: string | null;
  readonly status: string | null;
  readonly accountId: string | null;
  readonly unread: boolean | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function parseInboxQuery(value: Record<string, unknown>, history = false): InboxFilters {
  keys(
    value,
    history ? ["limit", "cursor"] : ["limit", "cursor", "search", "status", "accountId", "unread"],
  );
  const limit =
    value.limit === undefined
      ? 25
      : typeof value.limit === "string" && /^\d+$/u.test(value.limit)
        ? Number(value.limit)
        : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
  let cursor: InboxCursor | null = null;
  if (value.cursor !== undefined) {
    if (
      typeof value.cursor !== "string" ||
      value.cursor.length > 512 ||
      !/^[A-Za-z0-9_-]+$/u.test(value.cursor)
    )
      throw invalid();
    try {
      const decoded: unknown = JSON.parse(Buffer.from(value.cursor, "base64url").toString("utf8"));
      if (!isRecord(decoded)) throw invalid();
      keys(decoded, ["at", "id"]);
      if (
        typeof decoded.at !== "string" ||
        decoded.at.length > 64 ||
        !Number.isFinite(Date.parse(decoded.at)) ||
        typeof decoded.id !== "string" ||
        !uuid.test(decoded.id)
      )
        throw invalid();
      cursor = { at: decoded.at, id: decoded.id };
    } catch {
      throw invalid();
    }
  }
  const search = value.search === undefined ? null : bounded(value.search, 100);
  const status = value.status === undefined ? null : bounded(value.status, 16);
  if (status !== null && !["OPEN", "PENDING", "CLOSED", "ARCHIVED"].includes(status))
    throw invalid();
  const accountId = value.accountId === undefined ? null : bounded(value.accountId, 36);
  if (accountId !== null && !uuid.test(accountId)) throw invalid();
  if (value.unread !== undefined && value.unread !== "true" && value.unread !== "false")
    throw invalid();
  return {
    limit,
    cursor,
    search,
    status,
    accountId,
    unread: value.unread === undefined ? null : value.unread === "true",
  };
}
export function parseInboxCommand(value: unknown, read = false): string | null {
  const body = value === undefined ? {} : value;
  if (!isRecord(body)) throw invalid();
  keys(body, read ? ["lastSeenMessageId"] : []);
  if (!read) return null;
  if (typeof body.lastSeenMessageId !== "string" || !uuid.test(body.lastSeenMessageId))
    throw invalid();
  return body.lastSeenMessageId;
}
export function inboxCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify({ at, id })).toString("base64url");
}
function bounded(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw invalid();
  return value.trim();
}
function keys(body: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalid() {
  return new BadRequestException("Invalid inbox request.");
}
