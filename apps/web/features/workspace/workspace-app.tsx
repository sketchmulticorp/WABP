"use client";

import type { CurrentUserResponse } from "@whatsapp-platform/contracts";
import { type SyntheticEvent, useEffect, useState } from "react";

import { ApiClientError, login, logout, request, restoreSession } from "./api-client";
import { CampaignsScreen } from "../campaigns/campaigns-screen";
import { TemplatesScreen } from "../templates/templates-screen";
import { WhatsAppScreen } from "../whatsapp/whatsapp-screen";
import { InboxScreen } from "../inbox/inbox-screen";
import { AutomationScreen } from "../automation/automation-screen";
import { OverviewScreen } from "../insights/overview-screen";
import { UsageScreen } from "../insights/usage-screen";
import { BillingScreen } from "../insights/billing-screen";
import { AuditScreen } from "../insights/audit-screen";
import { PlatformWorkspace } from "../insights/platform-workspace";
import { TenantTeamScreen } from "../users/tenant-team-screen";
import { PreviewNotice } from "../preview/preview-notice";
import { InitialPasswordScreen } from "../auth/initial-password-screen";
import { PasswordInput } from "../auth/password-input";
import { ProfileScreen } from "../profile/profile-screen";

type WorkspaceView =
  | "whatsapp"
  | "templates"
  | "contacts"
  | "groups"
  | "imports"
  | "campaigns"
  | "inbox"
  | "automation"
  | "overview"
  | "usage"
  | "billing"
  | "audit"
  | "team"
  | "profile";

interface Contact {
  readonly consentStatus: string;
  readonly email: string | null;
  readonly id: string;
  readonly name: string | null;
  readonly phoneE164: string;
}

interface ContactsPage {
  readonly contacts: readonly Contact[];
  readonly nextCursor: string | null;
}

interface Group {
  readonly id: string;
  readonly memberCount: number;
  readonly name: string;
}

interface GroupsResponse {
  readonly groups: readonly Group[];
}

interface GroupMember {
  readonly id: string;
  readonly name: string | null;
  readonly phoneE164: string;
}

interface GroupMembersResponse {
  readonly members: readonly GroupMember[];
}

interface ContactImport {
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly errorCode: string | null;
  readonly id: string;
  readonly insertedRows: number;
  readonly invalidRows: number;
  readonly originalFilename: string;
  readonly status: string;
  readonly totalRows: number;
}

interface ImportError {
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly rowData: Record<string, string>;
  readonly rowNumber: number;
}

export function WorkspaceApp() {
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [state, setState] = useState<"loading" | "signed_out" | "ready">("loading");
  const [view, setView] = useState<WorkspaceView>("contacts");
  const [menuOpen, setMenuOpen] = useState(false);
  const [campaignDirty, setCampaignDirty] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [whatsappDirty, setWhatsAppDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    void restoreSession()
      .then((currentUser) => {
        setUser(currentUser);
        setState("ready");
      })
      .catch(() => {
        setState("signed_out");
      });
  }, []);

  if (state === "loading")
    return (
      <main>
        <p role="status">Restoring your secure session…</p>
      </main>
    );
  if (state === "signed_out") {
    return (
      <LoginScreen
        notice={authNotice}
        onAuthenticated={(currentUser) => {
          setAuthNotice(null);
          setUser(currentUser);
          setView("contacts");
          setState("ready");
        }}
      />
    );
  }
  if (user === null) return null;
  const preview = user.deployment_mode === "preview";
  const signOut = () => {
    if (
      (campaignDirty || templateDirty || whatsappDirty || profileDirty) &&
      !window.confirm("Discard unsaved changes and sign out?")
    )
      return;
    setCampaignDirty(false);
    setTemplateDirty(false);
    setWhatsAppDirty(false);
    setProfileDirty(false);
    void logout().finally(() => {
      setUser(null);
      setState("signed_out");
    });
  };
  if (user.password_change_required === true)
    return <InitialPasswordScreen key={user.id} email={user.email} signOut={signOut} />;
  const onNameChanged = (name: string) => {
    setUser((current) => (current?.id === user.id ? { ...current, display_name: name } : current));
  };
  const onPasswordChanged = () => {
    setProfileDirty(false);
    setAuthNotice(
      "Password changed. All sessions have been signed out. Sign in with your new password.",
    );
    setUser(null);
    setState("signed_out");
  };
  if (user.role.system_key === "SUPER_ADMIN")
    return (
      <PlatformWorkspace
        key={user.id}
        user={user}
        signOut={signOut}
        onNameChanged={onNameChanged}
        onPasswordChanged={onPasswordChanged}
        profileDirty={profileDirty}
        onProfileDirtyChange={setProfileDirty}
      />
    );

  const selectView = (nextView: WorkspaceView) => {
    if (preview && ["imports", "inbox", "automation"].includes(nextView)) return;
    if (
      nextView !== view &&
      (campaignDirty || templateDirty || whatsappDirty || profileDirty) &&
      !window.confirm("Discard unsaved changes?")
    )
      return;
    if (nextView !== view) setCampaignDirty(false);
    if (nextView !== view) setTemplateDirty(false);
    if (nextView !== view) setWhatsAppDirty(false);
    if (nextView !== view) setProfileDirty(false);
    setView(nextView);
    setMenuOpen(false);
  };

  return (
    <main className="workspace-shell">
      <aside
        className={`workspace-sidebar ${menuOpen ? "workspace-sidebar-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            W
          </span>
          <div>
            <p className="eyebrow">WhatsApp platform</p>
            <h1>{user.tenant?.name ?? "Workspace"}</h1>
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
          <>
            <p className="nav-section-label">Workspace</p>
            {user.permissions.includes("report.read") && (
              <button
                className={view === "overview" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("overview");
                }}
              >
                <NavIcon name="overview" />
                Overview
              </button>
            )}
            {!preview && user.permissions.includes("conversation.read") && (
              <button
                className={view === "inbox" ? "nav-active" : ""}
                onClick={() => {
                  selectView("inbox");
                }}
                type="button"
              >
                <NavIcon name="inbox" />
                Inbox
              </button>
            )}
            <p className="nav-section-label">Growth</p>
            {user.permissions.includes("template.read") && (
              <button
                className={view === "templates" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("templates");
                }}
              >
                <NavIcon name="campaigns" />
                Templates
              </button>
            )}
            {user.permissions.includes("campaign.read") && (
              <button
                className={view === "campaigns" ? "nav-active" : ""}
                onClick={() => {
                  selectView("campaigns");
                }}
                type="button"
              >
                <NavIcon name="campaigns" />
                Campaigns
              </button>
            )}
            {!preview && user.permissions.includes("automation.read") && (
              <button
                className={view === "automation" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("automation");
                }}
              >
                <NavIcon name="automation" />
                Automations
              </button>
            )}
          </>
          <p className="nav-section-label">Audience</p>
          <button
            className={view === "contacts" ? "nav-active" : ""}
            onClick={() => {
              selectView("contacts");
            }}
            type="button"
          >
            <NavIcon name="contacts" />
            Contacts
          </button>
          <button
            className={view === "groups" ? "nav-active" : ""}
            onClick={() => {
              selectView("groups");
            }}
            type="button"
          >
            <NavIcon name="groups" />
            Groups
          </button>
          {!preview && (
            <>
              <button
                className={view === "imports" ? "nav-active" : ""}
                onClick={() => {
                  selectView("imports");
                }}
                type="button"
              >
                <NavIcon name="imports" />
                Imports
              </button>
              <p className="nav-section-label">Operations</p>
            </>
          )}
          {user.role.system_key === "TENANT_ADMIN" && user.permissions.includes("user.read") && (
            <button
              className={view === "team" ? "nav-active" : ""}
              type="button"
              onClick={() => {
                selectView("team");
              }}
            >
              <NavIcon name="users" />
              Team
            </button>
          )}
          <>
            {user.permissions.includes("whatsapp.read") && (
              <button
                className={view === "whatsapp" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("whatsapp");
                }}
              >
                <NavIcon name="whatsapp" />
                WhatsApp setup
              </button>
            )}
            {user.permissions.includes("plan.read") && (
              <button
                className={view === "usage" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("usage");
                }}
              >
                <NavIcon name="usage" />
                Plan and usage
              </button>
            )}
            {user.permissions.includes("billing.read") && (
              <button
                className={view === "billing" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("billing");
                }}
              >
                <NavIcon name="billing" />
                Billing
              </button>
            )}
            {user.permissions.includes("audit.read") && (
              <button
                className={view === "audit" ? "nav-active" : ""}
                type="button"
                onClick={() => {
                  selectView("audit");
                }}
              >
                <NavIcon name="audit" />
                Audit log
              </button>
            )}
          </>
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
          <button aria-label="Sign out" className="sign-out-button" onClick={signOut} type="button">
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
      <section className="workspace-content">
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
          <span className="workspace-view-name">{viewLabel(view)}</span>
          <span className="workspace-state">{preview ? "Limited preview" : "Live workspace"}</span>
        </header>
        {preview && <PreviewNotice />}
        <>
          <div className="insight-screen" key={`${user.tenant?.id ?? "none"}:${user.id}`}>
            {view === "overview" && user.permissions.includes("report.read") && (
              <OverviewScreen user={user} />
            )}
            {view === "usage" && user.permissions.includes("plan.read") && <UsageScreen />}
            {view === "billing" && user.permissions.includes("billing.read") && <BillingScreen />}
            {view === "audit" && user.permissions.includes("audit.read") && <AuditScreen />}
          </div>
          {!preview && view === "imports" && <ImportsScreen />}
          {view === "campaigns" && <CampaignsScreen user={user} onDirtyChange={setCampaignDirty} />}
          {view === "templates" && (
            <TemplatesScreen key={user.id} user={user} onDirtyChange={setTemplateDirty} />
          )}
          {view === "whatsapp" && (
            <WhatsAppScreen key={user.id} user={user} onDirtyChange={setWhatsAppDirty} />
          )}
          {!preview && view === "automation" && (
            <AutomationScreen key={`${user.tenant?.id ?? "none"}:${user.id}`} user={user} />
          )}
          {!preview && view === "inbox" && (
            <InboxScreen key={`${user.tenant?.id ?? "none"}:${user.id}`} user={user} />
          )}
        </>
        {view === "profile" && (
          <ProfileScreen
            user={user}
            onNameChanged={onNameChanged}
            onPasswordChanged={onPasswordChanged}
            onDirtyChange={setProfileDirty}
          />
        )}
        {view === "contacts" && <ContactsScreen />}
        {view === "team" && (
          <TenantTeamScreen key={`${user.tenant?.id ?? "none"}:${user.id}`} user={user} />
        )}
        {view === "groups" && <GroupsScreen />}
      </section>
    </main>
  );
}

function viewLabel(view: WorkspaceView): string {
  const labels: Record<WorkspaceView, string> = {
    whatsapp: "WhatsApp setup",
    templates: "Templates",
    audit: "Audit log",
    automation: "Automations",
    billing: "Billing",
    campaigns: "Campaigns",
    contacts: "Contacts",
    groups: "Groups",
    imports: "Imports",
    inbox: "Inbox",
    overview: "Overview",
    usage: "Plan and usage",
    team: "Team",
    profile: "My profile",
  };
  return labels[view];
}

function NavIcon({
  name,
}: {
  readonly name:
    | "audit"
    | "automation"
    | "billing"
    | "campaigns"
    | "contacts"
    | "groups"
    | "imports"
    | "inbox"
    | "overview"
    | "usage"
    | "users"
    | "whatsapp";
}) {
  const paths = {
    whatsapp: "M6 3h4l2 5-3 2c1 3 2 4 5 5l2-3 5 2v4c-8 2-17-7-15-15Z",
    audit: "M4 5h16M4 12h16M4 19h10",
    automation:
      "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    billing: "M4 6h16v12H4zM4 10h16M8 15h4",
    campaigns: "M4 13V8l12-4v13L4 13Zm0 0 2 7h4l-2-6",
    contacts:
      "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 2a3 3 0 1 0 0-6m-14 14c0-4 2.7-6 6-6s6 2 6 6m2 0c0-2.5-1-4.2-2.5-5.2",
    groups:
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3 3 0 1 0 0-6M2 21c0-4 3-7 7-7s7 3 7 7m0-6c3 0 6 2 6 6",
    imports: "M12 3v12m0 0-5-5m5 5 5-5M4 19h16",
    inbox: "M4 5h16v14H4zM4 14h5l2 2h2l2-2h5",
    overview: "M4 13h6V4H4v9Zm10 7h6V9h-6v11ZM4 20h6v-3H4v3Zm10-15h6V4h-6v1Z",
    usage: "M4 19V9m6 10V5m6 14v-7m4 7V3",
    users:
      "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3 3 0 1 0 0-6M2 21c0-4 3-7 7-7s7 3 7 7m0-6c3 0 6 2 6 6",
  } as const;
  return (
    <svg aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 24 24">
      <path d={paths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoginScreen({
  onAuthenticated,
  notice,
}: {
  readonly onAuthenticated: (user: CurrentUserResponse) => void;
  readonly notice?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      onAuthenticated(await login(formText(fields, "email"), formText(fields, "password")));
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      {notice != null && <p role="status">{notice}</p>}
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">WhatsApp platform</p>
        <h1 id="login-title">Sign in to your workspace</h1>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            Email
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <PasswordInput
            autoComplete="current-password"
            id="login-password"
            label="Password"
            name="password"
            required
          />
          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={submitting} type="submit">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ContactsScreen() {
  const [page, setPage] = useState<ContactsPage | null>(null);
  const [cursorHistory, setCursorHistory] = useState<readonly (string | null)[]>([null]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [consentTarget, setConsentTarget] = useState<Contact | null>(null);

  const cursor = cursorHistory.at(-1) ?? null;
  const load = async (nextCursor = cursor) => {
    setLoading(true);
    setError(null);
    try {
      setPage(
        await request<ContactsPage>(
          `/contacts?limit=25${nextCursor === null ? "" : `&cursor=${encodeURIComponent(nextCursor)}`}`,
        ),
      );
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void request<ContactsPage>("/contacts?limit=25").then(
      (loaded) => {
        setPage(loaded);
        setLoading(false);
      },
      (reason: unknown) => {
        setError(messageFor(reason));
        setLoading(false);
      },
    );
  }, []);

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setCreating(true);
    setError(null);
    try {
      await request("/contacts", {
        body: JSON.stringify({
          email: emptyToNull(values.get("email")),
          name: emptyToNull(values.get("name")),
          phone: formText(values, "phone"),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      form.reset();
      setCursorHistory([null]);
      await load(null);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setCreating(false);
    }
  }
  async function remove() {
    if (deleteTarget === null) return;
    try {
      await request(`/contacts/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }

  return (
    <section aria-labelledby="contacts-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Directory</p>
          <h2 id="contacts-title">Contacts</h2>
          <p>Create and manage people your business can contact.</p>
        </div>
      </header>
      <form
        className="inline-form"
        onSubmit={(event) => {
          void create(event);
        }}
      >
        <label>
          Name
          <input name="name" />
        </label>
        <label>
          Phone
          <input aria-describedby="phone-help" name="phone" placeholder="+919876543210" required />
        </label>
        <label>
          Email
          <input name="email" type="email" />
        </label>
        <button disabled={creating} type="submit">
          {creating ? "Adding…" : "Add contact"}
        </button>
        <span id="phone-help" className="hint">
          Indian local numbers are accepted.
        </span>
      </form>
      {error !== null && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading && <TableLoading label="Loading contacts" />}
      {!loading && page !== null && page.contacts.length === 0 && (
        <EmptyState
          title="No contacts yet"
          description="Add a contact above or import a CSV/XLSX file."
        />
      )}
      {!loading && page !== null && page.contacts.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Consent</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>{contact.name ?? "—"}</td>
                  <td>{contact.phoneE164}</td>
                  <td>{contact.email ?? "—"}</td>
                  <td>
                    <span className="status-badge">{contact.consentStatus}</span>
                  </td>
                  <td>
                    <button
                      className="quiet-button"
                      onClick={() => {
                        setConsentTarget(contact);
                      }}
                      type="button"
                    >
                      Consent
                    </button>{" "}
                    <button
                      className="button-danger quiet-button"
                      onClick={() => {
                        setDeleteTarget(contact);
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button
          disabled={loading || cursorHistory.length === 1}
          onClick={() => {
            const next = cursorHistory.slice(0, -1);
            setCursorHistory(next);
            void load(next.at(-1) ?? null);
          }}
          type="button"
        >
          Previous
        </button>
        <button
          disabled={loading || page?.nextCursor === null || page === null}
          onClick={() => {
            if (page?.nextCursor === null || page === null) return;
            const next = [...cursorHistory, page.nextCursor];
            setCursorHistory(next);
            void load(page.nextCursor);
          }}
          type="button"
        >
          Next
        </button>
      </div>
      {deleteTarget !== null && (
        <ConfirmationDialog
          title="Delete contact?"
          description={`This hides ${deleteTarget.name ?? deleteTarget.phoneE164} from normal workspace use. It can be restored only by an authorized recovery workflow.`}
          onCancel={() => {
            setDeleteTarget(null);
          }}
          onConfirm={() => void remove()}
        />
      )}
      {consentTarget !== null && (
        <ConsentDialog
          contact={consentTarget}
          onCancel={() => {
            setConsentTarget(null);
          }}
          onSaved={() => {
            setConsentTarget(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function GroupsScreen() {
  const [groups, setGroups] = useState<readonly Group[] | null>(null);
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<readonly GroupMember[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedGroups, loadedContacts] = await Promise.all([
        request<GroupsResponse>("/groups"),
        request<ContactsPage>("/contacts?limit=100"),
      ]);
      setGroups(loadedGroups.groups);
      setContacts(loadedContacts.contacts);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void Promise.all([
      request<GroupsResponse>("/groups"),
      request<ContactsPage>("/contacts?limit=100"),
    ]).then(
      ([loadedGroups, loadedContacts]) => {
        setGroups(loadedGroups.groups);
        setContacts(loadedContacts.contacts);
        setLoading(false);
      },
      (reason: unknown) => {
        setError(messageFor(reason));
        setLoading(false);
      },
    );
  }, []);
  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), "name");
    try {
      await request("/groups", {
        body: JSON.stringify({ name }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function select(group: Group) {
    setSelectedGroup(group);
    setMembers(null);
    try {
      const response = await request<GroupMembersResponse>(`/groups/${group.id}/members`);
      setMembers(response.members);
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function addMember(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedGroup === null) return;
    const contactId = formText(new FormData(event.currentTarget), "contact_id");
    try {
      await request(`/groups/${selectedGroup.id}/members`, {
        body: JSON.stringify({ contact_ids: [contactId] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await select(selectedGroup);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function rename(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedGroup === null) return;
    const name = formText(new FormData(event.currentTarget), "name");
    try {
      await request(`/groups/${selectedGroup.id}`, {
        body: JSON.stringify({ name }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const updated = { ...selectedGroup, name };
      setSelectedGroup(updated);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function removeMember(contactId: string) {
    if (selectedGroup === null) return;
    try {
      await request(`/groups/${selectedGroup.id}/members/${contactId}`, { method: "DELETE" });
      await select(selectedGroup);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function removeGroup() {
    if (deleteTarget === null) return;
    try {
      await request(`/groups/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setSelectedGroup(null);
      setMembers(null);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }

  return (
    <section aria-labelledby="groups-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Audience organization</p>
          <h2 id="groups-title">Groups</h2>
          <p>Static groups contain contacts chosen explicitly by your team.</p>
        </div>
      </header>
      <form
        className="inline-form"
        onSubmit={(event) => {
          void create(event);
        }}
      >
        <label>
          Group name
          <input name="name" required />
        </label>
        <button type="submit">Create group</button>
      </form>
      {error !== null && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading && <TableLoading label="Loading groups" />}
      {!loading && groups !== null && groups.length === 0 && (
        <EmptyState
          title="No groups yet"
          description="Create a group to organize selected contacts."
        />
      )}
      {!loading && groups !== null && groups.length > 0 && (
        <div className="split-grid">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Members</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr
                    className={selectedGroup?.id === group.id ? "selected-row" : ""}
                    key={group.id}
                  >
                    <td>
                      <button
                        className="link-button"
                        onClick={() => void select(group)}
                        type="button"
                      >
                        {group.name}
                      </button>
                    </td>
                    <td>{group.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="member-panel">
            <h3>{selectedGroup === null ? "Select a group" : selectedGroup.name}</h3>
            {selectedGroup !== null && (
              <>
                <form
                  onSubmit={(event) => {
                    void addMember(event);
                  }}
                >
                  <label>
                    Add contact
                    <select defaultValue="" name="contact_id" required>
                      <option disabled value="">
                        Choose a contact
                      </option>
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name ?? contact.phoneE164}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Add to group</button>
                </form>
                <form
                  className="member-panel-form"
                  onSubmit={(event) => {
                    void rename(event);
                  }}
                >
                  <label>
                    Rename group
                    <input
                      defaultValue={selectedGroup.name}
                      key={selectedGroup.id}
                      name="name"
                      required
                    />
                  </label>
                  <button type="submit">Save name</button>
                  <button
                    className="button-danger"
                    onClick={() => {
                      setDeleteTarget(selectedGroup);
                    }}
                    type="button"
                  >
                    Delete group
                  </button>
                </form>
                {members === null && <p role="status">Loading members…</p>}
                {members !== null && members.length === 0 && <p>No members yet.</p>}
                {members?.map((member) => (
                  <p className="member-row" key={member.id}>
                    <span>{member.name ?? member.phoneE164}</span>
                    <button
                      className="quiet-button button-danger"
                      onClick={() => void removeMember(member.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </p>
                ))}
              </>
            )}
          </aside>
        </div>
      )}
      {deleteTarget !== null && (
        <ConfirmationDialog
          destructiveLabel="Delete group"
          title="Delete group?"
          description={`This hides ${deleteTarget.name} and its memberships from normal workspace use.`}
          onCancel={() => {
            setDeleteTarget(null);
          }}
          onConfirm={() => void removeGroup()}
        />
      )}
    </section>
  );
}

function ImportsScreen() {
  const [activeImport, setActiveImport] = useState<ContactImport | null>(null);
  const [imports, setImports] = useState<readonly ContactImport[]>([]);
  const [errorPage, setErrorPage] = useState<{
    readonly importId: string;
    readonly errors: readonly ImportError[];
    readonly nextAfterRowNumber: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<readonly Group[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const complete = activeImport?.status === "COMPLETED" || activeImport?.status === "FAILED";
  const activeImportId = activeImport?.id ?? null;
  const invalidRows = activeImport?.invalidRows ?? 0;
  const errors = errorPage?.importId === activeImportId ? errorPage.errors : [];
  const nextAfterRowNumber =
    errorPage?.importId === activeImportId ? errorPage.nextAfterRowNumber : null;
  useEffect(() => {
    void Promise.all([
      request<GroupsResponse>("/groups"),
      request<readonly ContactImport[]>("/contacts/imports"),
    ])
      .then(([loadedGroups, loadedImports]) => {
        setGroups(loadedGroups.groups);
        setImports(loadedImports);
        setActiveImport((current) => current ?? loadedImports[0] ?? null);
      })
      .catch((reason: unknown) => {
        setError(messageFor(reason));
      });
  }, []);
  useEffect(() => {
    if (activeImport === null || complete) return;
    const timer = window.setInterval(() => {
      void request<ContactImport>(`/contacts/imports/${activeImport.id}`)
        .then((updated) => {
          setActiveImport(updated);
          setImports((existing) => replaceImport(existing, updated));
        })
        .catch((reason: unknown) => {
          setError(messageFor(reason));
        });
    }, 3000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeImport, complete]);
  useEffect(() => {
    if (activeImportId === null || invalidRows === 0) return;
    void request<{
      readonly errors: readonly ImportError[];
      readonly nextAfterRowNumber: number | null;
    }>(`/contacts/imports/${activeImportId}/errors?limit=100`)
      .then((result) => {
        setErrorPage({ importId: activeImportId, ...result });
      })
      .catch((reason: unknown) => {
        setError(messageFor(reason));
      });
  }, [activeImportId, invalidRows]);
  async function loadMoreErrors() {
    if (activeImport === null || nextAfterRowNumber === null) return;
    try {
      const result = await request<{
        readonly errors: readonly ImportError[];
        readonly nextAfterRowNumber: number | null;
      }>(
        `/contacts/imports/${activeImport.id}/errors?limit=100&after_row_number=${String(nextAfterRowNumber)}`,
      );
      setErrorPage((existing) => ({
        importId: activeImport.id,
        errors: [
          ...(existing?.importId === activeImport.id ? existing.errors : []),
          ...result.errors,
        ],
        nextAfterRowNumber: result.nextAfterRowNumber,
      }));
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!(values.get("file") instanceof File) || (values.get("file") as File).size === 0) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }
    const mapping = importMapping(values);
    const payload = new FormData();
    payload.set("file", values.get("file") as File);
    payload.set("default_country_code", formText(values, "default_country_code") || "IN");
    payload.set("mapping", JSON.stringify(mapping));
    const groupId = formText(values, "group_id");
    if (groupId.length > 0) payload.set("group_id", groupId);
    setSubmitting(true);
    setError(null);
    try {
      setErrorPage(null);
      const started = await request<ContactImport>("/contacts/imports", {
        body: payload,
        method: "POST",
      });
      setActiveImport(started);
      setImports((existing) => [started, ...existing]);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section aria-labelledby="imports-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Bulk contact setup</p>
          <h2 id="imports-title">Imports</h2>
          <p>
            Files are scanned, stored privately, and processed in the background. Your browser may
            close after upload.
          </p>
        </div>
      </header>
      <form
        className="import-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label>
          CSV or XLSX file
          <input
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            name="file"
            required
            type="file"
          />
        </label>
        <label>
          Default country
          <select defaultValue="IN" name="default_country_code">
            <option value="IN">India (+91)</option>
          </select>
        </label>
        <label>
          Phone column header
          <input defaultValue="phone" name="phone_header" required />
        </label>
        <fieldset>
          <legend>Optional column headers</legend>
          <label>
            Name
            <input name="name_header" />
          </label>
          <label>
            Email
            <input name="email_header" />
          </label>
          <label>
            Company
            <input name="company_header" />
          </label>
          <label>
            Address
            <input name="address_header" />
          </label>
          <label>
            Custom fields JSON
            <input name="custom_fields_header" />
          </label>
          <label>
            Consent source
            <input name="consent_source_header" />
          </label>
          <label>
            Consent occurred-at
            <input name="consent_occurred_at_header" />
          </label>
          <label>
            Consent proof reference
            <input name="consent_proof_reference_header" />
          </label>
        </fieldset>
        <label>
          Add imported contacts to a group
          <select defaultValue="" name="group_id">
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={submitting} type="submit">
          {submitting ? "Uploading and scanning…" : "Start import"}
        </button>
        <p className="hint">
          Maximum 10 MiB and 10,000 rows. Existing active contacts are skipped and reported.
        </p>
      </form>
      {error !== null && <ErrorNotice message={error} />}
      {imports.length > 0 && (
        <section className="import-history" aria-label="Recent imports">
          <h3>Recent imports</h3>
          {imports.map((item) => (
            <button
              className={
                activeImport?.id === item.id ? "import-history-active" : "import-history-item"
              }
              key={item.id}
              onClick={() => {
                setActiveImport(item);
              }}
              type="button"
            >
              <span>{item.status}</span>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <span>{item.originalFilename}</span>
            </button>
          ))}
        </section>
      )}
      {activeImport !== null && (
        <section className="import-status" aria-live="polite">
          <h3>Import {activeImport.status}</h3>
          <p>
            {activeImport.insertedRows} imported · {activeImport.invalidRows} skipped/invalid ·{" "}
            {activeImport.totalRows} rows processed
          </p>
          {activeImport.errorCode !== null && (
            <p className="form-error">{activeImport.errorCode}</p>
          )}
          {errors.length > 0 && (
            <>
              <h4>Rows needing correction</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Issue</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((item) => (
                      <tr key={`${String(item.rowNumber)}-${item.errorCode}`}>
                        <td>{item.rowNumber}</td>
                        <td>{item.errorCode}</td>
                        <td>{item.errorMessage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {nextAfterRowNumber !== null && (
                <button onClick={() => void loadMoreErrors()} type="button">
                  Load more errors
                </button>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}

function ErrorNotice({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <span>{message}</span>
      {onRetry !== undefined && (
        <button onClick={onRetry} type="button">
          Retry
        </button>
      )}
    </div>
  );
}
function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function TableLoading({ label }: { readonly label: string }) {
  return (
    <div className="loading-card" role="status">
      {label}…
    </div>
  );
}
function ConsentDialog({
  contact,
  onCancel,
  onSaved,
}: {
  readonly contact: Contact;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const status = formText(values, "status");
    setSaving(true);
    setError(null);
    try {
      await request(`/contacts/${contact.id}/consent`, {
        body: JSON.stringify({
          occurred_at: emptyToNull(values.get("occurred_at")),
          proof_reference: emptyToNull(values.get("proof_reference")),
          source: formText(values, "source"),
          status,
          suppression_reason: emptyToNull(values.get("suppression_reason")),
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      onSaved();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog" role="dialog" aria-labelledby="consent-title">
        <h3 id="consent-title">Update consent for {contact.name ?? contact.phoneE164}</h3>
        <form
          className="dialog-form"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <label>
            Status
            <select defaultValue="OPTED_IN" name="status">
              <option value="OPTED_IN">Opted in</option>
              <option value="OPTED_OUT">Opted out</option>
              <option value="SUPPRESSED">Suppressed</option>
            </select>
          </label>
          <label>
            Evidence source
            <input defaultValue="MANUAL" name="source" required />
          </label>
          <label>
            Evidence reference (required for opt-in)
            <input name="proof_reference" />
          </label>
          <label>
            Occurred at
            <input name="occurred_at" type="datetime-local" />
          </label>
          <label>
            Suppression reason (required when suppressing)
            <input name="suppression_reason" />
          </label>
          {error !== null && <p className="form-error">{error}</p>}
          <div className="dialog-actions">
            <button onClick={onCancel} type="button">
              Cancel
            </button>
            <button disabled={saving} type="submit">
              {saving ? "Saving…" : "Save consent"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function ConfirmationDialog({
  title,
  description,
  destructiveLabel = "Delete contact",
  onCancel,
  onConfirm,
}: {
  readonly title: string;
  readonly description: string;
  readonly destructiveLabel?: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-describedby="confirmation-description"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <h3>{title}</h3>
        <p id="confirmation-description">{description}</p>
        <div className="dialog-actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="button-danger" onClick={onConfirm} type="button">
            {destructiveLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? null : text;
}

function formText(values: FormData, field: string): string {
  const value = values.get(field);
  return typeof value === "string" ? value : "";
}

function importMapping(values: FormData): Record<string, string> {
  const entries: readonly [string, string][] = [
    ["phone", "phone_header"],
    ["name", "name_header"],
    ["email", "email_header"],
    ["company", "company_header"],
    ["address", "address_header"],
    ["custom_fields", "custom_fields_header"],
    ["consent_source", "consent_source_header"],
    ["consent_occurred_at", "consent_occurred_at_header"],
    ["consent_proof_reference", "consent_proof_reference_header"],
  ];
  return Object.fromEntries(
    entries
      .map(([field, formField]) => [field, formText(values, formField).trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
}
function replaceImport(
  imports: readonly ContactImport[],
  updated: ContactImport,
): readonly ContactImport[] {
  return imports.map((item) => (item.id === updated.id ? updated : item));
}
function messageFor(reason: unknown): string {
  return reason instanceof ApiClientError ? reason.message : "Something went wrong. Try again.";
}
