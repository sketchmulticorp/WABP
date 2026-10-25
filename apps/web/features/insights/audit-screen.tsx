"use client";
import { useState, type SyntheticEvent } from "react";
import type { AuditRead } from "./insights-api";
import { InsightReadState, useInsightRead } from "./use-insight-read";
import { ReportExportButton } from "./report-export-button";

/** Explicit bounded filters; no free-text search through customer payloads or audit metadata. */
export function AuditScreen({
  platform = false,
  initialTenantId = "",
}: {
  readonly platform?: boolean;
  readonly initialTenantId?: string;
}) {
  const [filters, setFilters] = useState(() => {
    const to = new Date(),
      from = new Date(to.getTime() - 30 * 86400000);
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (platform && initialTenantId) query.set("tenantId", initialTenantId);
    return query.toString();
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const base = platform ? "/platform/insights/audit-logs" : "/audit-logs";
  const read = useInsightRead<AuditRead>(
    `${base}?${filters}&limit=50${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
  );
  const [validation, setValidation] = useState<string | null>(null);
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      query = new URLSearchParams();
    const fieldText = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : "";
    };
    const toText = fieldText("to"),
      fromText = fieldText("from");
    const to = toText ? new Date(`${toText}Z`) : new Date();
    const from = fromText ? new Date(`${fromText}Z`) : new Date(to.getTime() - 30 * 86400000);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 90 * 86400000
    ) {
      setValidation("Choose a valid UTC range of no more than 90 days, with end after start.");
      return;
    }
    query.set("from", from.toISOString());
    query.set("to", to.toISOString());
    for (const field of ["action", "actorId", "result", ...(platform ? ["tenantId"] : [])]) {
      const value = fieldText(field).trim();
      if (value) query.set(field, value);
    }
    setValidation(null);
    setCursor(null);
    setFilters(query.toString());
    read.reload();
  }
  return (
    <section aria-labelledby="audit-title">
      <h2 id="audit-title">Audit log</h2>
      <p>
        Safe operational summaries only. Default range: last 30 days; maximum 90 days. End is
        exclusive. Raw metadata and customer content are never shown.
      </p>
      <form className="insight-form" aria-label="Audit filters" onSubmit={submit}>
        <fieldset>
          <legend>Filter audit records</legend>
          <label>
            From (UTC)
            <input name="from" type="datetime-local" />
          </label>
          <label>
            To (UTC)
            <input name="to" type="datetime-local" />
          </label>
          <label>
            Action (exact code)
            <input
              name="action"
              pattern="[A-Z0-9_]+"
              maxLength={100}
              placeholder="AUTOMATION_PUBLISHED"
            />
          </label>
          <label>
            Actor ID
            <input name="actorId" maxLength={36} />
          </label>
          <label>
            Result
            <select name="result">
              <option value="">All results</option>
              <option>SUCCESS</option>
              <option>DENIED</option>
              <option>FAILED</option>
            </select>
          </label>
          {platform && (
            <label>
              Business ID (blank for all/platform events)
              <input name="tenantId" defaultValue={initialTenantId} maxLength={36} />
            </label>
          )}
          <button type="submit">Search audit log</button>
        </fieldset>
      </form>
      {validation !== null && <p role="alert">{validation}</p>}
      <InsightReadState error={read.error} loading={read.data === null} retry={read.reload} />
      {read.data !== null && (
        <>
          <ReportExportButton
            platform={platform}
            report={{ kind: "audit", filters: Object.fromEntries(new URLSearchParams(filters)) }}
            label="Export filtered audit CSV"
          />
          <p>
            Exports include all matching bounded records across pages, using the applied filters.
          </p>
          {read.data.items.length === 0 ? (
            <p>No matching audit records.</p>
          ) : (
            <div className="insight-table">
              <table>
                <caption>Operational audit records</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    {platform && <th scope="col">Business ID</th>}
                    <th scope="col">Actor / role</th>
                    <th scope="col">Action</th>
                    <th scope="col">Resource type</th>
                    <th scope="col">Result</th>
                    <th scope="col">Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {read.data.items.map((a) => (
                    <tr key={a.id}>
                      <td>{a.at}</td>
                      {platform && <td>{a.tenantId ?? "Platform"}</td>}
                      <td>
                        {a.actorId ?? "System"} / {a.actorRole ?? "—"}
                      </td>
                      <td>{a.action}</td>
                      <td>{a.entityType}</td>
                      <td>{a.result}</td>
                      <td>{a.requestId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="insight-actions">
            <button
              type="button"
              disabled={cursor === null}
              onClick={() => {
                setCursor(null);
              }}
            >
              First page
            </button>
            <button
              type="button"
              disabled={read.data.nextCursor === null}
              onClick={() => {
                setCursor(read.data?.nextCursor ?? null);
              }}
            >
              Next audit records
            </button>
          </div>
        </>
      )}
    </section>
  );
}
