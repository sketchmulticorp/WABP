import { useEffect, useState } from "react";
import type { CampaignDraftOptions, CampaignVariable } from "@whatsapp-platform/contracts";
import { campaignApi } from "./campaign-api";

/** Text-only sample from the authorized preview API; never claims recipient-level validity. */
export function MessagePreview({
  template,
  variables,
  permitted,
}: {
  readonly template: CampaignDraftOptions["templates"][number] | undefined;
  readonly variables: Readonly<Record<string, CampaignVariable>>;
  readonly permitted: boolean;
}) {
  const [result, setResult] = useState<{
    id: string;
    preview?: Awaited<ReturnType<typeof campaignApi.preview>>["preview"];
    error?: string;
  } | null>(null);
  const templateId = template?.id;
  useEffect(() => {
    if (!templateId || !permitted) return;
    const controller = new AbortController();
    void campaignApi
      .preview(templateId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ id: templateId, preview: value.preview });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            id: templateId,
            error: "Preview unavailable. Select the template again to retry.",
          });
      });
    return () => {
      controller.abort();
    };
  }, [templateId, permitted]);
  const current = result?.id === template?.id ? result : null;
  function personalize(text: string) {
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (placeholder: string, key: string) => {
      const value = variables[key];
      if (!value) return placeholder;
      return value.source === "LITERAL"
        ? value.value
        : `[Contact ${value.field === "phone_e164" ? "phone" : value.field}]`;
    });
  }
  return (
    <aside className="campaign-preview" aria-label="Message preview">
      <p className="eyebrow">Message preview</p>
      <h3>{template?.name ?? "Your message"}</h3>
      {!template ? (
        <p>Choose a template to preview its text here.</p>
      ) : !permitted ? (
        <p>Your role does not have template preview access.</p>
      ) : current?.error ? (
        <p role="alert">{current.error}</p>
      ) : !current?.preview ? (
        <p role="status">Loading preview…</p>
      ) : (
        <div className="campaign-message">
          {current.preview.header && <strong>{personalize(current.preview.header)}</strong>}
          <p>{personalize(current.preview.body ?? "No text body available.")}</p>
          {current.preview.footer && <small>{personalize(current.preview.footer)}</small>}
        </div>
      )}
      <p className="campaign-help">
        Sample text only. Contact fields are placeholders, not real recipient data. Media, buttons
        and rich formatting are not rendered here. Server checks determine send eligibility.
      </p>
    </aside>
  );
}
