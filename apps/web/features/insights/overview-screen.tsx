"use client";
import type { CurrentUserResponse, DashboardSummary } from "@whatsapp-platform/contracts";
import { InsightReadState, useInsightRead } from "./use-insight-read";
import { ReportExportButton } from "./report-export-button";

export function DashboardCards({ data }: { readonly data: DashboardSummary }) {
  return (
    <>
      <p>
        Activity for {data.period.start} to {data.period.end} (UTC, exclusive end). Counts are
        snapshots, not billing charges.
      </p>
      <dl className="insight-cards">
        <div>
          <dt>Active Contacts</dt>
          <dd>{data.contacts}</dd>
        </div>
        <div>
          <dt>Active Groups</dt>
          <dd>{data.groups}</dd>
        </div>
        <div>
          <dt>Campaigns created this month</dt>
          <dd>{data.campaigns}</dd>
        </div>
        <div>
          <dt>Open / pending conversations</dt>
          <dd>{data.openConversations}</dd>
        </div>
      </dl>
      <h3>Outbound messages created this month</h3>
      <p>
        Each message appears once under its current status. SENT is provider acceptance, not
        delivery.
      </p>
      {data.outboundStatuses.length === 0 ? (
        <p>No outbound messages this month.</p>
      ) : (
        <ul>
          {data.outboundStatuses.map((s) => (
            <li key={s.status}>
              {s.status}: {s.count}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export function OverviewScreen({ user }: { readonly user: CurrentUserResponse }) {
  const allowed = user.permissions.includes("report.read"),
    read = useInsightRead<DashboardSummary>(allowed ? "/dashboard" : null);
  return (
    <section aria-labelledby="overview-title">
      <h2 id="overview-title">Business overview</h2>
      {!allowed ? (
        <p role="alert">You do not have permission to view reports.</p>
      ) : (
        <>
          <div className="insight-toolbar">
            <button type="button" onClick={read.reload}>
              Refresh overview
            </button>
            {read.data !== null && (
              <ReportExportButton report={{ kind: "dashboard" }} label="Export overview CSV" />
            )}
          </div>
          <InsightReadState error={read.error} loading={read.data === null} retry={read.reload} />
          {read.data !== null && <DashboardCards data={read.data} />}
        </>
      )}
    </section>
  );
}
