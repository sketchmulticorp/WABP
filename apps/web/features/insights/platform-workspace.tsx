"use client";
import { useState } from "react";
import type { CurrentUserResponse, PlatformBusiness } from "@whatsapp-platform/contracts";
import type { BusinessRead, PlatformRead } from "./insights-api";
import { InsightReadState, useInsightRead } from "./use-insight-read";
import { DashboardCards } from "./overview-screen";
import { UsageScreen } from "./usage-screen";
import { BillingScreen } from "./billing-screen";
import { AuditScreen } from "./audit-screen";
import { ReportExportButton } from "./report-export-button";
import { PlatformBusinessesScreen } from "../users/platform-businesses-screen";
import { PreviewNotice } from "../preview/preview-notice";
import { ProfileScreen } from "../profile/profile-screen";
import { SuperAdminScreen } from "../users/super-admin-screen";

/** A separate platform surface: it never mounts Contacts, Inbox or tenant-content screens. */
export function PlatformWorkspace({
  user,
  signOut,
  onNameChanged,
  onPasswordChanged,
  profileDirty,
  onProfileDirtyChange,
}: {
  readonly user: CurrentUserResponse;
  readonly signOut: () => void;
  readonly onNameChanged: (name: string) => void;
  readonly onPasswordChanged: () => void;
  readonly profileDirty?: boolean;
  readonly onProfileDirtyChange: (dirty: boolean) => void;
}) {
  const [view, setView] = useState<
    "overview" | "businesses" | "audit" | "profile" | "super-admins"
  >("overview");
  const selectView = (next: typeof view) => {
    if (next !== view && profileDirty === true && !window.confirm("Discard unsaved changes?"))
      return;
    if (next !== view) onProfileDirtyChange(false);
    setView(next);
    setMenuOpen(false);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<PlatformBusiness | null>(null),
    [cursor, setCursor] = useState<string | null>(null);
  const has = (permission: string) => user.permissions.includes(permission);
  const dashboard = useInsightRead<PlatformRead>(
    has("platform.dashboard.read") ? "/platform/dashboard" : null,
  );
  const businesses = useInsightRead<BusinessRead>(
    has("tenant.read")
      ? `/platform/insights/businesses?limit=50${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`
      : null,
  );
  return (
    <main className="workspace-shell">
      <aside
        className={`workspace-sidebar ${menuOpen ? "workspace-sidebar-open" : ""}`}
        aria-label="Platform navigation"
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            W
          </span>
          <div>
            <p className="eyebrow">Super Admin</p>
            <h1>Platform overview</h1>
          </div>
          <button
            aria-label="Close navigation"
            className="sidebar-close"
            onClick={() => {
              setMenuOpen(false);
            }}
            type="button"
          >
            ×
          </button>
        </div>
        <nav>
          <p className="nav-section-label">Platform</p>
          <button
            className={view === "overview" ? "nav-active" : ""}
            type="button"
            onClick={() => {
              selectView("overview");
              setMenuOpen(false);
            }}
          >
            <PlatformNavIcon kind="overview" />
            Overview and billing
          </button>
          {has("tenant.read") && has("tenant.manage") && (
            <button
              className={view === "businesses" ? "nav-active" : ""}
              type="button"
              onClick={() => {
                selectView("businesses");
                setMenuOpen(false);
              }}
            >
              <PlatformNavIcon kind="businesses" />
              Businesses and admins
            </button>
          )}
          {has("audit.read") && (
            <button
              className={view === "audit" ? "nav-active" : ""}
              type="button"
              onClick={() => {
                selectView("audit");
                setMenuOpen(false);
              }}
            >
              <PlatformNavIcon kind="audit" />
              Platform audit log
            </button>
          )}
          {has("user.invite") && (
            <button
              className={view === "super-admins" ? "nav-active" : ""}
              type="button"
              onClick={() => {
                selectView("super-admins");
              }}
            >
              <PlatformNavIcon kind="businesses" />
              Add Super Admin
            </button>
          )}
        </nav>
        <button
          className={`sidebar-profile-button ${view === "profile" ? "nav-active" : ""}`}
          type="button"
          onClick={() => {
            selectView("profile");
          }}
          aria-current={view === "profile" ? "page" : undefined}
        >
          My profile
        </button>
        <div className="workspace-user">
          <span className="user-avatar" aria-hidden="true">
            {user.display_name.slice(0, 1).toUpperCase()}
          </span>
          <span className="user-name">{user.display_name}</span>
          <button aria-label="Sign out" className="sign-out-button" type="button" onClick={signOut}>
            ↗
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={() => {
            setMenuOpen(false);
          }}
          type="button"
        />
      )}
      <section className="workspace-content insight-screen">
        <header className="workspace-topbar">
          <button
            aria-expanded={menuOpen}
            aria-label="Open navigation"
            className="mobile-nav-toggle"
            onClick={() => {
              setMenuOpen(true);
            }}
            type="button"
          >
            ☰
          </button>
          <span className="workspace-view-name">
            {view === "super-admins"
              ? "Add Super Admin"
              : view === "profile"
                ? "My profile"
                : view === "overview"
                  ? "Platform overview"
                  : view === "businesses"
                    ? "Businesses and admins"
                    : "Platform audit log"}
          </span>
          <span className="workspace-state">
            {user.deployment_mode === "preview" ? "Database-only preview" : "Live platform"}
          </span>
        </header>
        {user.deployment_mode === "preview" && <PreviewNotice />}
        <p>
          Platform metadata and aggregates only. Customer contacts, communication content and
          recipient details are not accessible here.
        </p>
        {view === "super-admins" && has("user.invite") ? (
          <SuperAdminScreen user={user} onDirtyChange={onProfileDirtyChange} />
        ) : view === "profile" ? (
          <ProfileScreen
            user={user}
            onNameChanged={onNameChanged}
            onPasswordChanged={onPasswordChanged}
            onDirtyChange={onProfileDirtyChange}
          />
        ) : view === "businesses" && has("tenant.manage") ? (
          <PlatformBusinessesScreen />
        ) : view === "audit" && has("audit.read") ? (
          <AuditScreen key={selected?.id ?? "all"} platform initialTenantId={selected?.id ?? ""} />
        ) : (
          <>
            <h2>Platform summary</h2>
            {has("platform.dashboard.read") ? (
              <>
                <div className="insight-toolbar">
                  <button type="button" onClick={dashboard.reload}>
                    Refresh platform summary
                  </button>
                  {dashboard.data !== null && (
                    <ReportExportButton
                      platform
                      report={{ kind: "dashboard" }}
                      label="Export platform summary CSV"
                    />
                  )}
                </div>
                <InsightReadState
                  error={dashboard.error}
                  loading={dashboard.data === null}
                  retry={dashboard.reload}
                />
                {dashboard.data !== null && (
                  <>
                    <dl className="insight-cards">
                      <div>
                        <dt>Businesses</dt>
                        <dd>{dashboard.data.tenantCount}</dd>
                      </div>
                      <div>
                        <dt>Active businesses</dt>
                        <dd>{dashboard.data.activeTenants}</dd>
                      </div>
                      <div>
                        <dt>Active Admins</dt>
                        <dd>{dashboard.data.tenantAdminCount}</dd>
                      </div>
                    </dl>
                    <DashboardCards data={dashboard.data} />
                  </>
                )}
              </>
            ) : (
              <p>Platform dashboard permission is required.</p>
            )}
            <h2>Business subscription and billing</h2>
            {has("tenant.read") ? (
              <>
                <InsightReadState
                  error={businesses.error}
                  loading={businesses.data === null}
                  retry={businesses.reload}
                />
                {businesses.data !== null && (
                  <>
                    {businesses.data.items.length === 0 ? (
                      <p>No businesses found.</p>
                    ) : (
                      <ul>
                        {businesses.data.items.map((b) => (
                          <li key={b.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(b);
                              }}
                            >
                              {b.name} · {b.status}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="insight-actions">
                      <button
                        type="button"
                        disabled={cursor === null}
                        onClick={() => {
                          setCursor(null);
                        }}
                      >
                        First businesses page
                      </button>
                      <button
                        type="button"
                        disabled={businesses.data.nextCursor === null}
                        onClick={() => {
                          setCursor(businesses.data?.nextCursor ?? null);
                        }}
                      >
                        Next businesses
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p>Business listing permission is required.</p>
            )}
            {selected === null ? (
              <p>Select a business to view its permitted subscription/payment metadata.</p>
            ) : (
              <section key={selected.id} aria-label="Selected business">
                <h3>
                  {selected.name} · {selected.status}
                </h3>
                <p>Business ID: {selected.id}</p>
                {has("plan.read") && (
                  <UsageScreen
                    path={`/platform/insights/businesses/${selected.id}/usage`}
                    businessId={selected.id}
                  />
                )}
                {has("billing.read") && (
                  <BillingScreen tenantId={selected.id} canRecord={has("plan.manage")} />
                )}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function PlatformNavIcon({ kind }: { readonly kind: "audit" | "businesses" | "overview" }) {
  return (
    <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 24 24">
      <path
        d={
          kind === "overview"
            ? "M4 13h6V4H4v9Zm10 7h6V9h-6v11ZM4 20h6v-3H4v3Zm10-15h6V4h-6v1Z"
            : kind === "businesses"
              ? "M4 20V7l8-4 8 4v13M8 20v-5h8v5M8 9h1m6 0h1M8 12h1m6 0h1"
              : "M4 5h16M4 12h16M4 19h10"
        }
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
