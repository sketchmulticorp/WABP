"use client";
import { useEffect, useRef, useState } from "react";
import type {
  PlatformReportExportRequest,
  TenantReportExportRequest,
} from "@whatsapp-platform/contracts";
import { requestCsv } from "../workspace/api-client";

type ExportRequest = PlatformReportExportRequest | TenantReportExportRequest;
interface ExportButtonProps {
  readonly report: ExportRequest;
  readonly platform?: boolean;
  readonly label: string;
}
/** Remount on target/filter changes so an obsolete response can never download another scope. */
export function ReportExportButton({ report, platform = false, label }: ExportButtonProps) {
  const body = JSON.stringify(report);
  const path = platform ? "/platform/reports/exports" : "/reports/exports";
  return (
    <DownloadButton
      key={`${path}:${body}`}
      body={body}
      path={path}
      kind={report.kind}
      label={label}
    />
  );
}
function DownloadButton({
  body,
  path,
  kind,
  label,
}: {
  readonly body: string;
  readonly path: string;
  readonly kind: ExportRequest["kind"];
  readonly label: string;
}) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  async function download() {
    if (active.current !== null) return;
    if (
      kind === "campaign-recipients" &&
      !window.confirm(
        "Download recipient phone numbers to this device? Keep the CSV private and share it only with authorized people.",
      )
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await requestCsv(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `report-${kind}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Give the browser time to consume the URL; do not retain the private blob indefinitely.
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30_000);
      setNotice("CSV prepared and download requested. Check your browser downloads.");
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "Export failed. Try again.");
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <span className="report-export">
      <button type="button" disabled={busy} onClick={() => void download()}>
        {busy ? "Preparing CSV…" : label}
      </button>
      {error !== null && <span role="alert">{error}</span>}
      {notice !== null && <span role="status">{notice}</span>}
    </span>
  );
}
