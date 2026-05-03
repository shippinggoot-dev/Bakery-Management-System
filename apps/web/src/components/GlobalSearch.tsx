"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const SEARCH_ITEMS = [
  { label: "Dashboard",             href: "/",                      icon: "🏠" },
  { label: "Purchase Orders",       href: "/purchase-orders",       icon: "📋" },
  { label: "Shopping Lists",        href: "/shopping-lists",        icon: "🛍️" },
  { label: "Ingredients",           href: "/ingredients",           icon: "💰" },
  { label: "Customer Orders",       href: "/planner",               icon: "🎂" },
  { label: "Recipes",               href: "/recipes",               icon: "📖" },
  { label: "Nutrition Labels",      href: "/nutrients",             icon: "🏷️" },
  { label: "Inventory",             href: "/inventory",             icon: "📊" },
  { label: "Suppliers",             href: "/suppliers",             icon: "🤝" },
  { label: "Price Sync",            href: "/price-ingestion",       icon: "💹" },
  { label: "Price Alerts",          href: "/price-alerts",          icon: "🔔" },
  { label: "Customers",             href: "/customers",             icon: "👥" },
  { label: "Customer Segments",     href: "/customers/segments",    icon: "🎯" },
  { label: "Loyalty Tiers",         href: "/customers/tiers",       icon: "🥇" },
  { label: "Tasks",                 href: "/todos",                 icon: "✅" },
  { label: "Settings",              href: "/settings",              icon: "⚙️" },
  { label: "Receive Delivery",      href: "/inventory/receive",     icon: "📥" },
  { label: "Log Waste",             href: "/inventory/waste",       icon: "🗑️" },
  { label: "New Recipe",            href: "/recipes/new",           icon: "✏️" },
  { label: "Register Customer",     href: "/customers/register",    icon: "➕" },
  { label: "POS Lookup",            href: "/customers/lookup",      icon: "🔍" },
  { label: "Production Schedule",   href: "/production",            icon: "🗓️" },
  { label: "Sales Dashboard",       href: "/sales",                 icon: "💰" },
];

// Trigger button shown in the nav bar
export function GlobalSearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-100/60 border border-rose-200 text-brand-400 text-xs hover:bg-rose-100 hover:text-brand-600 transition-colors"
      title="Search (Ctrl+K)"
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span>Search</span>
      <kbd className="text-[9px] border border-rose-200 rounded px-1 font-mono text-brand-300">⌘K</kbd>
    </button>
  );
}

export function GlobalSearch() {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  const filtered = query.trim()
    ? SEARCH_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : SEARCH_ITEMS;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  // Expose open() so the nav trigger can call it
  useEffect(() => {
    (window as typeof window & { __openGlobalSearch?: () => void }).__openGlobalSearch = () => setOpen(true);
    return () => { delete (window as typeof window & { __openGlobalSearch?: () => void }).__openGlobalSearch; };
  }, []);

  // Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [close]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  // Reset cursor on query change
  useEffect(() => { setCursor(0); }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { setCursor((c) => Math.min(c + 1, filtered.length - 1)); e.preventDefault(); }
    if (e.key === "ArrowUp")   { setCursor((c) => Math.max(c - 1, 0)); e.preventDefault(); }
    if (e.key === "Enter" && filtered[cursor]) {
      router.push(filtered[cursor].href);
      close();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4 bg-black/20 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-rose-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-rose-100">
          <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages…"
            className="flex-1 text-sm text-gray-800 placeholder-brand-300 focus:outline-none bg-transparent"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-center text-gray-400">No pages match &ldquo;{query}&rdquo;</p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); close(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === cursor
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-700 hover:bg-rose-50 hover:text-brand-700"
                }`}
              >
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-rose-100 px-4 py-2 flex gap-4 text-[10px] text-gray-400">
          <span><kbd className="font-mono border border-gray-200 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono border border-gray-200 rounded px-1">↵</kbd> open</span>
          <span><kbd className="font-mono border border-gray-200 rounded px-1">Ctrl K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
