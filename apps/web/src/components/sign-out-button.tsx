"use client";

import { useRouter } from "next/navigation";
import { createClientSupabase } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-800 hover:text-gray-300 border border-transparent transition-colors"
    >
      <span className="text-base leading-none">→</span>
      Sign out
    </button>
  );
}
