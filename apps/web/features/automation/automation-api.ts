import type {
  ConversationAutomationStatus,
  AutomationDetail,
  AutomationDraftInput,
  AutomationOptions,
  AutomationSimulation,
  AutomationSummary,
} from "@whatsapp-platform/contracts";
import { request } from "../workspace/api-client";

function post<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
/** The browser submits authoring intent only; tenancy and runtime policy remain server-side. */
export const automationApi = {
  conversation: (id: string, signal?: AbortSignal) =>
    request<ConversationAutomationStatus>(
      `/conversations/${id}/automation`,
      signal === undefined ? {} : { signal },
    ),
  conversationCommand: (id: string, action: "takeover" | "allow") =>
    post<ConversationAutomationStatus>(`/conversations/${id}/automation/${action}`, {}),
  list: (cursor?: string, signal?: AbortSignal) =>
    request<{ automations: AutomationSummary[]; nextCursor: string | null }>(
      `/automations${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
      signal === undefined ? {} : { signal },
    ),
  read: (id: string) => request<AutomationDetail>(`/automations/${id}`),
  options: (accountCursor?: string, memberCursor?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (accountCursor !== undefined) params.set("accountCursor", accountCursor);
    if (memberCursor !== undefined) params.set("memberCursor", memberCursor);
    return request<AutomationOptions>(
      `/automations/options${params.size === 0 ? "" : `?${params}`}`,
      signal === undefined ? {} : { signal },
    );
  },
  save: (input: AutomationDraftInput, existing: AutomationDetail | null) =>
    request<AutomationDetail>(existing === null ? "/automations" : `/automations/${existing.id}`, {
      method: existing === null ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        ...(existing === null ? {} : { expectedRevision: existing.revision }),
      }),
    }),
  publish: (flow: AutomationDetail) =>
    post<AutomationDetail>(`/automations/${flow.id}/publish`, { expectedRevision: flow.revision }),
  simulate: (flow: AutomationDetail, selections: readonly string[]) =>
    post<AutomationSimulation>(`/automations/${flow.id}/test`, {
      expectedRevision: flow.revision,
      selections,
    }),
  command: (flow: AutomationDetail, action: "pause" | "reactivate") =>
    post<AutomationDetail>(`/automations/${flow.id}/${action}`, {
      expectedRevision: flow.revision,
    }),
};
