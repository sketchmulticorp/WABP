import { useEffect, useState, type SyntheticEvent } from "react";
import type { DevelopmentAssetInput } from "./whatsapp-api";

/** Collects test asset identifiers, never access tokens or a caller-selected credential reference. */
export function DevelopmentConnectionForm({
  busy,
  onSave,
  onDirtyChange,
}: {
  readonly busy: boolean;
  readonly onSave: (value: DevelopmentAssetInput) => void;
  readonly onDirtyChange: (value: boolean) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = data.get(key);
      return typeof value === "string" ? value.trim() : "";
    };
    if (
      !window.confirm(
        "Save this development WABA/phone mapping for your business? This stores identifiers and a server credential reference; it does not verify the token or send a message.",
      )
    )
      return;
    onSave({
      waba_id: text("waba"),
      phone_number_id: text("phoneId"),
      display_phone: text("phone"),
      display_name: text("name") || null,
      business_id: text("business") || null,
    });
  }
  return (
    <form
      key={version}
      className="whatsapp-connection"
      aria-label="Development WhatsApp setup"
      onSubmit={submit}
      onChangeCapture={() => {
        setDirty(true);
      }}
    >
      <h3>Map Meta test assets</h3>
      <p>
        Use the IDs from your Meta development app. This is manual development setup, not Embedded
        Signup or production onboarding.
      </p>
      <p className="campaign-help">
        Keep META_DEVELOPMENT_ACCESS_TOKEN only in the server’s local .env. The application uses a
        fixed server-side reference; never paste a token into these fields.
      </p>
      <fieldset disabled={busy}>
        <label>
          WABA ID
          <input name="waba" required maxLength={512} autoComplete="off" />
        </label>
        <label>
          Phone number ID
          <input name="phoneId" required maxLength={512} autoComplete="off" />
        </label>
        <label>
          Display phone number
          <input name="phone" required maxLength={512} placeholder="+91…" autoComplete="off" />
        </label>
        <label>
          Display name (optional)
          <input name="name" maxLength={512} />
        </label>
        <label>
          Business ID (optional)
          <input name="business" maxLength={512} autoComplete="off" />
        </label>
        <div className="template-actions">
          <button type="submit">{busy ? "Saving…" : "Save development mapping"}</button>
          <button
            type="button"
            onClick={() => {
              if (!dirty || window.confirm("Clear unsaved WhatsApp setup fields?")) {
                setVersion((value) => value + 1);
                setDirty(false);
              }
            }}
          >
            Clear fields
          </button>
        </div>
      </fieldset>
    </form>
  );
}
