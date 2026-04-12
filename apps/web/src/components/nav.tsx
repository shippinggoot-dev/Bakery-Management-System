"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { MenuIcon, XIcon } from "@/components/icons";
import { createClientSupabase } from "@/lib/supabase/client";

const links = [
  { href: "/",                label: "Dashboard",       icon: "🏠" },
  { href: "/recipes",         label: "Recipes",         icon: "📖" },
  { href: "/ingredients",     label: "Ingredients",     icon: "🧂" },
  { href: "/suppliers",       label: "Suppliers",       icon: "🚚" },
  { href: "/shopping-lists",  label: "Shopping Lists",  icon: "🛒" },
  { href: "/purchase-orders", label: "Orders", icon: "📦" },
  { href: "/price-alerts",    label: "Price Alerts",    icon: "🔔" },
];

export function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]           = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Detect auth state client-side to avoid SSR issues
  useEffect(() => {
    const supabase = createClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { data: alertCount = 0 } = api.priceSync.getAlertCount.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  async function handleSignOut() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.refresh();
  }

  // Close sidebar when route changes (user tapped a link on mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-brand-500 uppercase tracking-widest mb-0.5">Bakery</p>
          <h1 className="text-xl font-bold text-gray-100 leading-tight">Management</h1>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          aria-label="Close menu"
        >
          <XIcon />
        </button>
      </div>

      {/* Links */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        {links.map(({ href, label, icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isAlerts = href === "/price-alerts";

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                  : "text-gray-500 hover:bg-gray-800 hover:text-gray-200 border border-transparent"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="flex-1">{label}</span>
              {isAlerts && alertCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-1">
        {isLoggedIn ? (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-800 hover:text-gray-300 border border-transparent transition-colors"
          >
            <span className="text-base leading-none">→</span>
            Sign out
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-800 hover:text-gray-200 border border-transparent transition-colors"
          >
            <span className="text-base leading-none">→</span>
            Log in
          </Link>
        )}
        <p className="text-xs text-gray-700 px-4">Supabase · PostgreSQL</p>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile top bar (hidden on lg+) ─────────────────────────── */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-40 h-14 bg-gray-900 border-b border-gray-800 flex items-center gap-4 px-4">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
        <div className="flex-1">
          <span className="text-xs font-semibold text-brand-500 uppercase tracking-widest mr-2">Bakery</span>
          <span className="text-sm font-bold text-gray-100">Management</span>
        </div>
        {!isLoggedIn && (
          <Link
            href="/login"
            className="px-3 py-1.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-xs font-medium transition-colors"
          >
            Log in
          </Link>
        )}
      </header>

      {/* ── Dark backdrop (mobile only, shown when sidebar is open) ─── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-20 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      {/* On mobile: absolutely positioned overlay, slides in from left */}
      {/* On desktop: always visible fixed sidebar                      */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-60
          bg-gray-900 border-r border-gray-800
          flex flex-col
          transition-transform duration-200 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
