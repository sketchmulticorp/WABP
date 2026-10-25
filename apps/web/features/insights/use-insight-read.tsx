"use client";
import { useEffect, useState } from "react";
import { insightsApi } from "./insights-api";

/** Abort on scope/filter changes; never display a snapshot belonging to another path. */
export function useInsightRead<T>(path: string | null) {
  const [snapshot, setSnapshot] = useState<{
    path: string;
    data: T | null;
    error: string | null;
  } | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    void insightsApi
      .read<T>(path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSnapshot({ path, data, error: null });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setSnapshot({
            path,
            data: null,
            error: reason instanceof Error ? reason.message : "Unable to load this view.",
          });
      });
    return () => {
      controller.abort();
    };
  }, [path, generation]);
  const current = snapshot?.path === path ? snapshot : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    clear: (message: string) => {
      setSnapshot({ path: path ?? "", data: null, error: message });
    },
    reload: () => {
      setSnapshot(null);
      setGeneration((n) => n + 1);
    },
  };
}
export function InsightReadState({
  error,
  loading,
  retry,
}: {
  readonly error: string | null;
  readonly loading: boolean;
  readonly retry: () => void;
}) {
  if (error !== null)
    return (
      <p role="alert">
        {error}{" "}
        <button type="button" onClick={retry}>
          Retry
        </button>
      </p>
    );
  return loading ? <p role="status">Loading…</p> : null;
}
