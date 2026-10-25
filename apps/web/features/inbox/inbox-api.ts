import type {
  ConversationAssignmentResponse,
  ConversationHistoryResponse,
  ConversationListResponse,
  ConversationNoteCreateResponse,
  ConversationNotesResponse,
  ConversationReplyResponse,
  ConversationSummary,
} from "@whatsapp-platform/contracts";
import { request } from "../workspace/api-client";

export interface InboxPageQuery {
  readonly limit?: number;
  readonly cursor?: string;
}
export interface InboxListQuery extends InboxPageQuery {
  readonly search?: string;
  readonly status?: "OPEN" | "PENDING" | "CLOSED" | "ARCHIVED";
  readonly accountId?: string;
  readonly unread?: boolean;
}
export type InboxReplyContent =
  | { readonly type: "TEXT"; readonly text: string }
  | {
      readonly type: "TEMPLATE";
      readonly templateId: string;
      readonly variables: Readonly<Record<string, string>>;
    };
const path = (id: string) => `/conversations/${encodeURIComponent(id)}`;
function query(values: InboxListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) params.set(key, String(value));
  return params.size === 0 ? "" : `?${params.toString()}`;
}
function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Reuse ordinary authorized REST calls. Reads are abortable; mutations never auto-retry here. */
export const inboxApi = {
  assignees: (cursor?: string, signal?: AbortSignal) =>
    request<{
      assignees: readonly { id: string; displayName: string }[];
      nextCursor: string | null;
    }>(`/conversations/assignees${query(cursor === undefined ? {} : { cursor })}`, {
      signal: signal ?? null,
      cache: "no-store",
    }),
  list: (input: InboxListQuery = {}, signal?: AbortSignal) =>
    request<ConversationListResponse>(`/conversations${query(input)}`, {
      signal: signal ?? null,
      cache: "no-store",
    }),
  history: (id: string, page: InboxPageQuery = {}, signal?: AbortSignal) =>
    request<ConversationHistoryResponse>(`${path(id)}${query(page)}`, {
      signal: signal ?? null,
      cache: "no-store",
    }),
  notes: (id: string, page: InboxPageQuery = {}, signal?: AbortSignal) =>
    request<ConversationNotesResponse>(`${path(id)}/notes${query(page)}`, {
      signal: signal ?? null,
      cache: "no-store",
    }),
  reply: (id: string, clientMessageKey: string, content: InboxReplyContent) =>
    post<ConversationReplyResponse>(`${path(id)}/messages`, { clientMessageKey, content }),
  markRead: (id: string, lastSeenMessageId: string) =>
    post<ConversationSummary>(`${path(id)}/read`, { lastSeenMessageId }),
  markUnread: (id: string) => post<ConversationSummary>(`${path(id)}/unread`, {}),
  close: (id: string) => post<ConversationSummary>(`${path(id)}/close`, {}),
  reopen: (id: string) => post<ConversationSummary>(`${path(id)}/reopen`, {}),
  assign: (id: string, assignedUserId: string | null) =>
    post<ConversationAssignmentResponse>(`${path(id)}/assign`, { assignedUserId }),
  createNote: (id: string, noteId: string, note: string) =>
    post<ConversationNoteCreateResponse>(`${path(id)}/notes`, { id: noteId, note }),
};
