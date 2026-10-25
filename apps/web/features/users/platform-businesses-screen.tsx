"use client";

import type { PlatformTenantCreationResponse } from "@whatsapp-platform/contracts";
import { type SyntheticEvent, useEffect, useState } from "react";

import { request } from "../workspace/api-client";
import { PasswordInput } from "../auth/password-input";

interface PlatformTenant {
  readonly createdAt: string;
  readonly defaultTimezone: string;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
}

export function PlatformBusinessesScreen() {
  const [tenants, setTenants] = useState<readonly PlatformTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void request<readonly PlatformTenant[]>("/platform/tenants", { signal: controller.signal })
      .then((result) => {
        setTenants(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Businesses could not be loaded.");
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
      const result = await request<PlatformTenantCreationResponse>("/platform/tenants", {
        body: JSON.stringify({
          admin_display_name: data.get("admin_display_name"),
          admin_email: data.get("admin_email"),
          admin_temporary_password: data.get("admin_temporary_password"),
          default_country_code: data.get("default_country_code"),
          default_timezone: data.get("default_timezone"),
          name: data.get("name"),
          slug: data.get("slug"),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      form.reset();
      setNotice(`${result.tenant.name} and its first Tenant Admin were created.`);
      setLoading(true);
      setGeneration((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The business could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-screen" aria-labelledby="businesses-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Platform access</p>
          <h2 id="businesses-title">Businesses and admins</h2>
          <p>Create a business and its first Tenant Admin together.</p>
        </div>
      </div>
      <form className="insight-form account-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving}>
          <legend>New business</legend>
          <div className="account-form-grid">
            <label>
              Business name
              <input name="name" maxLength={255} required />
            </label>
            <label>
              Slug
              <input
                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="acme-clinic"
                required
              />
            </label>
            <label>
              Timezone
              <input name="default_timezone" defaultValue="Asia/Kolkata" required />
            </label>
            <label>
              Country code
              <input
                name="default_country_code"
                defaultValue="IN"
                maxLength={2}
                pattern="[A-Za-z]{2}"
              />
            </label>
            <label>
              Admin name
              <input name="admin_display_name" maxLength={255} required autoComplete="name" />
            </label>
            <label>
              Admin email
              <input
                name="admin_email"
                type="email"
                maxLength={320}
                required
                autoComplete="email"
              />
            </label>
            <PasswordInput
              autoComplete="new-password"
              label="Initial password"
              maxLength={128}
              minLength={12}
              name="admin_temporary_password"
              required
            />
          </div>
          <p className="hint">
            Use uppercase, lowercase, number and symbol. Share the password outside the application.
          </p>
          <button disabled={saving} type="submit">
            {saving ? "Creating business…" : "Create business and admin"}
          </button>
        </fieldset>
      </form>
      {error !== null && (
        <div className="error-notice" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setGeneration((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {notice !== null && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading businesses…</p>}
      {!loading && tenants?.length === 0 && <p>No businesses found.</p>}
      {!loading && tenants !== null && tenants.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Timezone</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>{tenant.name}</td>
                  <td>{tenant.slug}</td>
                  <td>
                    <span className="status-badge">{tenant.status}</span>
                  </td>
                  <td>{tenant.defaultTimezone}</td>
                  <td>{new Date(tenant.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
