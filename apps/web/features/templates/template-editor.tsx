import { useEffect, useState, type SyntheticEvent } from "react";
import type { TemplateAccount, TemplateRecord, TemplateTextInput } from "./template-api";
import { textInput, type TextContent } from "./template-content";

/** Local text drafts only. This form never submits a template to Meta or sends messages. */
export function TemplateEditor({
  existing,
  initial,
  accounts,
  busy,
  onSave,
  onClose,
  onDirtyChange,
}: {
  readonly existing: TemplateRecord | null;
  readonly initial: TextContent;
  readonly accounts: readonly TemplateAccount[];
  readonly busy: boolean;
  readonly onSave: (input: TemplateTextInput, accountId: string) => void;
  readonly onClose: () => void;
  readonly onDirtyChange: (value: boolean) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [language, setLanguage] = useState(existing?.language ?? "en_US");
  const [category, setCategory] = useState(existing?.category ?? "UTILITY");
  const [account, setAccount] = useState(existing?.whatsappAccountId ?? "");
  const [content, setContent] = useState(initial);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(textInput(name, language, category, content), account);
  }
  return (
    <form
      className="template-editor"
      aria-label="Template text editor"
      onSubmit={submit}
      onChangeCapture={() => {
        setDirty(true);
      }}
    >
      <div className="campaign-heading">
        <div>
          <p className="eyebrow">Local draft</p>
          <h3>{existing ? "Edit template" : "Create a template"}</h3>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!dirty || window.confirm("Discard unsaved template changes?")) onClose();
          }}
        >
          Close editor
        </button>
      </div>
      <p>
        Save a local text draft and request internal review. Meta approval is separate; this does
        not submit or send it.
      </p>
      <fieldset disabled={busy} className="template-edit-grid">
        <div>
          {!existing && (
            <label>
              Sending account
              <select
                required
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                }}
              >
                <option value="">Select connected account</option>
                {accounts
                  .filter((value) => value.status === "CONNECTED")
                  .map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.displayName ?? value.displayPhone}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Template name
            <input
              required
              maxLength={512}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <label>
            Language code
            <input
              required
              maxLength={32}
              value={language}
              placeholder="en_US"
              onChange={(event) => {
                setLanguage(event.target.value);
              }}
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
              <option value="UTILITY">Utility</option>
              <option value="MARKETING">Marketing</option>
            </select>
          </label>
          <label>
            Header (optional)
            <input
              maxLength={4000}
              value={content.header}
              onChange={(event) => {
                setContent({ ...content, header: event.target.value });
              }}
            />
          </label>
          <label>
            Message body
            <textarea
              required
              maxLength={4000}
              rows={6}
              value={content.body}
              onChange={(event) => {
                setContent({ ...content, body: event.target.value });
              }}
            />
          </label>
          <p className="campaign-help">
            Use placeholders such as {"{{1}}"} or {"{{customer_name}}"}. Server and provider rules
            determine eligibility; local saving is not Meta approval.
          </p>
          <label>
            Footer (optional)
            <input
              maxLength={4000}
              value={content.footer}
              onChange={(event) => {
                setContent({ ...content, footer: event.target.value });
              }}
            />
          </label>
        </div>
        <aside className="campaign-preview" aria-label="Draft message preview">
          <p className="eyebrow">Live text preview</p>
          <div className="campaign-message">
            {content.header && <strong>{content.header}</strong>}
            <p>{content.body || "Your message appears here."}</p>
            {content.footer && <small>{content.footer}</small>}
          </div>
          <p className="campaign-help">
            Sample text, with placeholders left visible. No media/buttons or recipient data.
          </p>
        </aside>
      </fieldset>
      {!existing && !accounts.some((value) => value.status === "CONNECTED") && (
        <p role="status">
          No connected sending account is available. Complete WhatsApp setup before saving a
          template.
        </p>
      )}
      <button
        type="submit"
        disabled={busy || (!existing && !accounts.some((value) => value.status === "CONNECTED"))}
      >
        {busy ? "Saving…" : "Save local draft"}
      </button>
    </form>
  );
}
