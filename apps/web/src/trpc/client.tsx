"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import type { AppRouter } from "@bakery/api";
import { api } from "./react";
import { DiagnosticsRecorder } from "@/components/DiagnosticsRecorder";
import { createClientSupabase } from "@/lib/supabase/client";

/**
 * Catches UNAUTHORIZED errors caused by an expired Supabase JWT,
 * refreshes the session, and retries the operation once. Without this,
 * a user whose token aged out (e.g. spent >1h pasting Shopify
 * credentials) sees "You must be signed in to do that." even though
 * the app shell still says they're logged in.
 *
 * Only retries once per call, and only for UNAUTHORIZED — every other
 * error is forwarded as-is. If the refresh itself fails, the original
 * error is forwarded so the user sees something rather than nothing.
 */
const authRetryLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      let retried = false;
      let activeUnsub: (() => void) | null = null;

      const run = () => {
        const sub = next(op).subscribe({
          next:     (value) => observer.next(value),
          complete: ()      => observer.complete(),
          error:    (err) => {
            const isUnauthorized = err.data?.code === "UNAUTHORIZED";
            if (!isUnauthorized || retried) {
              observer.error(err);
              return;
            }
            retried = true;
            (async () => {
              try {
                const supabase = createClientSupabase();
                const { error: refreshErr } = await supabase.auth.refreshSession();
                if (refreshErr) {
                  observer.error(err);
                  return;
                }
              } catch {
                observer.error(err);
                return;
              }
              run();
            })();
          },
        });
        activeUnsub = () => sub.unsubscribe();
      };

      run();
      return () => activeUnsub?.();
    });
  };
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache data for 5 minutes before marking it stale.
        // Most bakery data changes infrequently, so aggressive refetching
        // only adds unnecessary latency.
        staleTime: 5 * 60 * 1000,
        // Auto-retry transient failures (notably Supabase free-tier cold-start
        // timeouts which take 5-15s to resolve). 2 retries with 500ms→1500ms→3000ms
        // backoff covers the typical wake-up window without making genuine errors
        // feel slow.
        retry: 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always create a new QueryClient
    return makeQueryClient();
  }
  // Browser: reuse the same client across renders
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function TRPCReactProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        // Order matters: authRetryLink must wrap httpBatchLink so it sees
        // the network error before it bubbles up to React Query.
        authRetryLink,
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          // 15s per-request timeout. Fails fast on hung requests so React Query
          // can retry, instead of leaving the user staring at skeletons forever.
          fetch: (url, options) =>
            fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }),
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <DiagnosticsRecorder />
        {children}
      </QueryClientProvider>
    </api.Provider>
  );
}
