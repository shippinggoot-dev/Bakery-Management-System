"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

if (typeof window !== "undefined" && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,

    // Manual pageview capture — Next.js client-side navigation doesn't fire
    // a page load, so PostHog's default auto-capture misses route changes.
    // The Suspense tracker below issues $pageview events on every pathname change.
    capture_pageview: false,

    // Session recording is disabled by default. Will be enabled opt-in via a
    // workspace setting in a follow-up change. Even when later turned on, the
    // masking config below ensures sensitive content stays hidden.
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },

    loaded: (ph) => {
      // Don't send events from local dev — keeps the analytics clean.
      if (process.env.NODE_ENV !== "production") ph.opt_out_capturing();
    },
  });
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams?.toString();
    const url = window.location.origin + pathname + (search ? `?${search}` : "");
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </Provider>
  );
}
