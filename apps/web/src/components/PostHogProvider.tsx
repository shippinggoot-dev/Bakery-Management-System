"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import type { Session } from "@supabase/supabase-js";
import { createClientSupabase } from "@/lib/supabase/client";

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

function UserIdentifier() {
  useEffect(() => {
    const supabase = createClientSupabase();

    const apply = (session: Session | null) => {
      if (!session?.user) {
        // No user (or just signed out) — clear PostHog's per-user state so
        // the next visitor on this browser doesn't get attributed to them.
        posthog.reset();
        return;
      }
      posthog.identify(session.user.id, {
        email: session.user.email ?? null,
        is_anonymous: session.user.is_anonymous ?? false,
        created_at: session.user.created_at,
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => apply(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => apply(session));
    return () => subscription.unsubscribe();
  }, []);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <UserIdentifier />
      {children}
    </Provider>
  );
}
