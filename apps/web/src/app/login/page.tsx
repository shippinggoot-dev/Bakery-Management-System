"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClientSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("login");
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const supabase = createClientSupabase();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <p className="font-script text-5xl text-brand-700 leading-none">Sucré</p>
          <p className="text-brand-400 mt-2 text-sm">{t("title")}</p>
        </div>

        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-8 space-y-5">

          {/* Google */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-brand-700 font-medium text-sm hover:bg-rose-100 hover:border-brand-300 transition-colors"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t("continueGoogle")}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-rose-100" />
            <span className="text-xs text-brand-300">{t("or")}</span>
            <div className="flex-1 h-px bg-rose-100" />
          </div>

          {/* Magic link */}
          {sent ? (
            <div className="text-center space-y-2 py-2">
              <p className="text-3xl">📬</p>
              <p className="font-semibold text-brand-700">{t("checkInbox")}</p>
              <p className="text-sm text-brand-400">
                {t("checkInboxDesc").replace("{email}", email)}
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-xs text-brand-300 hover:text-brand-500 mt-3 transition-colors"
              >
                {t("useDifferentEmail")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <div>
                <label className="form-label">{t("emailLabel")}</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="form-input"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full px-4 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {loading ? "…" : t("sendMagicLink")}
              </button>
              <p className="text-xs text-brand-300 text-center">
                {t("magicLinkDesc")}
              </p>
            </form>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
