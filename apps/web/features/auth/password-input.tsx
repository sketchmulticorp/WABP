"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  readonly label: string;
};

/** Password field presentation only; form ownership and password values stay with the caller. */
export function PasswordInput({ id, label, ...inputProps }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input-wrap">
        <input {...inputProps} id={inputId} type={visible ? "text" : "password"} />
        <button
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="password-visibility-button"
          onClick={() => {
            setVisible((current) => !current);
          }}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            {visible ? (
              <>
                <path d="m3 3 18 18" />
                <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                <path d="M9.9 4.3A10.8 10.8 0 0 1 12 4c5.5 0 9 5.2 9 8a8.2 8.2 0 0 1-2.1 3.8M6.6 6.6C4.3 8.1 3 10.4 3 12c0 2.8 3.5 8 9 8 1.6 0 3-.4 4.2-1" />
              </>
            ) : (
              <>
                <path d="M3 12c0-2.8 3.5-8 9-8s9 5.2 9 8-3.5 8-9 8-9-5.2-9-8Z" />
                <circle cx="12" cy="12" r="2.5" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
