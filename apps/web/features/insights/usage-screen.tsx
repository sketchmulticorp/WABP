"use client";
import type { UsageSummary } from "@whatsapp-platform/contracts";
import { InsightReadState, useInsightRead } from "./use-insight-read";
import { ReportExportButton } from "./report-export-button";

/** Quota reservations are operational units, not delivered counts or an invoice. */
export function UsageScreen({
  path = "/usage",
  businessId,
}: {
  readonly path?: string;
  readonly businessId?: string;
}) {
  const read = useInsightRead<UsageSummary>(path),
    data = read.data;
  return (
    <section aria-label="Plan and usage">
      <h2>Plan and usage</h2>
      <div className="insight-toolbar">
        <button type="button" onClick={read.reload}>
          Refresh usage
        </button>
        {data !== null && (
          <ReportExportButton
            platform={businessId !== undefined}
            report={businessId === undefined ? { kind: "usage" } : { kind: "usage", businessId }}
            label="Export usage CSV"
          />
        )}
      </div>
      <InsightReadState error={read.error} loading={data === null} retry={read.reload} />
      {data !== null && (
        <>
          <p>
            Quota period: {data.period.start} to {data.period.end} (UTC, exclusive end).
          </p>
          {data.ambiguousSubscription && (
            <p role="alert">
              Multiple eligible subscriptions were found. Ask the platform administrator to correct
              the configuration.
            </p>
          )}
          {data.subscription === null ? (
            <p>No subscription has been recorded. Contact the platform administrator.</p>
          ) : (
            <>
              <p>
                Plan: {data.subscription.planName} ({data.subscription.planCode}) ·{" "}
                {data.subscription.planStatus}
              </p>
              <p>
                Subscription: {data.subscription.status} ·{" "}
                {data.subscription.eligible ? "Currently eligible" : "Not currently eligible"}
              </p>
              <p>
                Starts: {data.subscription.startsAt}; ends:{" "}
                {data.subscription.endsAt ?? "No recorded end date"}.
              </p>
            </>
          )}
          <dl className="insight-cards">
            <div>
              <dt>Reserved messages</dt>
              <dd>{data.reservedMessages}</dd>
            </div>
            <div>
              <dt>Configured allowance</dt>
              <dd>{data.messageLimit ?? "No currently eligible numeric allowance"}</dd>
            </div>
            <div>
              <dt>Remaining allowance</dt>
              <dd>{data.remainingMessages ?? "Not available"}</dd>
            </div>
          </dl>
          <p>
            A reservation is made when an eligible outbound Message is created. Retries do not
            reserve again; later provider failure does not automatically refund usage. These numbers
            are not money owed or Meta charges.
          </p>
          {data.remainingMessages === 0 && (
            <p role="status">
              The configured monthly allowance is exhausted. Contact your administrator; payment
              recording alone does not renew it.
            </p>
          )}
        </>
      )}
    </section>
  );
}
