"use client";
import { useState, type SyntheticEvent } from "react";
import { insightsApi, type PaymentRead } from "./insights-api";
import { InsightReadState, useInsightRead } from "./use-insight-read";
import { ApiClientError } from "../workspace/api-client";
import { ReportExportButton } from "./report-export-button";

export function BillingScreen({
  tenantId,
  canRecord = false,
}: {
  readonly tenantId?: string;
  readonly canRecord?: boolean;
}) {
  const [accessLost, setAccessLost] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null),
    [refresh, setRefresh] = useState(0);
  const prefix =
    tenantId === undefined
      ? "/billing/payments"
      : `/platform/insights/businesses/${encodeURIComponent(tenantId)}/payments`;
  const read = useInsightRead<PaymentRead>(
    `${prefix}?limit=50${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
  );
  return (
    <section aria-label="Payment history">
      <h2>Payment history</h2>
      {notice !== null && <p role="status">{notice}</p>}
      <p>
        Recorded manual payments only. This is not an invoice, outstanding balance or payment
        gateway. Amounts retain their original currencies and minor units.
      </p>
      <div className="insight-toolbar">
        <button type="button" onClick={read.reload}>
          Refresh payment history
        </button>
        {read.data !== null && (
          <ReportExportButton
            platform={tenantId !== undefined}
            report={
              tenantId === undefined
                ? { kind: "payments" }
                : { kind: "payments", businessId: tenantId }
            }
            label="Export payment history CSV"
          />
        )}
      </div>
      <InsightReadState error={read.error} loading={read.data === null} retry={read.reload} />
      {read.data !== null && (
        <>
          <p>
            Exports include the full bounded history, not only this page. Operational notes are
            excluded.
          </p>
          {read.data.items.length === 0 ? (
            <p>No payments recorded.</p>
          ) : (
            <div className="insight-table">
              <table>
                <caption>Payments (amounts in minor currency units)</caption>
                <thead>
                  <tr>
                    <th scope="col">Paid date</th>
                    <th scope="col">Currency</th>
                    <th scope="col">Amount (minor units)</th>
                    <th scope="col">Reference</th>
                    {tenantId !== undefined && <th scope="col">Operational note</th>}
                  </tr>
                </thead>
                <tbody>
                  {read.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>{p.paidAt}</td>
                      <td>{p.currency}</td>
                      <td>{p.amountMinor}</td>
                      <td>{p.reference}</td>
                      {tenantId !== undefined && <td>{"note" in p ? p.note : ""}</td>}
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
              Next payments
            </button>
          </div>
        </>
      )}
      {canRecord && !accessLost && read.data !== null && tenantId !== undefined && (
        <PaymentForm
          key={refresh}
          tenantId={tenantId}
          denied={(message) => {
            setAccessLost(true);
            read.clear(message);
          }}
          saved={() => {
            setNotice("Payment recorded. Subscription status and dates were not changed.");
            setCursor(null);
            read.reload();
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
function PaymentForm({
  tenantId,
  saved,
  denied,
}: {
  readonly tenantId: string;
  readonly saved: () => void;
  readonly denied: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fieldText = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : "";
    };
    const amount = Number(fieldText("amount")),
      currency = fieldText("currency").trim().toUpperCase(),
      paid = fieldText("paid");
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !/^[A-Z]{3}$/u.test(currency) ||
      !Number.isFinite(Date.parse(`${paid}Z`))
    ) {
      setError("Enter a positive integer amount, ISO currency and valid UTC paid date.");
      return;
    }
    if (
      !window.confirm(
        "Record this manual payment? This does not activate or extend the subscription. Verify the minor-unit amount, currency, date and reference first.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await insightsApi.recordPayment(tenantId, {
        amount_minor: amount,
        currency,
        paid_at: new Date(`${paid}Z`).toISOString(),
        reference: fieldText("reference").trim(),
        note: fieldText("note").trim() || null,
      });
      saved();
    } catch (reason) {
      if (reason instanceof ApiClientError && (reason.status === 401 || reason.status === 403))
        denied(reason.message);
      setError(
        reason instanceof Error
          ? reason.message
          : "Payment recording failed. Check history before retrying with the same reference.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="insight-form"
      aria-label="Record manual payment"
    >
      <h3>Record manual payment</h3>
      <p>
        For INR, 100 minor units is ₹1. Use the correct minor units for the selected currency. Reuse
        the reference when checking an uncertain submission; do not invent a new reference to retry.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <fieldset disabled={busy}>
        <legend>Payment details — selected business only</legend>
        <label>
          Amount (minor units)
          <input
            name="amount"
            type="number"
            required
            min="1"
            step="1"
            max={Number.MAX_SAFE_INTEGER}
          />
        </label>
        <label>
          ISO currency
          <input
            name="currency"
            required
            pattern="[A-Za-z]{3}"
            minLength={3}
            maxLength={3}
            placeholder="INR"
          />
        </label>
        <label>
          Paid date and time (UTC)
          <input name="paid" type="datetime-local" required />
        </label>
        <label>
          Reference
          <input name="reference" required maxLength={255} />
        </label>
        <label>
          Operational note (platform only)
          <textarea name="note" maxLength={255} />
        </label>
        <button type="submit">{busy ? "Recording…" : "Record payment"}</button>
      </fieldset>
    </form>
  );
}
