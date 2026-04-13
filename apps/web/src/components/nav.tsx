"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization } from "@/components/ThemeProvider";

const links = [
  { href: "/",               label: "Orders"         },
  { href: "/recipes",        label: "Recipes"        },
  { href: "/suppliers",      label: "Suppliers"      },
  { href: "/shopping-lists", label: "Shopping list"  },
  { href: "/todos",          label: "To-Do"          },
  { href: "/ingredients",    label: "Cost calculator"},
];

export function Nav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { bakeryName } = usePersonalization();
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [isLoggedIn,  setIsLoggedIn]  = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

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
    <header className="fixed inset-x-0 top-0 z-40 h-14 bg-rose-50 border-b border-rose-100 flex items-center px-4 sm:px-6 gap-4">

      {/* Brand name */}
      <Link href="/" className="flex-shrink-0 font-semibold text-brand-700 text-sm hover:text-brand-900 transition-colors whitespace-nowrap">
        {bakeryName}
        {orderCount > 0 && (
          <span className="ml-2 text-[10px] font-bold bg-brand-600 text-white rounded-full px-1.5 py-0.5 align-middle">
            {orderCount}
          </span>
        )}
      </Link>

      {/* Desktop nav links */}
      <nav className="hidden md:flex items-center gap-0 flex-1 justify-center">
        {links.map(({ href, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-600 text-white"
                  : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right side — user actions */}
      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {isLoggedIn && !isAnonymous ? (
          <>
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
            <button
              onClick={handleSignOut}
              className="text-xs text-brand-400 hover:text-brand-600 transition-colors px-2 py-1.5"
            >
              Sign out
            </button>
          </>
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
            <path strokeLinecap="round" strokeLinejoin="round" d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden absolute inset-x-0 top-14 bg-rose-50 border-b border-rose-100 py-2 px-3 flex flex-col gap-1">
          {links.map(({ href, label }) => {
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
            <Link href="/settings" className="px-4 py-2.5 rounded-lg text-sm text-brand-500 hover:bg-brand-100">
              Settings
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
