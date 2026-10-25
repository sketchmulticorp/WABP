import { request } from "../workspace/api-client";
import { whatsappApi } from "../whatsapp/whatsapp-api";

/** Browser projection matches TemplateRepository; provider approval and internal review differ. */
export interface TemplateRecord {
  readonly id: string;
  readonly whatsappAccountId: string;
  readonly providerTemplateId: string | null;
  readonly name: string;
  readonly language: string;
  readonly category: string;
  readonly components: unknown;
  readonly providerStatus: string;
  readonly rejectionReason: string | null;
  readonly contentVersion: number;
  readonly approvalStatus: string;
  readonly approvalRequestedBy: string | null;
  readonly approvalRejectionReason: string | null;
  readonly updatedAt: string;
}
export interface TemplateTextInput {
  readonly name: string;
  readonly language: string;
  readonly category: string;
  readonly components: readonly Readonly<Record<string, unknown>>[];
}
export interface TemplateAccount {
  readonly id: string;
  readonly displayName: string | null;
  readonly displayPhone: string;
  readonly status: string;
}
export const templateApi = {
  list: (signal: AbortSignal) => request<readonly TemplateRecord[]>("/templates", { signal }),
  accounts: (signal: AbortSignal): Promise<readonly TemplateAccount[]> => whatsappApi.list(signal),
  preview: (id: string, signal: AbortSignal) =>
    request<
      TemplateRecord & {
        preview: { header: string | null; body: string | null; footer: string | null };
      }
    >(`/templates/${id}/preview`, { signal }),
  save: (input: TemplateTextInput, existing: TemplateRecord | null, accountId: string) =>
    request<TemplateRecord>(existing ? `/templates/${existing.id}` : "/templates", {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        ...(existing
          ? { expected_content_version: existing.contentVersion }
          : { whatsapp_account_id: accountId }),
      }),
    }),
  review: (
    template: TemplateRecord,
    action: "request-approval" | "approve" | "reject",
    reason?: string,
  ) =>
    request<TemplateRecord>(`/templates/${template.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_content_version: template.contentVersion,
        ...(reason === undefined ? {} : { reason }),
      }),
    }),
  sync: (accountId: string) =>
    request<{ synchronized: number; templates: readonly TemplateRecord[] }>("/templates/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ whatsapp_account_id: accountId }),
    }),
};
