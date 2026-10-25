"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { CurrentUserResponse } from "@whatsapp-platform/contracts";
import { PasswordInput } from "../auth/password-input";
import { createSuperAdmin } from "./super-admin-api";

/** Explicit partner provisioning only; no tenant access, impersonation or account editing. */
export function SuperAdminScreen({
  user,
  onDirtyChange,
}: {
  readonly user: CurrentUserResponse;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onDirtyChange(dirty || saving);
  }, [dirty, saving, onDirtyChange]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty || saving) event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => {
      window.removeEventListener("beforeunload", prevent);
    };
  }, [dirty, saving]);

  if (user.role.system_key !== "SUPER_ADMIN" || !user.permissions.includes("user.invite"))
    return <p role="alert">You do not have permission to create Super Admins.</p>;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (
      !window.confirm(
        "Create a Super Admin with the same platform privileges as you? Only add a trusted partner.",
      )
    )
      return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const text = (key: string) => {
      const value = fields.get(key);
      return typeof value === "string" ? value : "";
    };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createSuperAdmin({
        display_name: text("display_name"),
        email: text("email"),
        initial_password: text("initial_password"),
      });
      if (!mounted.current) return;
      form.reset();
      setDirty(false);
      setNotice(
        `${created.user.display_name} (${created.user.email}) was created as Super Admin. Share the temporary password securely outside the app. They must change it and sign in again before accessing the platform.`,
      );
    } catch (reason: unknown) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The account could not be created. Try again later.",
        );
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section aria-labelledby="super-admin-heading">
      <p className="eyebrow">Platform access</p>
      <h2 id="super-admin-heading">Add Super Admin</h2>
      <p>
        For trusted partners only. This grants the same platform administration privileges as your
        account, including adding other Super Admins.
      </p>
      <p>
        Tenant contacts and message content stay private. This does not create or join a business.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      <form
        className="insight-form"
        onSubmit={(event) => {
          void submit(event);
        }}
        onChange={() => {
          setDirty(true);
        }}
      >
        <fieldset disabled={saving}>
          <legend>Partner account</legend>
          <label>
            Full name
            <input name="display_name" autoComplete="off" required maxLength={255} />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="off" required maxLength={320} />
          </label>
          <PasswordInput
            autoComplete="new-password"
            label="Temporary password"
            maxLength={128}
            minLength={12}
            name="initial_password"
            required
          />
          <p>
            Use 12–128 characters with uppercase, lowercase, a number and a symbol. The API never
            returns the password. Share it securely outside the app; no invitation email is sent.
          </p>
          <p>
            The partner must replace it on first login. That change signs out all their sessions and
            requires a fresh login.
          </p>
          <div className="insight-toolbar">
            <button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create Super Admin"}
            </button>
            <button
              type="reset"
              onClick={() => {
                setDirty(false);
                setError(null);
              }}
            >
              Clear form
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
