"use client";
import { useEffect, useState } from "react";
import type { CurrentUserResponse } from "@whatsapp-platform/contracts";
import {
  templateApi,
  type TemplateAccount,
  type TemplateRecord,
  type TemplateTextInput,
} from "./template-api";
import { editableText, type TextContent } from "./template-content";
import { TemplateEditor } from "./template-editor";
import { TemplateDetail } from "./template-detail";

const EMPTY_TEXT: TextContent = { header: "", body: "", footer: "" };
/** Tenant library and internal review. No UI action simulates Meta approval or submission. */
export function TemplatesScreen({
  user,
  onDirtyChange,
}: {
  readonly user: CurrentUserResponse;
  readonly onDirtyChange: (value: boolean) => void;
}) {
  const canRead =
    user.role.system_key !== "SUPER_ADMIN" && user.permissions.includes("template.read");
  const canAccounts = user.permissions.includes("whatsapp.read");
  const [templates, setTemplates] = useState<readonly TemplateRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly TemplateAccount[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    existing: TemplateRecord | null;
    initial: TextContent;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [providerStatus, setProviderStatus] = useState("");
  const [accountId, setAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    void templateApi
      .list(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setTemplates(value);
          setError(null);
        }
      })
      .catch((value: unknown) => {
        if (!controller.signal.aborted) {
          setTemplates([]);
          setSelectedId(null);
          setError(message(value));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    if (canAccounts)
      void templateApi
        .accounts(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setAccounts(value);
            setAccountError(null);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setAccounts([]);
            setAccountError("Sending accounts could not be loaded. Refresh to retry.");
          }
        });
    return () => {
      controller.abort();
    };
  }, [canRead, canAccounts, reload]);
  if (!canRead)
    return (
      <section>
        <h2>Templates</h2>
        <p role="alert">You do not have access to tenant templates.</p>
      </section>
    );
  const selected = templates.find((value) => value.id === selectedId);
  const compatible = selected ? editableText(selected) : null;
  const local = selected?.providerStatus === "DRAFT" && !selected.providerTemplateId;
  const has = (permission: string) => user.permissions.includes(permission);
  const visible = templates.filter(
    (value) =>
      (!category || value.category === category) &&
      (!providerStatus || value.providerStatus === providerStatus) &&
      `${value.name} ${value.language}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }
  function discard() {
    return !dirty || window.confirm("Discard unsaved template changes?");
  }
  function saved(value: TemplateRecord) {
    setTemplates((rows) =>
      [...rows.filter((row) => row.id !== value.id), value].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setSelectedId(value.id);
    setEditor(null);
    setDirty(false);
  }
  async function save(input: TemplateTextInput, selectedAccount: string) {
    if (!editor) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      saved(await templateApi.save(input, editor.existing, selectedAccount));
      setNotice("Local template saved. Nothing submitted to Meta or sent.");
    } catch (value: unknown) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }
  async function review(action: "request-approval" | "approve" | "reject") {
    if (!selected) return;
    if (
      !window.confirm(
        `${action === "request-approval" ? "Request internal Admin review" : action === "approve" ? "Approve this exact saved template version" : "Reject this saved template version"}? This does not submit it to Meta.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      saved(
        await templateApi.review(selected, action, action === "reject" ? reason.trim() : undefined),
      );
      setReason("");
      setNotice("Internal review updated. Meta approval is unchanged.");
    } catch (value: unknown) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (
      !accountId ||
      !window.confirm(
        "Synchronize templates from Meta for this account? Provider content may replace matching local content and require renewed internal approval.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const value = await templateApi.sync(accountId);
      setNotice(`${String(value.synchronized)} templates synchronized from Meta.`);
      refresh();
    } catch (value: unknown) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="templates-workspace">
      <div className="campaign-heading">
        <div>
          <p className="eyebrow">WhatsApp messages</p>
          <h2>Templates</h2>
          <p>Create reusable messages. Internal Admin review and Meta approval are separate.</p>
        </div>
        <div className="template-actions">
          <button type="button" disabled={busy || editor !== null} onClick={refresh}>
            Refresh templates
          </button>
          {has("template.write") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (discard()) {
                  setEditor({ existing: null, initial: EMPTY_TEXT });
                  setDirty(false);
                  setError(null);
                  setNotice(null);
                }
              }}
            >
              New template
            </button>
          )}
        </div>
      </div>
      <p className="campaign-help">
        Meta submission is not available in this application yet. Create and approve provider
        templates in Meta, then synchronize here; local drafts are not send-ready.
      </p>
      {accountError && <p role="alert">{accountError}</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          {editor && (
            <p>
              Your input is retained. Close the editor before refreshing; refresh never overwrites
              an unsaved draft.
            </p>
          )}
          {!editor && (
            <button type="button" onClick={refresh} disabled={busy}>
              Retry templates
            </button>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {has("template.sync") && (
        <div className="template-sync">
          <label>
            Account to synchronize
            <select
              value={accountId}
              disabled={busy || editor !== null}
              onChange={(event) => {
                setAccountId(event.target.value);
              }}
            >
              <option value="">Select sending account</option>
              {accounts
                .filter((value) => value.status === "CONNECTED")
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.displayName ?? value.displayPhone}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!accountId || busy || editor !== null}
            onClick={() => {
              void sync();
            }}
          >
            Sync from Meta
          </button>
        </div>
      )}
      {editor ? (
        <TemplateEditor
          key={
            editor.existing
              ? `${editor.existing.id}:${String(editor.existing.contentVersion)}`
              : "new"
          }
          existing={editor.existing}
          initial={editor.initial}
          accounts={accounts}
          busy={busy}
          onSave={(input, value) => {
            void save(input, value);
          }}
          onClose={() => {
            setEditor(null);
            setDirty(false);
          }}
          onDirtyChange={setDirty}
        />
      ) : (
        <div className="template-library-layout">
          <aside aria-label="Template library" className="template-library">
            <label>
              Search templates
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Name or language"
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                }}
              >
                <option value="">All categories</option>
                {[...new Set(templates.map((value) => value.category))].sort().map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Meta status
              <select
                value={providerStatus}
                onChange={(event) => {
                  setProviderStatus(event.target.value);
                }}
              >
                <option value="">All Meta statuses</option>
                {[...new Set(templates.map((value) => value.providerStatus))]
                  .sort()
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </label>
            {loading ? (
              <p role="status">Loading templates…</p>
            ) : templates.length === 0 ? (
              <p>
                No templates yet. Connect an account, synchronize existing Meta templates or create
                a local draft.
              </p>
            ) : visible.length === 0 ? (
              <p>No templates match these filters.</p>
            ) : (
              <ul>
                {visible.map((value) => (
                  <li key={value.id}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selectedId === value.id}
                      onClick={() => {
                        setSelectedId(value.id);
                        setReason("");
                        setError(null);
                      }}
                    >
                      <strong>{value.name}</strong>
                      <span>
                        {value.language} · {value.category}
                      </span>
                      <span>
                        Meta: {value.providerStatus} · Internal: {value.approvalStatus}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <div className="template-detail">
            {selected ? (
              <>
                <div className="campaign-heading">
                  <div>
                    <h3>{selected.name}</h3>
                    <p>
                      {selected.language} · {selected.category}
                    </p>
                  </div>
                  {has("template.write") && local && compatible && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditor({ existing: selected, initial: compatible });
                        setDirty(false);
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      Edit local draft
                    </button>
                  )}
                </div>
                <dl className="campaign-review">
                  <dt>Meta approval</dt>
                  <dd>{selected.providerStatus}</dd>
                  <dt>Internal review</dt>
                  <dd>
                    {selected.approvalStatus === "NOT_REQUIRED"
                      ? "No second approval required"
                      : selected.approvalStatus}
                  </dd>
                  <dt>Version</dt>
                  <dd>{selected.contentVersion}</dd>
                </dl>
                {selected.rejectionReason && (
                  <p role="alert">Meta rejection: {selected.rejectionReason}</p>
                )}
                {selected.approvalRejectionReason && (
                  <p role="alert">Internal rejection: {selected.approvalRejectionReason}</p>
                )}
                {(!local || !compatible) && (
                  <p className="campaign-help">
                    View-only: synchronized templates and unsupported component/category shapes
                    cannot be edited in this text-first editor. Content will not be flattened or
                    dropped.
                  </p>
                )}
                <TemplateDetail
                  key={`${selected.id}:${String(selected.contentVersion)}:${selected.updatedAt}`}
                  template={selected}
                />
                <div className="template-actions">
                  {user.role.system_key === "TENANT_USER" &&
                    local &&
                    compatible &&
                    has("template.write") &&
                    selected.approvalStatus === "DRAFT" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void review("request-approval");
                        }}
                      >
                        Request Admin review
                      </button>
                    )}
                  {user.role.system_key === "TENANT_ADMIN" &&
                    local &&
                    compatible &&
                    has("template.approve") &&
                    selected.approvalStatus === "PENDING" &&
                    selected.approvalRequestedBy !== user.id && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void review("approve");
                          }}
                        >
                          Approve saved version
                        </button>
                        <label>
                          Rejection reason
                          <input
                            maxLength={1000}
                            value={reason}
                            onChange={(event) => {
                              setReason(event.target.value);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy || !reason.trim()}
                          onClick={() => {
                            void review("reject");
                          }}
                        >
                          Reject saved version
                        </button>
                      </>
                    )}
                </div>
              </>
            ) : (
              <p>Select a template to see its content, Meta status and internal review.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function message(value: unknown) {
  return value instanceof Error ? value.message : "Template request failed. Try again.";
}
