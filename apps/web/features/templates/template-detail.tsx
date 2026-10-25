import { useEffect, useState } from "react";
import type { TemplateRecord } from "./template-api";
import { templateApi } from "./template-api";

/** Saved preview is fetched through tenant authorization; stale selection requests are aborted. */
export function TemplateDetail({ template }: { readonly template: TemplateRecord }) {
  const [state, setState] = useState<{
    preview?: { header: string | null; body: string | null; footer: string | null };
    error?: string;
  }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void templateApi
      .preview(template.id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ preview: value.preview });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ error: error instanceof Error ? error.message : "Preview unavailable." });
      });
    return () => {
      controller.abort();
    };
  }, [template.id, retry]);
  return (
    <section aria-label="Saved template preview" className="template-saved-preview">
      <h3>Message preview</h3>
      {state.error ? (
        <div role="alert">
          <p>{state.error}</p>
          <button
            type="button"
            onClick={() => {
              setState({});
              setRetry((value) => value + 1);
            }}
          >
            Retry preview
          </button>
        </div>
      ) : !state.preview ? (
        <p role="status">Loading saved preview…</p>
      ) : (
        <div className="campaign-message">
          {state.preview.header && <strong>{state.preview.header}</strong>}
          <p>{state.preview.body ?? "No text body available."}</p>
          {state.preview.footer && <small>{state.preview.footer}</small>}
        </div>
      )}
      <p className="campaign-help">
        Text-only preview. Media, buttons, authentication-specific elements and rich formatting are
        not rendered. Placeholders are not real recipient data.
      </p>
    </section>
  );
}
