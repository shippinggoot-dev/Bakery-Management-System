"use client";

import { useEffect } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { appendEntry } from "@/lib/diagnostics-store";

/**
 * Subscribes to the React Query cache and records every query's lifecycle
 * into the local diagnostics log. Captures the user-perceived duration
 * (start of fetch → response/error) which includes network + server time.
 *
 * Mounted once at the provider level. No UI.
 */
export function DiagnosticsRecorder() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const startTimes = new WeakMap<Query, number>();
    const cache = queryClient.getQueryCache();

    const unsubscribe = cache.subscribe((event) => {
      const q = event.query;
      const state = q.state;

      // Track the moment a fetch begins.
      if (state.fetchStatus === "fetching" && !startTimes.has(q)) {
        startTimes.set(q, Date.now());
        return;
      }

      // Fetch finished — either success or error.
      if (state.fetchStatus === "idle" && startTimes.has(q)) {
        const start = startTimes.get(q)!;
        startTimes.delete(q);
        const duration = Date.now() - start;
        const procedure = describeQueryKey(q.queryKey);
        const status: "success" | "error" =
          state.status === "error" ? "error" : "success";
        const errorMessage =
          state.status === "error" && state.error
            ? state.error instanceof Error
              ? state.error.message
              : String(state.error)
            : null;

        appendEntry({
          ts: Date.now(),
          procedure,
          durationMs: duration,
          status,
          errorMessage,
        });
      }
    });

    return unsubscribe;
  }, [queryClient]);

  return null;
}

/**
 * tRPC + React Query encodes the procedure path as the first element of
 * the query key, e.g. [["recipes","getAll"], { input: ... }]. Flatten
 * the path segment into a "recipes.getAll" string.
 */
function describeQueryKey(key: unknown): string {
  if (Array.isArray(key) && Array.isArray(key[0])) {
    return (key[0] as unknown[]).filter((s) => typeof s === "string").join(".");
  }
  if (Array.isArray(key)) {
    return key.filter((s) => typeof s === "string").join(".");
  }
  return String(key);
}
