"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization, THEMES, type ThemeId } from "@/components/ThemeProvider";

const NAV_LINKS = [
  { href: "/",               label: "Orders"          },
  { href: "/recipes",        label: "Recipes"         },
  { href: "/suppliers",      label: "Suppliers"       },
  { href: "/shopping-lists", label: "Shopping list"   },
  { href: "/todos",          label: "To-Do"           },
  { href: "/ingredients",    label: "Cost calculator" },
];

// ── Personalisation panel (dropdown) ─────────────────────────────────────────

function PersonalisePanel({ onClose, isLoggedIn, isAnonymous }: { onClose: () => void; isLoggedIn: boolean; isAnonymous: boolean }) {
  const { theme, setTheme, bakeryName, setBakeryName, logoUrl, setLogoUrl } = usePersonalization();
  const [nameInput, setNameInput] = useState(bakeryName);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  const allThemeIds = Object.keys(THEMES) as ThemeId[];

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-rose-100 shadow-xl z-50 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-rose-100 flex items-center justify-between">
        <p className="font-semibold text-gray-900 text-sm">Personalise</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
      </div>

      <div className="px-4 py-4 space-y-5 max-h-[80vh] overflow-y-auto">

        {/* Logo — logged-in users only */}
        {isLoggedIn && !isAnonymous && (
          <div>
            <p className="form-label">Bakery logo</p>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="relative">
                  <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-xl object-contain border border-rose-100 bg-white" />
                  <button
                    onClick={() => setLogoUrl(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-100 text-red-500 text-xs flex items-center justify-center hover:bg-red-200 transition-colors"
                    title="Remove logo"
                  >✕</button>
                </div>
              ) : (
                <div className="h-14 w-14 rounded-xl border-2 border-dashed border-rose-200 flex items-center justify-center text-brand-300 text-xl">
                  🏪
                </div>
              )}
              <div className="flex-1">
                <label className="cursor-pointer block w-full text-center py-2 px-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 text-xs font-semibold hover:bg-brand-100 transition-colors">
                  {logoUrl ? "Change logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <p className="text-[10px] text-gray-400 mt-1 text-center">PNG, JPG, SVG · shown centre-top</p>
              </div>
            </div>
          </div>
        )}

        {/* Bakery name */}
        <div>
          <p className="form-label">Bakery name</p>
          <div className="flex gap-2">
            <input
              className="form-input flex-1 text-sm"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="My Bakery"
              maxLength={40}
              onKeyDown={(e) => { if (e.key === "Enter") { setBakeryName(nameInput.trim() || "My Bakery"); onClose(); }}}
            />
            <button
              onClick={() => { setBakeryName(nameInput.trim() || "My Bakery"); onClose(); }}
              className="px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        {/* Colour scheme */}
        <div>
          <p className="form-label">Colour scheme</p>
          <div className="flex flex-wrap gap-2">
            {allThemeIds.map((tid) => {
              const t = THEMES[tid];
              const active = theme === tid;
              return (
                <button
                  key={tid}
                  onClick={() => setTheme(tid)}
                  title={t.desc}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 transition-all text-left ${
                    active ? "border-brand-600 bg-brand-50" : "border-rose-100 bg-white hover:border-brand-300"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex-shrink-0 border border-black/10"
                    style={{ background: `linear-gradient(135deg, ${t.bg} 40%, ${t.accent} 100%)` }}
                  />
                  <span className="text-xs font-medium text-gray-800">{t.label}</span>
                  {active && <span className="text-brand-600 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { bakeryName, logoUrl } = usePersonalization();

  const [menuOpen,      setMenuOpen]      = useState(false);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [isLoggedIn,    setIsLoggedIn]    = useState(false);
  const [isAnonymous,   setIsAnonymous]   = useState(false);

  useEffect(() => {
    const supabase = createClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setIsAnonymous(session?.user?.is_anonymous ?? false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
      setIsAnonymous(session?.user?.is_anonymous ?? false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { data: orderCount = 0 } = api.purchaseOrders.getAll.useQuery(
    { limit: 100 },
    { select: (o) => o.filter((x) => x.status !== "delivered" && x.status !== "cancelled").length }
  );

  async function handleSignOut() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.refresh();
  }

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-rose-50 border-b border-rose-100">

      {/* ── Row 1: brand / logo / actions ──────────────────────────── */}
      <div className="flex items-center h-12 px-4 sm:px-6 gap-3">

        {/* Left: bakery name (always visible) */}
        <Link href="/" className="flex-shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors whitespace-nowrap flex items-center gap-1.5">
          {bakeryName}
          {orderCount > 0 && (
            <span className="text-[10px] font-bold bg-brand-600 text-white rounded-full px-1.5 py-0.5 leading-none">
              {orderCount}
            </span>
          )}
        </Link>

        {/* Centre: logo */}
        <div className="flex-1 flex justify-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={bakeryName}
              className="h-8 max-w-[160px] object-contain"
            />
          )}
        </div>

        {/* Right: personalise + auth */}
        <div className="flex-shrink-0 flex items-center gap-1.5 relative">

          {/* Personalise button */}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={`p-2 rounded-lg text-sm transition-colors ${
              panelOpen ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
            }`}
            title="Personalise"
            aria-label="Personalise"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Personalise dropdown */}
          {panelOpen && <PersonalisePanel onClose={() => setPanelOpen(false)} isLoggedIn={isLoggedIn} isAnonymous={isAnonymous} />}

          {/* Settings (logged-in only) */}
          {isLoggedIn && !isAnonymous && (
            <Link
              href="/settings"
              className={`hidden sm:block text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                pathname.startsWith("/settings")
                  ? "bg-brand-600 text-white"
                  : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
              }`}
            >
              Settings
            </Link>
          )}

          {/* Auth */}
          {isLoggedIn && !isAnonymous ? (
            <button
              onClick={handleSignOut}
              className="text-xs text-brand-400 hover:text-brand-600 transition-colors px-2 py-1.5 hidden sm:block"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              {isAnonymous ? "Create account" : "Log in"}
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden p-1.5 rounded-lg text-brand-500 hover:bg-brand-100 transition-colors"
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Row 2: nav links (desktop) ──────────────────────────────── */}
      <nav className="hidden md:flex items-center justify-center gap-0 h-10 border-t border-rose-100 px-4">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 h-full flex items-center text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? "text-brand-700 border-brand-600"
                  : "text-brand-400 border-transparent hover:text-brand-600 hover:border-brand-300"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── Mobile menu ─────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-rose-100 bg-rose-50 py-2 px-3 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {isLoggedIn && !isAnonymous && (
            <>
              <Link href="/settings" className="px-4 py-2.5 rounded-lg text-sm text-brand-500 hover:bg-brand-100">Settings</Link>
              <button onClick={handleSignOut} className="px-4 py-2.5 rounded-lg text-sm text-brand-400 hover:bg-brand-100 text-left">Sign out</button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
