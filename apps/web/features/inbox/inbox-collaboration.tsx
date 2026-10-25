"use client";
import { useEffect, useId, useState, type SyntheticEvent } from "react";
import type {
  ConversationNotesResponse,
  ConversationSummary,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";
import { inboxApi } from "./inbox-api";

export interface NoteDraft {
  text: string;
  id: string | null;
}
export function InboxCollaboration({
  conversation,
  notes,
  user,
  refresh,
  getDraft,
  saveDraft,
}: {
  readonly conversation: ConversationSummary;
  readonly notes: ConversationNotesResponse;
  readonly user: CurrentUserResponse;
  readonly refresh: () => void;
  readonly getDraft: () => NoteDraft | undefined;
  readonly saveDraft: (draft: NoteDraft) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState(() => getDraft() ?? { text: "", id: null });
  const [older, setOlder] = useState<ConversationNotesResponse | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  function update(value: NoteDraft) {
    saveDraft(value);
    setDraft(value);
  }
  async function add(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = draft.id ?? crypto.randomUUID();
    update({ ...draft, id });
    setBusy(true);
    setError(null);
    try {
      await inboxApi.createNote(conversation.id, id, draft.text);
      update({ text: "", id: null });
      setOlder(null);
      refresh();
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Note failed. Retry unchanged text to reuse its ID.",
      );
    } finally {
      setBusy(false);
    }
  }
  const page = older ?? notes;
  async function olderNotes() {
    if (!page.nextCursor) return;
    setBusy(true);
    setError(null);
    try {
      setOlder(await inboxApi.notes(conversation.id, { cursor: page.nextCursor }));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Notes could not load.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Internal notes">
      <h3>Internal notes</h3>
      <p>Team-only plain text. Never sent to WhatsApp; notes cannot be edited or deleted.</p>
      {error && <p role="alert">{error}</p>}
      {page.notes.length === 0 && <p>No internal notes yet.</p>}
      <ul className="inbox-notes">
        {page.notes.map((note) => (
          <li key={note.id}>
            <p>{note.note}</p>
            <small>
              {note.authorId === user.id ? "You" : `Team member ${note.authorId.slice(0, 8)}`} ·{" "}
              {new Date(note.createdAt).toLocaleString()}
            </small>
          </li>
        ))}
      </ul>
      {older !== null && (
        <button
          type="button"
          onClick={() => {
            setOlder(null);
          }}
        >
          Latest notes
        </button>
      )}
      <button type="button" disabled={busy || !page.nextCursor} onClick={() => void olderNotes()}>
        Older notes
      </button>
      {user.permissions.includes("conversation.reply") ? (
        <form onSubmit={(e) => void add(e)}>
          <fieldset disabled={busy}>
            <label htmlFor={`${fieldId}-note`}>Internal note</label>
            <textarea
              id={`${fieldId}-note`}
              required
              maxLength={4000}
              value={draft.text}
              onChange={(e) => {
                update({ text: e.target.value, id: null });
              }}
            />
            <button type="submit">Add internal note</button>
          </fieldset>
        </form>
      ) : (
        <p>Note creation requires reply permission.</p>
      )}
    </section>
  );
}

export function InboxAssignment({
  conversation,
  user,
  refresh,
}: {
  readonly conversation: ConversationSummary;
  readonly user: CurrentUserResponse;
  readonly refresh: () => void;
}) {
  const canAssign = user.permissions.includes("conversation.assign");
  const [options, setOptions] = useState<{ id: string; displayName: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canAssign) return;
    const controller = new AbortController();
    void inboxApi
      .assignees(undefined, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setOptions([...page.assignees]);
          setCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Team options could not load. Use Load team options to retry.");
      });
    return () => {
      controller.abort();
    };
  }, [canAssign]);
  async function more() {
    setBusy(true);
    setError(null);
    try {
      const page = await inboxApi.assignees(cursor ?? undefined);
      setOptions((prior) => [
        ...new Map([...prior, ...page.assignees].map((item) => [item.id, item])).values(),
      ]);
      setCursor(page.nextCursor);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Team options failed.");
    } finally {
      setBusy(false);
    }
  }
  async function assign(value: string) {
    setBusy(true);
    setError(null);
    try {
      await inboxApi.assign(conversation.id, value || null);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Assignment failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Conversation assignment">
      <h3>Assignment</h3>
      {error && <p role="alert">{error}</p>}
      {canAssign ? (
        <>
          <label>
            Assigned team member
            <select
              disabled={busy}
              value={conversation.assignedUserId ?? ""}
              onChange={(e) => void assign(e.target.value)}
            >
              <option value="">Unassigned</option>
              {conversation.assignedUserId !== null &&
                !options.some((o) => o.id === conversation.assignedUserId) && (
                  <option value={conversation.assignedUserId} disabled>
                    Current/unavailable member ({conversation.assignedUserId.slice(0, 8)})
                  </option>
                )}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || (options.length > 0 && cursor === null)}
            onClick={() => void more()}
          >
            Load team options
          </button>
          <p>Assignment does not grant access or perform automation handoff.</p>
        </>
      ) : (
        <p>
          {conversation.assignedUserId === null
            ? "Unassigned"
            : `Assigned member ${conversation.assignedUserId.slice(0, 8)}`}
          . Assignment permission is required to change it.
        </p>
      )}
    </section>
  );
}
