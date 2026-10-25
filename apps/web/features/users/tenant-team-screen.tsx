"use client";

import type {
  CreateTenantUserResponse,
  CurrentUserResponse,
  DeleteTenantUserResponse,
  TenantUserListResponse,
  TenantUserStatusResponse,
} from "@whatsapp-platform/contracts";
import { type SyntheticEvent, useEffect, useState } from "react";

import { request } from "../workspace/api-client";
import { PasswordInput } from "../auth/password-input";

export function TenantTeamScreen({ user }: { readonly user: CurrentUserResponse }) {
  const [team, setTeam] = useState<TenantUserListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void request<TenantUserListResponse>("/users", { signal: controller.signal })
      .then((result) => {
        setTeam(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The team could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [generation]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<CreateTenantUserResponse>("/users", {
        body: JSON.stringify({
          display_name: data.get("display_name"),
          email: data.get("email"),
          initial_password: data.get("initial_password"),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      form.reset();
      setNotice(`${result.user.display_name} can now sign in with the initial password.`);
      setLoading(true);
      setGeneration((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The user could not be created.");
    } finally {
      setSaving(false);
    }
  }

  function reloadTeam() {
    setLoading(true);
    setGeneration((value) => value + 1);
  }

  async function changeStatus(userId: string, status: "ACTIVE" | "DISABLED") {
    if (
      status === "DISABLED" &&
      !window.confirm("Deactivate this user and sign them out of every active session?")
    ) {
      return;
    }
    setBusyUserId(userId);
    setError(null);
    setNotice(null);
    try {
      const result = await request<TenantUserStatusResponse>(`/users/${userId}/status`, {
        body: JSON.stringify({ status }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      setNotice(
        `${result.user.display_name} was ${status === "ACTIVE" ? "reactivated" : "deactivated"}.`,
      );
      reloadTeam();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The account status could not be changed.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeUser(userId: string, displayName: string) {
    if (
      !window.confirm(
        `Soft-delete ${displayName}? Their sessions will be revoked. Creating the same email later will restore this account.`,
      )
    ) {
      return;
    }
    setBusyUserId(userId);
    setError(null);
    setNotice(null);
    try {
      await request<DeleteTenantUserResponse>(`/users/${userId}`, { method: "DELETE" });
      setNotice(`${displayName} was deleted.`);
      reloadTeam();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The user could not be deleted.");
    } finally {
      setBusyUserId(null);
    }
  }

  if (user.role.system_key !== "TENANT_ADMIN") {
    return <p role="alert">Only the Tenant Admin can manage the team.</p>;
  }

  return (
    <section className="account-screen" aria-labelledby="team-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Access management</p>
          <h2 id="team-title">Team</h2>
          <p>Create regular users for {user.tenant?.name ?? "this business"}.</p>
        </div>
      </div>
      {user.permissions.includes("user.invite") && (
        <form className="insight-form account-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={saving}>
            <legend>Create a Tenant User</legend>
            <label>
              Display name
              <input name="display_name" maxLength={255} required autoComplete="name" />
            </label>
            <label>
              Email
              <input name="email" type="email" maxLength={320} required autoComplete="email" />
            </label>
            <PasswordInput
              aria-describedby="team-password-help"
              autoComplete="new-password"
              label="Initial password"
              maxLength={128}
              minLength={12}
              name="initial_password"
              required
            />
            <p className="hint" id="team-password-help">
              Use 12–128 characters with uppercase, lowercase, number and symbol. Share it outside
              the application; email delivery and forced password change are not enabled locally.
            </p>
            <button disabled={saving} type="submit">
              {saving ? "Creating user…" : "Create Tenant User"}
            </button>
          </fieldset>
        </form>
      )}
      {error !== null && (
        <div className="error-notice" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              reloadTeam();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {notice !== null && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading team…</p>}
      {!loading && team?.users.length === 0 && <p>No team members found.</p>}
      {!loading && team !== null && team.users.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                {(user.permissions.includes("user.update") ||
                  user.permissions.includes("user.deactivate")) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {team.users.map((member) => (
                <tr key={member.id}>
                  <td>{member.display_name}</td>
                  <td>{member.email}</td>
                  <td>{member.role === "TENANT_ADMIN" ? "Tenant Admin" : "Tenant User"}</td>
                  <td>
                    <span className="status-badge">{member.status}</span>
                  </td>
                  <td>{new Date(member.created_at).toLocaleDateString()}</td>
                  {(user.permissions.includes("user.update") ||
                    user.permissions.includes("user.deactivate")) && (
                    <td>
                      {member.role === "TENANT_USER" ? (
                        <div className="insight-actions">
                          {user.permissions.includes("user.update") && (
                            <button
                              disabled={busyUserId !== null}
                              type="button"
                              onClick={() => {
                                void changeStatus(
                                  member.id,
                                  member.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                                );
                              }}
                            >
                              {member.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                            </button>
                          )}
                          {user.permissions.includes("user.deactivate") && (
                            <button
                              className="button-danger"
                              disabled={busyUserId !== null}
                              type="button"
                              onClick={() => {
                                void removeUser(member.id, member.display_name);
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
