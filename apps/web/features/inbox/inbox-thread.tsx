"use client";
import { useState } from "react";
import type {
  ConversationHistoryResponse,
  ConversationMessage,
  ConversationNotesResponse,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";
import { inboxApi } from "./inbox-api";
import { InboxComposer, type ReplyDraft } from "./inbox-composer";
import { InboxAssignment, InboxCollaboration, type NoteDraft } from "./inbox-collaboration";
import { InboxAutomationControls } from "../automation/inbox-automation-controls";

/** Latest polling and historical pages stay separate; loading older data never marks it read. */
export function InboxThread({
  history,
  notes,
  user,
  refresh,
  getDraft,
  saveDraft,
  getNoteDraft,
  saveNoteDraft,
}: {
  readonly history: ConversationHistoryResponse;
  readonly notes: ConversationNotesResponse;
  readonly user: CurrentUserResponse;
  readonly refresh: () => void;
  readonly getDraft: () => ReplyDraft | undefined;
  readonly saveDraft: (draft: ReplyDraft) => void;
  readonly getNoteDraft: () => NoteDraft | undefined;
  readonly saveNoteDraft: (draft: NoteDraft) => void;
}) {
  const [older, setOlder] = useState<ConversationHistoryResponse | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const c = history.conversation,
    page = older ?? history;
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Inbox action failed.");
    } finally {
      setBusy(false);
    }
  }
  const latestDisplayed = page.messages[0];
  return (
    <article aria-label="Selected conversation">
      <header>
        <h3>{c.contactName ?? c.phoneE164}</h3>
        <p>
          {c.phoneE164} · {c.status} · {c.unreadCount} unread · {c.accountStatus} · Consent{" "}
          {c.consentStatus} · Automation {c.automationState}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="inbox-actions">
          <button
            type="button"
            disabled={busy || latestDisplayed === undefined}
            onClick={() => void act(() => inboxApi.markRead(c.id, latestDisplayed?.id ?? ""))}
          >
            Mark displayed read
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => inboxApi.markUnread(c.id))}
          >
            Mark unread
          </button>
          {user.permissions.includes("conversation.close") && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  ["CLOSED", "ARCHIVED"].includes(c.status)
                    ? inboxApi.reopen(c.id)
                    : inboxApi.close(c.id),
                )
              }
            >
              {["CLOSED", "ARCHIVED"].includes(c.status)
                ? "Reopen conversation"
                : "Close conversation"}
            </button>
          )}
        </div>
      </header>
      <InboxAutomationControls
        key={c.id}
        id={c.id}
        automationState={c.automationState}
        updatedAt={c.lastMessageAt ?? ""}
        user={user}
        refresh={refresh}
      />
      <section aria-label="Message history">
        <h3>Messages</h3>
        {older !== null && (
          <p>
            Viewing an older page.{" "}
            <button
              type="button"
              onClick={() => {
                setOlder(null);
              }}
            >
              Return to latest messages
            </button>
          </p>
        )}
        {page.messages.length === 0 && <p>No messages in this conversation yet.</p>}
        <ol className="inbox-messages">
          {[...page.messages].reverse().map((m) => (
            <li key={m.id} className={m.direction === "OUTBOUND" ? "inbox-outbound" : ""}>
              <small>
                {m.direction} · {m.messageType} · {m.status}
              </small>
              <p>{messageText(m)}</p>
              <small>
                {new Date(m.createdAt).toLocaleString()}
                {m.errorCode === null ? "" : ` · ${m.errorCode}`}
              </small>
            </li>
          ))}
        </ol>
        <button
          type="button"
          disabled={busy || !page.nextCursor}
          onClick={() =>
            void act(async () => {
              if (page.nextCursor)
                setOlder(await inboxApi.history(c.id, { cursor: page.nextCursor }));
            })
          }
        >
          Older messages
        </button>
      </section>
      <InboxComposer
        conversation={c}
        user={user}
        refresh={refresh}
        getDraft={getDraft}
        saveDraft={saveDraft}
      />
      <InboxAssignment conversation={c} user={user} refresh={refresh} />
      <InboxCollaboration
        conversation={c}
        notes={notes}
        user={user}
        refresh={refresh}
        getDraft={getNoteDraft}
        saveDraft={saveNoteDraft}
      />
    </article>
  );
}
function messageText(message: ConversationMessage): string {
  const content = message.content;
  if (typeof content.text === "string") return content.text;
  const data = content.data;
  if (typeof data === "object" && data !== null && "body" in data && typeof data.body === "string")
    return data.body;
  if (typeof content.name === "string") return `Template: ${content.name}`;
  return `[${message.messageType} message — attachment/interactive rendering is not supported in this MVP view]`;
}
