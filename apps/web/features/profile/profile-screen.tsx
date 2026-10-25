"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import styles from "./profile.module.css";
import type { CurrentUserResponse } from "@whatsapp-platform/contracts";
import { ApiClientError, changePassword } from "../workspace/api-client";
import { PasswordInput } from "../auth/password-input";
import { updateOwnName } from "./profile-api";

/** Own-account settings only; administrative account controls remain separate. */
export function ProfileScreen({
  user,
  onNameChanged,
  onPasswordChanged,
  onDirtyChange,
}: {
  readonly user: CurrentUserResponse;
  readonly onNameChanged: (name: string) => void;
  readonly onPasswordChanged: () => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(user.display_name);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = busy || passwordDirty || name !== user.display_name;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => {
      window.removeEventListener("beforeunload", prevent);
    };
  }, [dirty]);

  async function saveName(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateOwnName(name);
      setName(updated.display_name);
      onNameChanged(updated.display_name);
      setNotice("Your name has been updated.");
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const current = textField(fields, "current_password");
    const next = textField(fields, "new_password");
    setError(null);
    setNotice(null);
    if (next !== textField(fields, "confirm_password")) {
      setError("New passwords do not match.");
      return;
    }
    // Prevent a successful credential change from silently discarding a pending name edit.
    if (name !== user.display_name) {
      setError("Save or cancel your name change before changing your password.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      form.reset();
      setPasswordDirty(false);
      onDirtyChange(false);
      onPasswordChanged();
    } catch (reason: unknown) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <section className={`insight-screen ${styles.profile ?? ""}`} aria-labelledby="profile-heading">
      <p className="eyebrow">Account settings</p>
      <h2 id="profile-heading">My profile</h2>
      <p>
        Manage your name and password. Your email, role and business are managed by your
        administrator.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      <dl className={styles.details}>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{user.role.name}</dd>
        </div>
        <div>
          <dt>Business</dt>
          <dd>{user.tenant?.name ?? "Platform account"}</dd>
        </div>
      </dl>
      <form
        onSubmit={(event) => {
          void saveName(event);
        }}
      >
        <fieldset disabled={busy}>
          <legend>Personal information</legend>
          <label>
            Display name
            <input
              name="display_name"
              autoComplete="name"
              required
              maxLength={255}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <div className="insight-toolbar">
            <button
              type="submit"
              disabled={busy || name === user.display_name || name.trim().length === 0}
            >
              Save name
            </button>
            <button
              type="button"
              onClick={() => {
                setName(user.display_name);
              }}
            >
              Cancel name change
            </button>
          </div>
        </fieldset>
      </form>
      <form
        onSubmit={(event) => {
          void savePassword(event);
        }}
        onChange={() => {
          setPasswordDirty(true);
        }}
      >
        <fieldset disabled={busy}>
          <legend>Change password</legend>
          <p>Use 12–128 characters including uppercase, lowercase, a number and a symbol.</p>
          <p>
            Changing your password signs out every session, including this one. You must sign in
            again.
          </p>
          <PasswordInput
            autoComplete="current-password"
            label="Current password"
            maxLength={128}
            name="current_password"
            required
          />
          <PasswordInput
            autoComplete="new-password"
            label="New password"
            maxLength={128}
            minLength={12}
            name="new_password"
            required
          />
          <PasswordInput
            autoComplete="new-password"
            label="Confirm new password"
            maxLength={128}
            minLength={12}
            name="confirm_password"
            required
          />
          <div className="insight-toolbar">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Change password and sign out"}
            </button>
            <button
              type="reset"
              onClick={() => {
                setPasswordDirty(false);
              }}
            >
              Clear passwords
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function errorMessage(reason: unknown): string {
  return reason instanceof ApiClientError
    ? reason.message
    : "Unable to save changes. Check your connection and try again. If your password change succeeded, sign in with the new password.";
}

function textField(fields: FormData, key: string): string {
  const value = fields.get(key);
  return typeof value === "string" ? value : "";
}
