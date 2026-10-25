"use client";
import { useCallback, useRef, useState, type SyntheticEvent } from "react";
import type { CurrentUserResponse } from "@whatsapp-platform/contracts";
import { inboxApi, type InboxListQuery } from "./inbox-api";
import { useInboxRefresh } from "./use-inbox-refresh";
import { InboxThread } from "./inbox-thread";
import type { ReplyDraft } from "./inbox-composer";

/** Composes the existing APIs/refresh foundation without owning provider or authorization rules. */
export function InboxScreen({ user }: { readonly user: CurrentUserResponse }) {
  const [filters, setFilters] = useState<InboxListQuery>({});
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const drafts = useRef(new Map<string, ReplyDraft>());
  const noteDrafts = useRef(new Map<string, { text: string; id: string | null }>());
  const allowed =
    user.role.system_key !== "SUPER_ADMIN" &&
    user.tenant !== null &&
    user.permissions.includes("conversation.read");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [list, history, notes] = await Promise.all([
        inboxApi.list({ ...filters, ...(cursor === undefined ? {} : { cursor }) }, signal),
        selected === null ? Promise.resolve(null) : inboxApi.history(selected, {}, signal),
        selected === null ? Promise.resolve(null) : inboxApi.notes(selected, {}, signal),
      ]);
      return { list, history, notes };
    },
    [filters, cursor, selected],
  );
  const key = allowed
    ? JSON.stringify([user.id, user.tenant.id, user.permissions, filters, cursor, selected])
    : null;
  const state = useInboxRefresh(key, load);
  const activeId = state.data?.history?.conversation.id ?? "";
  function filter(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const search = formText(fields, "search").trim();
    const status = formText(fields, "status");
    const unread = formText(fields, "unread");
    setCursor(undefined);
    setFilters({
      ...(search ? { search } : {}),
      ...(status ? { status: status as NonNullable<InboxListQuery["status"]> } : {}),
      ...(unread ? { unread: unread === "true" } : {}),
    });
  }
  if (!allowed)
    return (
      <section>
        <h2>Inbox</h2>
        <p role="alert">You do not have access to this Inbox.</p>
      </section>
    );
  return (
    <section className="inbox-screen" aria-label="Shared Inbox">
      <header>
        <h2>Inbox</h2>
        <p>Shared business conversations · automatic refresh while visible and online.</p>
        <button type="button" onClick={state.refresh} disabled={state.refreshing || state.stopped}>
          Refresh Inbox
        </button>
        {state.lastUpdatedAt !== null && (
          <p>Last refreshed: {new Date(state.lastUpdatedAt).toLocaleTimeString()}</p>
        )}
        {state.error !== null && (
          <p role="alert">
            {state.error}{" "}
            {state.stopped &&
              "Refresh stopped. Check access/sign in again, or change the selection after resolving the issue."}
          </p>
        )}
        {state.data === null && !state.error && <p role="status">Loading Inbox…</p>}
        {selected !== null && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
            }}
          >
            Back to conversations
          </button>
        )}
      </header>
      <div className={`inbox-layout ${selected === null ? "" : "inbox-selected"}`}>
        <aside className="inbox-list" aria-label="Conversation list">
          <form onSubmit={filter}>
            <label>
              Search name or phone
              <input name="search" maxLength={100} type="search" />
            </label>
            <label>
              Conversation status
              <select name="status">
                <option value="">All statuses</option>
                {["OPEN", "PENDING", "CLOSED", "ARCHIVED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Unread filter
              <select name="unread">
                <option value="">All conversations</option>
                <option value="true">Unread</option>
                <option value="false">Read</option>
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </form>
          {state.data?.list.conversations.length === 0 && (
            <p>No conversations match these filters.</p>
          )}
          <ul>
            {state.data?.list.conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={selected === c.id}
                  onClick={() => {
                    setSelected(c.id);
                  }}
                >
                  <strong>{c.contactName ?? c.phoneE164}</strong>
                  <span>
                    {c.phoneE164} · {c.status} · {c.unreadCount} unread
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={cursor === undefined}
            onClick={() => {
              setCursor(undefined);
            }}
          >
            First conversations
          </button>
          <button
            type="button"
            disabled={!state.data?.list.nextCursor || state.refreshing}
            onClick={() => {
              if (state.data?.list.nextCursor) setCursor(state.data.list.nextCursor);
            }}
          >
            Next conversations
          </button>
        </aside>
        <div className="inbox-detail">
          {selected === null && <p>Select a conversation to view its history.</p>}
          {state.data?.history && state.data.notes && (
            <InboxThread
              key={`${user.id}:${state.data.history.conversation.id}`}
              user={user}
              history={state.data.history}
              notes={state.data.notes}
              refresh={state.refresh}
              getDraft={() => drafts.current.get(activeId)}
              saveDraft={(draft) => drafts.current.set(activeId, draft)}
              getNoteDraft={() => noteDrafts.current.get(activeId)}
              saveNoteDraft={(draft) => noteDrafts.current.set(activeId, draft)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
function formText(fields: FormData, key: string): string {
  const value = fields.get(key);
  return typeof value === "string" ? value : "";
}
