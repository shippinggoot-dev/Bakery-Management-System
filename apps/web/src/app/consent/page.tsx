"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClientSupabase } from "@/lib/supabase/client";

export default function ConsentPage() {
  const t = useTranslations("consent");
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
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-gray-500 mt-2 text-sm">{t("intro")}</p>
        </div>

        {/* Consent card */}
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm divide-y divide-rose-50">

          {/* Data usage */}
          <div className="px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">{t("dataStorageTitle")}</p>
            <p className="text-sm text-gray-500">{t("dataStorageText")}</p>
          </div>

          {/* Personal data */}
          <div className="px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">{t("personalDataTitle")}</p>
            <p className="text-sm text-gray-500">{t("personalDataText")}</p>
          </div>

          {/* Cookies */}
          <div className="px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">{t("cookiesTitle")}</p>
            <p className="text-sm text-gray-500">{t("cookiesText")}</p>
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
              <span className="text-sm text-gray-700">{t("checkboxLabel")}</span>
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
            {loading ? "…" : t("acceptBtn")}
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 py-3 rounded-xl border border-rose-200 text-gray-500 font-medium text-sm hover:bg-rose-50 transition-colors"
          >
            {t("declineBtn")}
          </button>
        </div>

        <p className="text-xs text-center text-gray-400">{t("footer")}</p>
      </div>
    </div>
  );
}
