"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClientSupabase } from "@/lib/supabase/client";

export function DemoBanner() {
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [dismissed, setDismissed]     = useState(false);

  useEffect(() => {
    const supabase = createClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAnonymous(session?.user?.is_anonymous ?? false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAnonymous(session?.user?.is_anonymous ?? false);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!isAnonymous || dismissed) return null;

  return (
    <div className="bg-brand-500/10 border-b border-brand-500/20 px-4 py-2.5 flex items-center gap-3 text-sm">
      <span className="text-brand-400 shrink-0">🧪</span>
      <p className="flex-1 text-brand-300/80 min-w-0">
        <span className="font-semibold text-brand-300">Demo mode</span>
        {" — "}everything you create here is yours alone and will be cleared after 7 days.
        {" "}
        <Link href="/login" className="underline underline-offset-2 hover:text-brand-200 transition-colors">
          Create a free account
        </Link>
        {" "}to save your data permanently.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-brand-500 hover:text-brand-300 text-lg leading-none transition-colors"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
