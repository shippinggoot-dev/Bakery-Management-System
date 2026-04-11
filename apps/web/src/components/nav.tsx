"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";

const links = [
  { href: "/",                label: "Dashboard",       icon: "🏠" },
  { href: "/recipes",         label: "Recipes",         icon: "📖" },
  { href: "/ingredients",     label: "Ingredients",     icon: "🧂" },
  { href: "/suppliers",       label: "Suppliers",       icon: "🚚" },
  { href: "/shopping-lists",  label: "Shopping Lists",  icon: "🛒" },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "📦" },
  { href: "/price-alerts",    label: "Price Alerts",    icon: "🔔" },
];

export function Nav() {
  const pathname = usePathname();
  const { data: alertCount = 0 } = api.priceSync.getAlertCount.useQuery(
    undefined,
    { refetchInterval: 60_000 } // re-check every minute
  );

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-gray-900 border-r border-gray-800 flex flex-col z-10">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gray-800">
        <p className="text-xs font-semibold text-brand-500 uppercase tracking-widest mb-0.5">Bakery</p>
        <h1 className="text-xl font-bold text-gray-100 leading-tight">Management</h1>
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
      <div className="px-6 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-700">Local database · SQLite</p>
      </div>
    </aside>
  );
}
