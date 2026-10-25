"use client";

import type {
  CampaignDraft,
  CampaignDraftInput,
  CampaignDraftOptions,
  CampaignPage,
  CampaignPreflightRun,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";
import { useEffect, useState } from "react";
import { campaignApi } from "./campaign-api";
import { CampaignDraftEditor } from "./draft-editor";
import { CampaignLifecyclePanel } from "./campaign-lifecycle-panel";

/** Tenant campaign workspace: drafts, preflight, approval, delivery controls and reports. */
export function CampaignsScreen({
  user,
  onDirtyChange,
}: {
  readonly user: CurrentUserResponse;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const [page, setPage] = useState<CampaignPage | null>(null);
  const [options, setOptions] = useState<CampaignDraftOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ draft: CampaignDraft | null } | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const [preflight, setPreflight] = useState<CampaignPreflightRun | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const canRead =
    user.role.system_key !== "SUPER_ADMIN" && user.permissions.includes("campaign.read");
  const canWrite = user.permissions.includes("campaign.write");

  async function load(nextCursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const [nextPage, nextOptions] = await Promise.all([
        campaignApi.list(nextCursor),
        campaignApi.options(),
      ]);
      setPage(nextPage);
      setOptions(nextOptions);
      setCursor(nextCursor);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    void Promise.all([campaignApi.list(), campaignApi.options()])
      .then(([nextPage, nextOptions]) => {
        if (active) {
          setPage(nextPage);
          setOptions(nextOptions);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(message(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead]);
  useEffect(() => {
    if (preflight === null || (preflight.status !== "QUEUED" && preflight.status !== "PROCESSING"))
      return;
    const timer = window.setInterval(() => {
      void campaignApi
        .preflight(preflight.campaignId, preflight.id)
        .then((result) => {
          setPreflight(result);
        })
        .catch((reason: unknown) => {
          setError(message(reason));
        });
    }, 1_500);
    return () => {
      window.clearInterval(timer);
    };
  }, [preflight]);

  async function edit(id: string) {
    setError(null);
    try {
      setEditor({ draft: await campaignApi.read(id) });
      setEditing(false);
      setDirty(false);
      setEditorGeneration((generation) => generation + 1);
      setNotice(null);
      setPreflight(null);
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function startPreflight() {
    const draft = editor?.draft;
    if (draft === null || draft === undefined) return;
    setError(null);
    setNotice(null);
    try {
      setPreflight(await campaignApi.startPreflight(draft.id));
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function save(input: CampaignDraftInput) {
    if (editor === null) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await campaignApi.save(input, editor.draft);
      setEditor({ draft: saved });
      setEditing(false);
      setDirty(false);
      setPreflight(null);
      setEditorGeneration((generation) => generation + 1);
      setNotice("Draft saved. No messages sent. Review approval and run recipient checks below.");
      // Keep the saved editor even if the background list refresh fails.
      setPage(await campaignApi.list(cursor));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead)
    return (
      <section>
        <h2>Campaigns</h2>
        <p role="alert">You do not have permission to view tenant campaigns.</p>
      </section>
    );
  return (
    <section className="campaign-workspace">
      <div className="campaign-heading">
        <div>
          <p className="eyebrow">WhatsApp messaging</p>
          <h2>
            {editor === null
              ? "Campaigns"
              : editing
                ? "Campaign builder"
                : (editor.draft?.name ?? "New campaign")}
          </h2>
        </div>
        {editor !== null && !editing && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditor(null);
              setPreflight(null);
            }}
          >
            All campaigns
          </button>
        )}
      </div>
      <p>
        {editor === null
          ? "Create a message, choose your audience, then review before sending."
          : "Save a draft first. Approval and recipient checks protect every delivery."}
      </p>
      {error !== null && (
        <div role="alert" className="form-error">
          <p>{error}</p>
          <button type="button" disabled={saving || loading} onClick={() => void load(cursor)}>
            Retry list
          </button>
          {editor?.draft !== null && editor?.draft !== undefined && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const draft = editor.draft;
                if (
                  draft !== null &&
                  (!dirty || window.confirm("Discard unsaved edits and reload the current draft?"))
                )
                  void edit(draft.id);
              }}
            >
              Reload draft
            </button>
          )}
        </div>
      )}
      {notice !== null && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading campaigns…</p>}
      {options !== null && (
        <>
          {canWrite && editor === null && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditor({ draft: null });
                setEditing(true);
                setDirty(false);
                setEditorGeneration((generation) => generation + 1);
                setError(null);
                setNotice(null);
              }}
            >
              New campaign
            </button>
          )}
          {(options.accounts.length === 0 || options.templates.length === 0) && (
            <details className="campaign-prerequisites" open={editor === null}>
              <summary>Setup required before saving a campaign</summary>
              <p>
                {options.accounts.length === 0
                  ? "A connected WhatsApp account is needed to save a campaign."
                  : "Your sending account is available."}{" "}
                {options.templates.length === 0
                  ? "You also need a message template. Open WhatsApp setup and Templates to complete the prerequisites."
                  : "Choose a template in the campaign builder."}
              </p>
            </details>
          )}
          {editor !== null && (
            <>
              {editing &&
                (editor.draft === null || (editor.draft.status === "DRAFT" && canWrite)) && (
                  <CampaignDraftEditor
                    key={editorGeneration}
                    existing={editor.draft}
                    options={options}
                    saving={saving}
                    onSave={(input) => void save(input)}
                    onClose={() => {
                      setEditing(false);
                      setDirty(false);
                      if (editor.draft === null) setEditor(null);
                    }}
                    canReadContacts={user.permissions.includes("contact.read")}
                    canPreview={user.permissions.includes("template.read")}
                    onDirtyChange={setDirty}
                  />
                )}
              {editor.draft !== null && !editing && (
                <>
                  {editor.draft.status === "DRAFT" && canWrite && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEditing(true);
                        setDirty(false);
                      }}
                    >
                      Edit draft
                    </button>
                  )}
                  <CampaignLifecyclePanel
                    draft={editor.draft}
                    options={options}
                    user={user}
                    onChanged={(draft) => {
                      setEditor({ draft });
                      setPreflight(null);
                      setEditorGeneration((value) => value + 1);
                      void load(cursor);
                    }}
                  />
                </>
              )}
              {user.deployment_mode !== "preview" &&
                editor.draft !== null &&
                !editing &&
                editor.draft.status === "DRAFT" &&
                canWrite && (
                  <section aria-labelledby="campaign-preflight-title">
                    <h3 id="campaign-preflight-title">Recipient checks</h3>
                    <p>
                      Check consent, duplicates, required values and quota for the saved draft. This
                      does not send messages.
                    </p>
                    <button
                      type="button"
                      disabled={
                        preflight?.status === "QUEUED" || preflight?.status === "PROCESSING"
                      }
                      onClick={() => void startPreflight()}
                    >
                      {preflight?.status === "QUEUED" || preflight?.status === "PROCESSING"
                        ? "Checking campaign…"
                        : "Run preflight"}
                    </button>
                    {preflight !== null && <PreflightResult run={preflight} />}
                  </section>
                )}
            </>
          )}
          {editor === null && page?.campaigns.length === 0 && (
            <div className="campaign-empty">
              <h3>Your first campaign starts here</h3>
              <p>
                Create a draft, personalize your message and review the audience. Nothing is sent
                until an authorized delivery action.
              </p>
            </div>
          )}
          {editor === null && page !== null && page.campaigns.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Approval</th>
                    <th>Timing</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {page.campaigns.map((draft) => (
                    <tr key={draft.id}>
                      <td>{draft.name}</td>
                      <td>
                        <span className="status-badge">{displayStatus(draft.status)}</span>
                      </td>
                      <td>{displayStatus(draft.approvalStatus)}</td>
                      <td>
                        {draft.scheduleAt
                          ? new Date(draft.scheduleAt).toLocaleString(undefined, {
                              timeZone: "UTC",
                            }) + " UTC"
                          : "When authorized"}
                      </td>
                      <td>
                        <button type="button" disabled={saving} onClick={() => void edit(draft.id)}>
                          Open {draft.name}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {editor === null && (
            <div className="pagination">
              <button
                type="button"
                disabled={cursor === undefined || saving}
                onClick={() => void load()}
              >
                First page
              </button>
              <button
                type="button"
                disabled={page?.nextCursor === null || page === null || saving}
                onClick={() => void load(page?.nextCursor ?? undefined)}
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function displayStatus(value: string) {
  return value === "NOT_REQUIRED"
    ? "No review required"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./u, (letter) => letter.toUpperCase());
}
function PreflightResult({ run }: { readonly run: CampaignPreflightRun }) {
  if (run.status === "QUEUED" || run.status === "PROCESSING")
    return <p role="status">Resolving recipients and validating policy…</p>;
  if (run.status === "FAILED")
    return (
      <p role="alert">
        Preflight failed safely ({run.errorCode ?? "unknown error"}). You can retry.
      </p>
    );
  if (run.status === "SUPERSEDED")
    return (
      <p role="alert">
        This result became stale because the campaign changed. Run preflight again.
      </p>
    );
  const estimate = run.estimates;
  if (estimate === null) return <p role="alert">The completed preflight has no estimate.</p>;
  return (
    <div role="status">
      <p>
        {run.blockers.length === 0
          ? "Preflight passed."
          : `Preflight blocked: ${run.blockers.join(", ")}`}
      </p>
      <dl>
        <dt>Resolved recipients</dt>
        <dd>{estimate.resolvedRecipients}</dd>
        <dt>Eligible</dt>
        <dd>{estimate.eligibleRecipients}</dd>
        <dt>Skipped</dt>
        <dd>{estimate.skippedRecipients}</dd>
        <dt>Duplicate selections removed</dt>
        <dd>{estimate.duplicateSelections}</dd>
        <dt>Estimated message usage</dt>
        <dd>{estimate.estimatedUsage}</dd>
        <dt>Monthly quota remaining</dt>
        <dd>{estimate.monthlyRemaining}</dd>
      </dl>
      {Object.keys(estimate.skippedByReason).length > 0 && (
        <p>
          Skipped reasons:{" "}
          {Object.entries(estimate.skippedByReason)
            .map(([reason, count]) => `${reason}: ${String(count)}`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The campaign request failed.";
}
