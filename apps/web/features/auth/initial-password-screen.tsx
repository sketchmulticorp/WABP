"use client";
import { useState, type SyntheticEvent } from "react";
import { changeInitialPassword } from "../workspace/api-client";
import { PasswordInput } from "./password-input";

/** Restricted first login; no workspace components mount while this gate is active. */
export function InitialPasswordScreen({
  email,
  signOut,
}: {
  readonly email: string;
  readonly signOut: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentValue = fields.get("current_password");
    const nextValue = fields.get("new_password");
    const current = typeof currentValue === "string" ? currentValue : "";
    const next = typeof nextValue === "string" ? nextValue : "";
    if (next !== fields.get("confirm_password")) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeInitialPassword(current, next);
      form.reset();
      setComplete(true);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Password change failed. Try again or sign in again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main>
      <section className="auth-card" aria-labelledby="initial-password-title">
        <h1 id="initial-password-title">
          {complete ? "Password changed" : "Choose your own password"}
        </h1>
        {complete ? (
          <>
            <p role="status">
              Your temporary password has been replaced and all sessions have been signed out.
            </p>
            <button type="button" onClick={signOut}>
              Sign in with your new password
            </button>
          </>
        ) : (
          <>
            <p>{email}: change your temporary password before accessing the workspace.</p>
            <p>
              Use 12–128 characters including uppercase, lowercase, a number and a symbol. Choose a
              different password from the temporary one.
            </p>
            {error !== null && <p role="alert">{error}</p>}
            <form onSubmit={(event) => void submit(event)}>
              <fieldset disabled={saving}>
                <PasswordInput
                  autoComplete="current-password"
                  label="Temporary password"
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
                <button type="submit">{saving ? "Changing password…" : "Change password"}</button>
                <button type="button" onClick={signOut}>
                  Sign out
                </button>
              </fieldset>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
