"use client";
import { useEffect, useState } from "react";
import type { CurrentUserResponse, WhatsAppOnboardingState } from "@whatsapp-platform/contracts";
import {
  whatsappApi,
  accountHealth,
  type WhatsAppAccount,
  type DevelopmentAssetInput,
} from "./whatsapp-api";
import { DevelopmentConnectionForm } from "./connection-form";
import { EmbeddedSignup } from "./embedded-signup";

/** Development account workspace over existing authorized APIs. No automatic Meta calls. */
export function WhatsAppScreen({
  user,
  onDirtyChange,
}: {
  readonly user: CurrentUserResponse;
  readonly onDirtyChange: (value: boolean) => void;
}) {
  const allowed =
    user.role.system_key !== "SUPER_ADMIN" && user.permissions.includes("whatsapp.read");
  const admin = user.role.system_key === "TENANT_ADMIN";
  const [accounts, setAccounts] = useState<readonly WhatsAppAccount[]>([]);
  const [onboarding, setOnboarding] = useState<WhatsAppOnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void Promise.all([
      whatsappApi.list(controller.signal),
      whatsappApi.onboarding(controller.signal),
    ])
      .then(([value, setup]) => {
        if (!controller.signal.aborted) {
          setAccounts(value);
          setOnboarding(setup);
          setLoadError(null);
        }
      })
      .catch((value: unknown) => {
        if (!controller.signal.aborted) {
          setAccounts([]);
          setOnboarding(null);
          setLoadError(message(value));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [allowed, refresh]);
  if (!allowed)
    return (
      <section>
        <h2>WhatsApp setup</h2>
        <p role="alert">You do not have access to tenant WhatsApp accounts.</p>
      </section>
    );
  function reload() {
    setLoading(true);
    setRefresh((value) => value + 1);
  }
  async function connect(value: DevelopmentAssetInput) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await whatsappApi.connect(value);
      onDirtyChange(false);
      setFormVersion((value) => value + 1);
      setNotice(
        "Development mapping saved. Credentials/ownership are not verified by this step. Use Sync account when ready.",
      );
      reload();
    } catch (value: unknown) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }
  async function command(account: WhatsAppAccount, action: "sync" | "disconnect") {
    if (
      !window.confirm(
        action === "sync"
          ? `Read account metadata from Meta for ${account.displayPhone}? This calls the official provider using the configured server credential; no message is sent.`
          : `Disconnect ${account.displayPhone} locally? Future sending will be blocked. History is retained; this does not delete the Meta account or revoke its provider token.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "sync") await whatsappApi.sync(account.id);
      else await whatsappApi.disconnect(account.id);
      setNotice(
        action === "sync"
          ? "Account metadata synchronized. Template synchronization is separate in Templates."
          : "Account disconnected locally. History retained.",
      );
      reload();
    } catch (value: unknown) {
      setError(message(value));
      reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="whatsapp-workspace">
      <div className="campaign-heading">
        <div>
          <p className="eyebrow">Connection settings</p>
          <h2>WhatsApp setup</h2>
          <p>
            View account health and the connection method selected by your server configuration.
          </p>
        </div>
        <button type="button" disabled={busy} onClick={reload}>
          Refresh accounts
        </button>
      </div>
      <div className="whatsapp-notice">
        <strong>
          {onboarding?.mode === "development" ? "Development workflow only" : "WhatsApp onboarding"}
        </strong>
        <p>
          {onboarding?.mode === "development"
            ? "Manual mapping does not prove ownership, token validity or production readiness."
            : onboarding?.status === "NOT_CONFIGURED"
              ? "Embedded Signup is selected but server configuration is incomplete. Ask your operator to configure Meta onboarding."
              : onboarding?.status === "READY_TO_CONNECT"
                ? "Embedded Signup is configured. Meta may still require verification, approvals and permitted tester access. Connecting does not activate messaging."
                : "Connection settings are loading or unavailable. Refresh accounts to retry."}{" "}
          Sync and disconnect are explicit actions; no message is sent from this screen.
        </p>
      </div>
      {(error ?? loadError) && (
        <div role="alert">
          <p>{error ?? loadError}</p>
          <p>
            Check the asset IDs and server configuration. Existing setup fields are retained after
            failure.
          </p>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <div className="whatsapp-notice">
          <h3>No WhatsApp accounts yet</h3>
          <p>
            {admin && onboarding?.mode === "development"
              ? "Save your Meta test-asset mapping below, then explicitly sync metadata when credentials are configured."
              : "Ask your Tenant Admin to review the onboarding state above."}
          </p>
        </div>
      ) : (
        <div className="whatsapp-accounts">
          {accounts.map((account) => {
            const health = accountHealth(account);
            return (
              <article key={account.id} className="whatsapp-account">
                <div className="campaign-heading">
                  <div>
                    <h3>{account.displayName ?? account.displayPhone}</h3>
                    <p>
                      {account.displayPhone}
                      {account.isDefault ? " · Default account" : ""}
                    </p>
                  </div>
                  <span className="status-badge">{account.status}</span>
                </div>
                <dl className="campaign-review">
                  <dt>Last provider sync</dt>
                  <dd>{account.lastSyncedAt ?? "Not verified with Meta yet"}</dd>
                  <dt>Quality rating</dt>
                  <dd>{health.quality}</dd>
                  <dt>WABA ID</dt>
                  <dd>{account.wabaId}</dd>
                  <dt>Phone number ID</dt>
                  <dd>{account.phoneNumberId}</dd>
                </dl>
                {health.manual && (
                  <p className="campaign-help">
                    Manual development mapping only. The stored connection state is not evidence of
                    a successful provider check.
                  </p>
                )}
                <div className="template-actions">
                  {admin && user.permissions.includes("whatsapp.sync") && (
                    <button
                      type="button"
                      disabled={busy || account.status === "DISCONNECTED"}
                      onClick={() => {
                        void command(account, "sync");
                      }}
                    >
                      Sync account
                    </button>
                  )}
                  {admin && user.permissions.includes("whatsapp.disconnect") && (
                    <button
                      type="button"
                      disabled={busy || account.status === "DISCONNECTED"}
                      onClick={() => {
                        void command(account, "disconnect");
                      }}
                    >
                      Disconnect locally
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {admin &&
        user.permissions.includes("whatsapp.connect") &&
        onboarding?.mode === "development" &&
        onboarding.connection_available && (
          <DevelopmentConnectionForm
            key={formVersion}
            busy={busy}
            onSave={(value) => {
              void connect(value);
            }}
            onDirtyChange={onDirtyChange}
          />
        )}
      <p className="campaign-help">
        After account setup, open Templates and use Sync from Meta to import approved templates.
        Campaign delivery remains a separate, authorized workflow.
      </p>
      {admin &&
        user.permissions.includes("whatsapp.connect") &&
        onboarding?.mode === "embedded_signup" &&
        onboarding.connection_available && (
          <EmbeddedSignup
            key={user.id}
            onConnected={() => {
              setNotice(
                "Meta access verified and connection saved. Messaging activation is separate.",
              );
              reload();
            }}
          />
        )}
    </section>
  );
}
function message(value: unknown) {
  return value instanceof Error ? value.message : "Account request failed. Refresh to retry.";
}
