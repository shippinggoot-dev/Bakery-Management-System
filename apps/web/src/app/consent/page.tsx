"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientSupabase } from "@/lib/supabase/client";

export default function ConsentPage() {
  const router  = useRouter();
  const [agreed,   setAgreed]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleAccept() {
    if (!agreed) return;
    setLoading(true);
    setError(null);

    const supabase = createClientSupabase();
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        consent_accepted:  true,
        consent_accepted_at: new Date().toISOString(),
      },
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Refresh so middleware picks up the updated metadata
    router.refresh();
    router.push("/");
  }

  async function handleDecline() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center">
          <p className="text-3xl mb-2">📋</p>
          <h1 className="text-2xl font-bold text-gray-900">Before you continue</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Please read and accept the following to use the Bakery Management System.
          </p>
        </div>

        {/* Consent card */}
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm divide-y divide-rose-50">

          {/* Data usage */}
          <div className="px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">Data storage</p>
            <p className="text-sm text-gray-500">
              Your recipes, ingredients, orders, and shopping lists are stored securely
              in our database and are only accessible with your account. We do not share
              your data with third parties.
            </p>
          </div>

          {/* Personal data */}
          <div className="px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">Personal data</p>
            <p className="text-sm text-gray-500">
              We store your email address to identify your account. You can request
              deletion of your account and all associated data at any time by contacting
              the account owner.
            </p>
          </div>

          {/* Cookies */}
          <div className="px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">Session cookies</p>
            <p className="text-sm text-gray-500">
              We use a session cookie to keep you signed in. No tracking or advertising
              cookies are used.
            </p>
          </div>

          {/* Checkbox */}
          <div className="px-6 py-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-brand-600 flex-shrink-0"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the above. I understand how my data is stored
                and used within this system.
              </span>
            </label>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAccept}
            disabled={!agreed || loading}
            className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors disabled:opacity-40"
          >
            {loading ? "Saving…" : "Accept and continue"}
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 py-3 rounded-xl border border-rose-200 text-gray-500 font-medium text-sm hover:bg-rose-50 transition-colors"
          >
            Decline and sign out
          </button>
        </div>

        <p className="text-xs text-center text-gray-400">
          You only need to accept once. This will not be shown again.
        </p>
      </div>
    </div>
  );
}
