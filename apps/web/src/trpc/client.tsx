"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { api } from "./react";

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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
