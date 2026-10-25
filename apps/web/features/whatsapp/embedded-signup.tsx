import { useEffect, useRef, useState } from "react";
import type { WhatsAppSignupAttempt } from "@whatsapp-platform/contracts";
import { whatsappApi } from "./whatsapp-api";

interface FacebookSdk {
  init(options: { appId: string; version: string; xfbml: false; cookie: false }): void;
  login(callback: (response: unknown) => void, options: Record<string, unknown>): void;
}
declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}
let sdkPromise: Promise<FacebookSdk> | null = null;

/** Loads third-party code only after explicit intent; never accepts a configured script URL. */
function loadSdk(): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    const timeout = window.setTimeout(() => {
      script.remove();
      sdkPromise = null;
      reject(new Error("Meta SDK timed out. Retry setup."));
    }, 15000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.FB) resolve(window.FB);
      else {
        sdkPromise = null;
        reject(new Error("Meta SDK unavailable."));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(new Error("Meta SDK could not load. Retry setup."));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** SDK result IDs are hints only. Backend verifies token, app, permissions and asset access. */
export function EmbeddedSignup({ onConnected }: { readonly onConnected: () => void }) {
  const [attempt, setAttempt] = useState<WhatsAppSignupAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup.current?.();
    };
  }, []);

  async function prepare() {
    cleanup.current?.();
    setAttempt(null);
    setBusy(true);
    setError(null);
    try {
      await loadSdk();
      const next = await whatsappApi.startSignup();
      if (mounted.current) setAttempt(next);
    } catch (reason) {
      if (mounted.current) setError(message(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function open() {
    if (!attempt || !window.FB) return;
    cleanup.current?.();
    setBusy(true);
    setError(null);
    let code: string | null = null,
      ids: { wabaId: string; phoneNumberId: string } | null = null;
    let done = false;
    const finish = () => {
      if (!code || !ids || done || !mounted.current) return;
      done = true;
      cleanup.current?.();
      void whatsappApi
        .completeSignup({ ...ids, code, attemptId: attempt.attemptId, nonce: attempt.nonce })
        .then(() => {
          if (mounted.current) {
            setAttempt(null);
            onConnected();
          }
        })
        .catch((reason: unknown) => {
          if (mounted.current) {
            setAttempt(null);
            setError(message(reason));
          }
        })
        .finally(() => {
          if (mounted.current) setBusy(false);
        });
      code = null;
    };
    const fail = (text: string) => {
      done = true;
      cleanup.current?.();
      if (mounted.current) {
        setBusy(false);
        setAttempt(null);
        setError(text);
      }
    };
    const listener = (event: MessageEvent<unknown>) => {
      if (
        done ||
        !["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin) ||
        event.source === window
      )
        return;
      try {
        const value: unknown = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!record(value) || value.type !== "WA_EMBEDDED_SIGNUP") return;
        if (value.event === "CANCEL" || value.event === "ERROR") {
          fail("Meta signup was cancelled or could not finish. Start a new attempt.");
          return;
        }
        if (value.event !== "FINISH" || !record(value.data)) return;
        const { waba_id: wabaId, phone_number_id: phoneNumberId } = value.data;
        if (
          typeof wabaId !== "string" ||
          !/^\d{1,64}$/u.test(wabaId) ||
          typeof phoneNumberId !== "string" ||
          !/^\d{1,64}$/u.test(phoneNumberId)
        )
          return;
        ids = { wabaId, phoneNumberId };
        finish();
      } catch {
        /* Unrelated/malformed postMessage data is never treated as authorization. */
      }
    };
    window.addEventListener("message", listener);
    const timeout = window.setTimeout(() => {
      fail("Signup expired. Refresh accounts, then start again if needed.");
    }, attempt.expiresInSeconds * 1000);
    cleanup.current = () => {
      window.removeEventListener("message", listener);
      window.clearTimeout(timeout);
    };
    try {
      window.FB.init({
        appId: attempt.appId,
        version: attempt.graphApiVersion,
        xfbml: false,
        cookie: false,
      });
      // Separate Prepare/Continue actions preserve a synchronous user gesture for the popup.
      window.FB.login(
        (response) => {
          if (done || !mounted.current) return;
          const auth =
            record(response) && record(response.authResponse) ? response.authResponse : null;
          if (!auth || typeof auth.code !== "string" || auth.code.length === 0) {
            fail("Meta authorization did not complete. Start again when ready.");
            return;
          }
          code = auth.code;
          finish();
        },
        {
          config_id: attempt.configurationId,
          response_type: "code",
          override_default_response_type: true,
          extras: { version: "v4" },
        },
      );
    } catch {
      fail("Meta signup could not open. Check popup permissions and HTTPS configuration.");
    }
  }
  return (
    <section aria-label="Connect through Meta">
      <h3>Connect your business with Meta</h3>
      <p>
        Sign in only in Meta’s window. We never ask for your Meta password. Connection verifies
        access; it does not register a phone, subscribe webhooks or send messages.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Complete the Meta window or wait for verification…</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void prepare();
        }}
      >
        {attempt ? "Restart setup" : "Prepare Meta connection"}
      </button>
      {attempt && (
        <button type="button" disabled={busy} onClick={open}>
          Continue with Meta
        </button>
      )}
    </section>
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function message(value: unknown) {
  return value instanceof Error
    ? value.message
    : "Connection failed. Refresh accounts before retrying.";
}
