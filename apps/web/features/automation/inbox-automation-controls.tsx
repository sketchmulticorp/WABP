"use client";
import { useEffect, useState } from "react";
import type {
  ConversationAutomationStatus,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";
import { automationApi } from "./automation-api";

/** Explicit ownership changes, separate from sending a human reply or assigning a colleague. */
export function InboxAutomationControls({
  id,
  automationState,
  updatedAt,
  user,
  refresh,
}: {
  readonly id: string;
  readonly automationState: string;
  readonly updatedAt: string;
  readonly user: CurrentUserResponse;
  readonly refresh: () => void;
}) {
  const [status, setStatus] = useState<ConversationAutomationStatus | null>(null),
    [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void automationApi
      .conversation(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setStatus(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setStatus(null);
          setError(reason instanceof Error ? reason.message : "Automation status unavailable.");
        }
      });
    return () => {
      controller.abort();
    };
  }, [id, automationState, updatedAt, attempt]);
  async function command(action: "takeover" | "allow") {
    if (
      !window.confirm(
        action === "takeover"
          ? "Stop bot ownership and queued bot sends? A provider request already submitted may finish."
          : "Allow future keyword-triggered runs? This does not resume the old run.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await automationApi.conversationCommand(id, action));
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Automation ownership change failed.");
    } finally {
      setBusy(false);
    }
  }
  const state = status?.automationState ?? automationState;
  return (
    <section aria-label="Automation ownership">
      <p>
        Bot ownership: {state}
        {status?.run === null || status?.run === undefined ? "" : ` · Run ${status.run.status}`}
      </p>
      {status?.run?.reason !== null && status?.run?.reason !== undefined && (
        <p role="status">Automation reason: {status.run.reason}</p>
      )}
      {error !== null && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAttempt((n) => n + 1);
            }}
          >
            Retry status
          </button>
        </p>
      )}
      {user.permissions.includes("conversation.reply") && (
        <div className="inbox-actions">
          <button
            type="button"
            disabled={busy || state === "HANDED_OFF"}
            onClick={() => void command("takeover")}
          >
            Take over / disable bot
          </button>
          <button
            type="button"
            disabled={busy || !["PAUSED", "HANDED_OFF"].includes(state)}
            onClick={() => void command("allow")}
          >
            Allow future automation
          </button>
        </div>
      )}
      <small>
        Human replies never implicitly resume automation. Already submitted messages cannot be
        recalled.
      </small>
    </section>
  );
}
