"use client";
import { useEffect, useState, useRef } from "react";
import type {
  CampaignDraft,
  CampaignDraftOptions,
  CampaignReport,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";
import { campaignApi } from "./campaign-api";
import { ReportExportButton } from "../insights/report-export-button";

/** Review and operational controls always use the persisted version visible to the reviewer. */
export function CampaignLifecyclePanel({
  draft,
  options,
  user,
  onChanged,
}: {
  readonly draft: CampaignDraft;
  readonly options: CampaignDraftOptions;
  readonly user: CurrentUserResponse;
  readonly onChanged: (draft: CampaignDraft) => void;
}) {
  const accountName =
    options.accounts.find((account) => account.id === draft.whatsappAccountId)
      ?.displayPhoneNumber ?? "Saved WhatsApp account";
  const templateName =
    options.templates.find((template) => template.id === draft.templateId)?.name ??
    "Saved template";
  const startKeys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [report, setReport] = useState<CampaignReport | null>(null),
    [reason, setReason] = useState("");
  const canSend = user.deployment_mode !== "preview" && user.permissions.includes("campaign.send"),
    canApprove =
      user.role.system_key === "TENANT_ADMIN" &&
      user.permissions.includes("campaign.approve") &&
      draft.approvalRequestedBy !== user.id;
  useEffect(() => {
    let active = true;
    void campaignApi
      .report(draft.id)
      .then((value) => {
        if (active) setReport(value);
      })
      .catch(() => {
        if (active) setError("Could not load the campaign report. Use Refresh report.");
      });
    return () => {
      active = false;
    };
  }, [draft.id, draft.updatedAt]);
  async function action(name: string) {
    const recipientSummary =
      report !== null && report.counts.length > 0
        ? report.counts.map((row) => `${row.status}: ${String(row.count)}`).join(", ")
        : "Final preflight pending";
    if (
      ["send", "schedule", "cancel"].includes(name) &&
      !window.confirm(
        `${name === "cancel" ? "Cancel remaining unsent recipients" : `Authorize delivery from ${accountName} using ${templateName}. Recipient counts: ${recipientSummary}. Schedule: ${draft.scheduleAt ?? "now"}`}? Already-started provider submissions may finish.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const requestId = `${draft.revision}:${name}`;
      if (["send", "schedule"].includes(name) && !startKeys.current.has(requestId))
        startKeys.current.set(requestId, crypto.randomUUID());
      const saved = await campaignApi.command(
        draft,
        name,
        name === "reject" ? reason : undefined,
        startKeys.current.get(requestId),
      );
      onChanged(saved);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Campaign action failed. Reload before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh(cursor?: string) {
    try {
      const result = await campaignApi.report(draft.id, cursor);
      setReport(result);
      if (cursor === undefined) onChanged(result.campaign);
      setError(null);
    } catch {
      setError("Report unavailable. Try again.");
    }
  }
  return (
    <section aria-label="Campaign approval and delivery" className="campaign-detail">
      <div className="campaign-heading">
        <div>
          <p className="eyebrow">Saved campaign</p>
          <h3>Review and delivery</h3>
        </div>
        <span className="status-badge">{draft.status.toLowerCase().replaceAll("_", " ")}</span>
      </div>
      <dl className="campaign-review">
        <dt>Sending number</dt>
        <dd>{accountName}</dd>
        <dt>Template</dt>
        <dd>{templateName}</dd>
        <dt>Schedule</dt>
        <dd>
          {draft.scheduleAt ?? "Send when authorized"} ({draft.scheduleTimezone ?? "UTC"})
        </dd>
        <dt>Admin review</dt>
        <dd>
          {draft.approvalStatus === "NOT_REQUIRED"
            ? "No second approval required"
            : draft.approvalStatus.toLowerCase()}
        </dd>
      </dl>
      <p className="campaign-help">
        Actions apply only to this saved campaign. Final server checks run again before delivery.
      </p>
      <details>
        <summary>Version details</summary>
        <p>
          Campaign version {draft.contentVersion} · Template version{" "}
          {draft.templateContentVersion ?? "Bound at submission/start"}. Material User edits require
          renewed approval.
        </p>
      </details>
      {draft.pauseReason != null && <p role="status">Paused: {draft.pauseReason}</p>}
      {draft.approvalRejectionReason != null && <p>Rejection: {draft.approvalRejectionReason}</p>}
      {error !== null && <p role="alert">{error}</p>}
      <fieldset disabled={busy}>
        {draft.status === "DRAFT" &&
          user.role.system_key === "TENANT_USER" &&
          user.permissions.includes("campaign.write") &&
          ["DRAFT", "REJECTED", "APPROVED"].includes(draft.approvalStatus) && (
            <button type="button" onClick={() => void action("request-approval")}>
              Submit for approval
            </button>
          )}
        {draft.status === "DRAFT" && draft.approvalStatus === "PENDING" && canApprove && (
          <>
            <button type="button" onClick={() => void action("approve")}>
              Approve saved version
            </button>
            <label>
              Rejection reason
              <input
                value={reason}
                maxLength={1000}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              disabled={reason.trim().length === 0}
              onClick={() => void action("reject")}
            >
              Reject
            </button>
          </>
        )}
        {draft.status === "DRAFT" &&
          canSend &&
          ["APPROVED", "NOT_REQUIRED"].includes(draft.approvalStatus) && (
            <button
              type="button"
              onClick={() => void action(draft.scheduleAt == null ? "send" : "schedule")}
            >
              {draft.scheduleAt == null ? "Send now" : "Schedule delivery"}
            </button>
          )}
        {canSend && ["QUEUED", "SCHEDULED", "RUNNING"].includes(draft.status) && (
          <button type="button" onClick={() => void action("pause")}>
            Pause
          </button>
        )}
        {canSend && draft.status === "PAUSED" && (
          <button type="button" onClick={() => void action("resume")}>
            Resume
          </button>
        )}
        {user.deployment_mode !== "preview" &&
          user.permissions.includes("campaign.cancel") &&
          ["DRAFT", "QUEUED", "SCHEDULED", "RUNNING", "PAUSED"].includes(draft.status) && (
            <button type="button" onClick={() => void action("cancel")}>
              Cancel remaining
            </button>
          )}
      </fieldset>
      <h3>Delivery report</h3>
      <p>Refresh to see current results. Provider-accepted messages cannot be recalled.</p>
      <button type="button" onClick={() => void refresh()}>
        Refresh report
      </button>
      {report !== null && (
        <>
          {user.permissions.includes("campaign.export") &&
            user.permissions.includes("campaign.read") && (
              <>
                <ReportExportButton
                  report={{ kind: "campaign-summary", campaignId: draft.id }}
                  label="Export campaign summary CSV"
                />
                {user.permissions.includes("contact.read") &&
                  user.permissions.includes("contact.export") && (
                    <ReportExportButton
                      report={{ kind: "campaign-recipients", campaignId: draft.id }}
                      label="Export campaign recipients CSV"
                    />
                  )}
                <p>
                  CSV limit: 10,000 rows / 10 MiB. Recipient exports omit deleted Contacts; summary
                  totals retain delivery history.
                </p>
              </>
            )}
          <p>As of {report.asOf}</p>
          {report.finalPreflight !== null && (
            <p>
              Final preflight: {report.finalPreflight.status}.{" "}
              {report.finalPreflight.blockers.join(", ")}
              {report.finalPreflight.errorCode ?? ""}
            </p>
          )}
          <div className="campaign-metrics">
            {report.counts.length === 0 ? (
              <p>
                No recipients yet. Results appear after delivery is accepted and recipients are
                resolved.
              </p>
            ) : (
              report.counts.map((row) => (
                <div key={row.status}>
                  <span>{row.status.toLowerCase().replaceAll("_", " ")}</span>
                  <strong>{row.count}</strong>
                </div>
              ))
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Contact ID</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {report.recipients.map((row) => (
                  <tr key={row.id}>
                    <td>{row.contactId}</td>
                    <td>{row.status}</td>
                    <td>{row.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={report.nextCursor === null}
            onClick={() => void refresh(report.nextCursor ?? undefined)}
          >
            Next recipients
          </button>
        </>
      )}
    </section>
  );
}
