import type {
  CampaignDraft,
  CampaignDraftInput,
  CampaignDraftOptions,
  CampaignPage,
  CampaignPreflightRun,
  CampaignReport,
} from "@whatsapp-platform/contracts";
import { request } from "../workspace/api-client";

/** Uses the shared authenticated client; no provider or tenant selection exists in the browser. */
export const campaignApi = {
  list: (cursor?: string) =>
    request<CampaignPage>(
      `/campaigns${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
    ),
  read: (id: string) => request<CampaignDraft>(`/campaigns/${id}`),
  options: () => request<CampaignDraftOptions>("/campaigns/draft-options"),
  preview: (id: string, signal: AbortSignal) =>
    request<{ preview: { header: string | null; body: string | null; footer: string | null } }>(
      `/templates/${id}/preview`,
      { signal },
    ),
  save: (input: CampaignDraftInput, existing: CampaignDraft | null) =>
    request<CampaignDraft>(existing === null ? "/campaigns" : `/campaigns/${existing.id}`, {
      method: existing === null ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        ...(existing === null
          ? {}
          : {
              expectedContentVersion: existing.contentVersion,
              expectedRevision: existing.revision,
            }),
      }),
    }),
  contacts: (cursor?: string) =>
    request<{
      contacts: readonly { id: string; name: string | null; phoneE164: string }[];
      nextCursor: string | null;
    }>(`/contacts${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`),
  startPreflight: (campaignId: string) =>
    request<CampaignPreflightRun>(`/campaigns/${campaignId}/preflight`, { method: "POST" }),
  preflight: (campaignId: string, runId: string) =>
    request<CampaignPreflightRun>(`/campaigns/${campaignId}/preflight/${runId}`),
  command: (draft: CampaignDraft, action: string, reason?: string, key?: string) =>
    request<CampaignDraft>(`/campaigns/${draft.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedContentVersion: draft.contentVersion,
        expectedRevision: draft.revision,
        ...(reason === undefined ? {} : { reason }),
        ...(key === undefined ? {} : { idempotencyKey: key }),
      }),
    }),
  report: (id: string, cursor?: string) =>
    request<CampaignReport>(
      `/campaigns/${id}/report${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
    ),
};
