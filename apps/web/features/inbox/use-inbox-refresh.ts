"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../workspace/api-client";

const REFRESH_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;
interface Snapshot<T> {
  readonly key: string | null;
  readonly data: T | null;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly lastUpdatedAt: string | null;
  readonly stopped: boolean;
}
function empty<T>(key: string | null): Snapshot<T> {
  return { key, data: null, refreshing: false, error: null, lastUpdatedAt: null, stopped: false };
}

/**
 * Mount once per Inbox. Memoize load; include user/tenant/filter/selection identity in key.
 * Only reads belong in load. Mutations remain explicit and call refresh after success.
 */
export function useInboxRefresh<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>(() => empty(key));
  const trigger = useRef<(() => void) | null>(null);
  const refresh = useCallback(() => {
    trigger.current?.();
  }, []);

  useEffect(() => {
    if (key === null) return;
    let active = true,
      inFlight = false,
      pending = false,
      stopped = false,
      failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    // Read through accessors: event callbacks can change these across an awaited load.
    const isActive = () => active;
    const isStopped = () => stopped;
    const hasPending = () => pending;
    const eligible = () => document.visibilityState === "visible" && navigator.onLine;
    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const run = async (): Promise<void> => {
      if (!isActive() || isStopped() || !eligible()) return;
      clear();
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      pending = false;
      const requestController = new AbortController();
      controller = requestController;
      setSnapshot((current) => ({
        ...(current.key === key ? current : empty<T>(key)),
        refreshing: true,
      }));
      try {
        const data = await load(requestController.signal);
        if (!isActive() || requestController.signal.aborted) return;
        failures = 0;
        setSnapshot({
          key,
          data,
          refreshing: false,
          error: null,
          lastUpdatedAt: new Date().toISOString(),
          stopped: false,
        });
      } catch (error) {
        if (!isActive() || requestController.signal.aborted) return;
        // Cancel sibling reads when a combined snapshot loader rejects early.
        requestController.abort();
        failures += 1;
        stopped =
          error instanceof ApiClientError &&
          error.status >= 400 &&
          error.status < 500 &&
          ![408, 429].includes(error.status);
        const unauthorized = error instanceof ApiClientError && [401, 403].includes(error.status);
        setSnapshot((current) => ({
          ...(current.key === key ? current : empty<T>(key)),
          ...(unauthorized ? { data: null, lastUpdatedAt: null } : {}),
          refreshing: false,
          error:
            error instanceof ApiClientError
              ? error.message
              : "Inbox refresh failed. Please try again.",
          stopped,
        }));
      } finally {
        // Abort ignored by a loader still cannot publish old data or start a second loop.
        inFlight = false;
        controller = undefined;
        if (isActive())
          setSnapshot((current) =>
            current.key === key ? { ...current, refreshing: false } : current,
          );
        if (isActive() && !isStopped() && eligible()) {
          const delay = hasPending()
            ? 0
            : Math.min(MAX_BACKOFF_MS, REFRESH_MS * 2 ** Math.min(failures, 2));
          timer = setTimeout(() => {
            void run();
          }, delay);
        }
      }
    };
    const wake = () => {
      clear();
      if (!eligible()) {
        pending = false;
        controller?.abort();
        return;
      }
      void run();
    };
    trigger.current = wake;
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    void run();
    return () => {
      active = false;
      trigger.current = null;
      clear();
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
    };
  }, [key, load]);

  // Never render another session/selection's retained payload during effect cleanup.
  return { ...(snapshot.key === key && key !== null ? snapshot : empty<T>(key)), refresh };
}
