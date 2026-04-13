"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";

const links = [
  { href: "/",                label: "Orders"         },
  { href: "/recipes",         label: "Recipes"        },
  { href: "/suppliers",       label: "Suppliers"      },
  { href: "/shopping-lists",  label: "Shopping list"  },
  { href: "/todos",           label: "To-Do"          },
  { href: "/ingredients",     label: "Cost calculator"},
];

export function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
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
    { select: (orders) => orders.filter((o) => o.status !== "received" && o.status !== "cancelled").length }
  );

  async function handleSignOut() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.refresh();
  }

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-rose-50 border-b border-rose-100">
      {/* Row 1 — hamburger + order count */}
      <div className="flex items-center justify-between px-4 sm:px-8 h-9">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 text-brand-600 hover:text-brand-800 transition-colors md:hidden"
          aria-label="Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex-1 text-center text-xs text-brand-500 font-medium tracking-wide">
          {orderCount > 0 ? `${orderCount} order${orderCount !== 1 ? "s" : ""} this week` : ""}
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn && !isAnonymous ? (
            <>
              <Link
                href="/settings"
                className="text-xs text-brand-500 hover:text-brand-700 transition-colors hidden sm:block"
              >
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs text-brand-400 hover:text-brand-600 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors">
              {isAnonymous ? "Create account" : "Log in"}
            </Link>
          )}
        </div>
      </div>

      {/* Row 2 — logo */}
      <div className="text-center py-0.5">
        <Link href="/" className="font-script text-4xl text-brand-700 leading-none tracking-wide hover:text-brand-900 transition-colors">
          Sucré
        </Link>
      </div>

      {/* Row 3 — nav links (desktop) */}
      <nav className="hidden md:flex items-center justify-center gap-0 h-9 border-t border-rose-100">
        {links.map(({ href, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-5 h-full flex items-center text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? "text-brand-700 border-brand-500"
                  : "text-brand-400 border-transparent hover:text-brand-600 hover:border-brand-300"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav className="md:hidden border-t border-rose-100 bg-rose-50 divide-y divide-rose-100">
          {links.map(({ href, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`block px-6 py-3 text-sm font-medium ${
                  isActive ? "text-brand-700 bg-rose-100" : "text-brand-500 hover:bg-rose-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {isLoggedIn && !isAnonymous && (
            <Link href="/settings" className="block px-6 py-3 text-sm text-brand-500 hover:bg-rose-100">
              Settings
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
