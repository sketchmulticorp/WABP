"use client";
import { useEffect, useId, useState, type SyntheticEvent } from "react";
import type { ConversationSummary, CurrentUserResponse } from "@whatsapp-platform/contracts";
import { ApiClientError, request } from "../workspace/api-client";
import { inboxApi, type InboxReplyContent } from "./inbox-api";

interface Template {
  id: string;
  whatsappAccountId: string;
  name: string;
  language: string;
  providerStatus: string;
  approvalStatus: string;
  approvedVersion: number | null;
  contentVersion: number;
  components: unknown;
}
export interface ReplyDraft {
  text: string;
  mode: "TEXT" | "TEMPLATE";
  templateId: string;
  variables: Record<string, string>;
  key: string | null;
}
const blank = (): ReplyDraft => ({
  text: "",
  mode: "TEXT",
  templateId: "",
  variables: {},
  key: null,
});

/** Drafts survive selection/poll refresh; keys survive uncertain request failures. */
export function InboxComposer({
  conversation,
  user,
  refresh,
  getDraft,
  saveDraft,
}: {
  readonly conversation: ConversationSummary;
  readonly user: CurrentUserResponse;
  readonly refresh: () => void;
  readonly getDraft: () => ReplyDraft | undefined;
  readonly saveDraft: (draft: ReplyDraft) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState(() => getDraft() ?? blank());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const canTemplates = user.permissions.includes("template.read");
  useEffect(() => {
    if (!canTemplates) return;
    const controller = new AbortController();
    void request<Template[]>("/templates", { signal: controller.signal, cache: "no-store" })
      .then((rows) => {
        if (!controller.signal.aborted) setTemplates(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Template options could not load. Reopen this conversation to retry.");
      });
    return () => {
      controller.abort();
    };
  }, [canTemplates]);
  function update(next: ReplyDraft) {
    saveDraft(next);
    setDraft(next);
  }
  const eligible = templates.filter(
    (t) =>
      t.whatsappAccountId === conversation.whatsappAccountId &&
      t.providerStatus === "APPROVED" &&
      (t.approvalStatus === "NOT_REQUIRED" ||
        (t.approvalStatus === "APPROVED" && t.approvedVersion === t.contentVersion)) &&
      templateKeys(t.components) !== null,
  );
  const template = eligible.find((t) => t.id === draft.templateId);
  const variables = template === undefined ? [] : (templateKeys(template.components) ?? []);
  const reason = !user.permissions.includes("conversation.reply")
    ? "Reply permission is required."
    : !["OPEN", "PENDING"].includes(conversation.status)
      ? "Reopen this conversation before replying."
      : !["NONE", "PAUSED", "HANDED_OFF"].includes(conversation.automationState)
        ? "Explicit handoff/pause is required while automation is active."
        : conversation.accountStatus !== "CONNECTED"
          ? "The WhatsApp account is not connected."
          : ["OPTED_OUT", "SUPPRESSED"].includes(conversation.consentStatus)
            ? "This Contact cannot receive outbound messages."
            : draft.mode === "TEXT" && !conversation.serviceWindowOpen
              ? "The reply window is closed. Use an eligible approved template."
              : draft.mode === "TEMPLATE" && (!canTemplates || template === undefined)
                ? "Select an eligible template; template.read permission is required."
                : null;
  async function send(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      reason !== null ||
      !window.confirm(
        "Send this reply? It uses your business message quota. Delivery is asynchronous.",
      )
    )
      return;
    const key = draft.key ?? crypto.randomUUID();
    update({ ...draft, key });
    setBusy(true);
    setError(null);
    setNotice(null);
    const content: InboxReplyContent =
      draft.mode === "TEXT"
        ? { type: "TEXT", text: draft.text }
        : { type: "TEMPLATE", templateId: draft.templateId, variables: draft.variables };
    try {
      const result = await inboxApi.reply(conversation.id, key, content);
      update(blank());
      setNotice(`Reply ${result.status}. Check message history for delivery updates.`);
      refresh();
    } catch (value) {
      if (value instanceof ApiClientError && value.status >= 400 && value.status < 500)
        update({ ...draft, key: null });
      setError(
        `${value instanceof Error ? value.message : "Reply failed."} If the outcome is uncertain, check history; retry unchanged content with its retained key.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Reply composer">
      <h3>Reply</h3>
      <p>
        {conversation.serviceWindowOpen
          ? "Customer-service window open"
          : "Customer-service window closed"}{" "}
        · Server policy is checked again on send.
      </p>
      {reason && <p>{reason}</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={(event) => void send(event)}>
        <fieldset disabled={busy || !user.permissions.includes("conversation.reply")}>
          <label>
            Reply type
            <select
              value={draft.mode}
              onChange={(e) => {
                update({ ...draft, mode: e.target.value as ReplyDraft["mode"], key: null });
              }}
            >
              <option value="TEXT">Text</option>
              <option value="TEMPLATE" disabled={!canTemplates}>
                Approved template
              </option>
            </select>
          </label>
          {draft.mode === "TEXT" ? (
            <>
              <label htmlFor={`${fieldId}-text`}>Reply text</label>
              <textarea
                id={`${fieldId}-text`}
                required
                maxLength={4096}
                value={draft.text}
                onChange={(e) => {
                  update({ ...draft, text: e.target.value, key: null });
                }}
              />
            </>
          ) : (
            <>
              <label htmlFor={`${fieldId}-template`}>Reply template</label>
              <select
                id={`${fieldId}-template`}
                required
                value={draft.templateId}
                onChange={(e) => {
                  update({ ...draft, templateId: e.target.value, variables: {}, key: null });
                }}
              >
                <option value="">Select template</option>
                {eligible.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              {template !== undefined && (
                <p className="inbox-template-preview">
                  Template content (placeholders shown): {templatePreview(template.components)}
                </p>
              )}
              {variables.map((name) => (
                <label key={name}>
                  Template variable {name}
                  <input
                    required
                    maxLength={4096}
                    value={draft.variables[name] ?? ""}
                    onChange={(e) => {
                      update({
                        ...draft,
                        variables: { ...draft.variables, [name]: e.target.value },
                        key: null,
                      });
                    }}
                  />
                </label>
              ))}
            </>
          )}
          <button type="submit" disabled={reason !== null}>
            Send reply
          </button>
        </fieldset>
      </form>
    </section>
  );
}
function templatePreview(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((row: unknown) =>
      typeof row === "object" && row !== null && "text" in row && typeof row.text === "string"
        ? row.text
        : "",
    )
    .filter(Boolean)
    .join("\n");
}
/** Presentation capability filter only; the common backend remains authoritative. */
function templateKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const keys = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || !("type" in raw)) return null;
    const row = raw as Record<string, unknown>;
    if (
      !["BODY", "HEADER", "FOOTER"].includes(String(row.type)) ||
      (row.type === "HEADER" && row.format !== undefined && row.format !== "TEXT")
    )
      return null;
    if (typeof row.text === "string" && row.type !== "FOOTER")
      for (const match of row.text.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu))
        if (match[1] !== undefined) keys.add(match[1]);
  }
  return [...keys];
}
