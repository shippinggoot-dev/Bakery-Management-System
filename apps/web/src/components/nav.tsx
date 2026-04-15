"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization, THEMES, type ThemeId } from "@/components/ThemeProvider";

// ── Menu structure ────────────────────────────────────────────────────────────

const MENU_GROUPS = [
  {
    label: "Orders",
    items: [
      { href: "/planner",         label: "Cake Planner"     },
      { href: "/purchase-orders", label: "Purchase Orders"  },
      { href: "/shopping-lists",  label: "Shopping Lists"   },
      { href: "/ingredients",     label: "Cost Calculator"  },
    ],
  },
  {
    label: "Kitchen",
    items: [
      { href: "/recipes",   label: "Recipes"          },
      { href: "/nutrients", label: "Nutrition Labels"  },
      { href: "/library",   label: "My Library"       },
    ],
  },
  {
    label: "Stock",
    items: [
      { href: "/inventory",       label: "Inventory"      },
      { href: "/suppliers",       label: "Suppliers"      },
      { href: "/price-ingestion", label: "Price Updates"  },
      { href: "/price-alerts",    label: "Price Alerts"   },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/customers",          label: "Customer List" },
      { href: "/customers/segments", label: "Segments"      },
      { href: "/customers/tiers",    label: "Tiers"         },
    ],
  },
];

function isItemActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function isGroupActive(group: typeof MENU_GROUPS[number], pathname: string) {
  return group.items.some((item) => isItemActive(item.href, pathname));
}

// ── Personalisation panel ─────────────────────────────────────────────────────

function PersonalisePanel({ onClose, isLoggedIn, isAnonymous }: {
  onClose: () => void; isLoggedIn: boolean; isAnonymous: boolean;
}) {
  const { theme, setTheme, bakeryName, setBakeryName, logoUrl, setLogoUrl } = usePersonalization();
  const [nameInput, setNameInput] = useState(bakeryName);
  const ref = useRef<HTMLDivElement>(null);

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
                  >✕</button>
                </div>
              ) : (
                <div className="h-14 w-14 rounded-xl border-2 border-dashed border-rose-200 flex items-center justify-center text-brand-300 text-xl">🏪</div>
              )}
              <div className="flex-1">
                <label className="cursor-pointer block w-full text-center py-2 px-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 text-xs font-semibold hover:bg-brand-100 transition-colors">
                  {logoUrl ? "Change logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <p className="text-[10px] text-gray-400 mt-1 text-center">PNG, JPG, SVG</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="form-label">Bakery name</p>
          <div className="flex gap-2">
            <input
              className="form-input flex-1 text-sm"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="My Bakery"
              maxLength={40}
              onKeyDown={(e) => { if (e.key === "Enter") { setBakeryName(nameInput.trim() || "My Bakery"); onClose(); } }}
            />
            <button
              onClick={() => { setBakeryName(nameInput.trim() || "My Bakery"); onClose(); }}
              className="px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>

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

// ── Todo sidebar ──────────────────────────────────────────────────────────────

function TodoSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [newTitle, setNewTitle] = useState("");
  const { data: todos = [], refetch } = api.todos.list.useQuery();
  const create = api.todos.create.useMutation({ onSuccess: () => { setNewTitle(""); refetch(); } });
  const toggle = api.todos.toggle.useMutation({ onSuccess: () => refetch() });

  const active = todos.filter((t) => !t.completed);

  function today() { return new Date().toISOString().slice(0, 10); }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:bg-transparent"
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-[88px] right-0 h-[calc(100vh-88px)] w-80 bg-white border-l border-rose-100 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm">Tasks</p>
            {active.length > 0 && (
              <span className="text-[10px] font-bold bg-brand-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                {active.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Quick add */}
        <div className="flex gap-2 px-3 py-2.5 border-b border-rose-100 flex-shrink-0">
          <input
            className="flex-1 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 text-gray-800 placeholder-brand-300 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            placeholder="Add a task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                create.mutate({ title: newTitle.trim() });
              }
            }}
          />
          <button
            onClick={() => { if (newTitle.trim()) create.mutate({ title: newTitle.trim() }); }}
            disabled={!newTitle.trim() || create.isPending}
            className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
          >
            +
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto divide-y divide-rose-50">
          {active.length === 0 ? (
            <p className="px-4 py-8 text-sm text-brand-300 text-center">All done — no open tasks!</p>
          ) : (
            active.map((t) => (
              <label key={t.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-rose-50 transition-colors">
                <input
                  type="checkbox"
                  checked={t.completed}
                  onChange={() => toggle.mutate({ id: t.id })}
                  className="w-4 h-4 rounded border-2 border-brand-300 accent-brand-600 flex-shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{t.title}</p>
                  {t.dueDate && (
                    <p className={`text-xs mt-0.5 ${t.dueDate < today() ? "text-red-400" : "text-gray-400"}`}>
                      {t.dueDate < today() ? "Overdue · " : ""}{t.dueDate}
                    </p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-rose-100 px-4 py-3">
          <Link
            href="/todos"
            onClick={onClose}
            className="block text-center text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors"
          >
            See all tasks →
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { bakeryName, logoUrl } = usePersonalization();

  const [menuOpen,     setMenuOpen]     = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [todoOpen,     setTodoOpen]     = useState(false);
  const [activeGroup,  setActiveGroup]  = useState<string | null>(null);
  const [mobileGroup,  setMobileGroup]  = useState<string | null>(null);
  const [isLoggedIn,   setIsLoggedIn]   = useState(false);
  const [isAnonymous,  setIsAnonymous]  = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auth state
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

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveGroup(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close everything on route change
  useEffect(() => {
    setMenuOpen(false);
    setActiveGroup(null);
    setMobileGroup(null);
  }, [pathname]);

  // Open task count badge
  const { data: openTaskCount = 0 } = api.todos.list.useQuery(
    undefined,
    { select: (t) => t.filter((x) => !x.completed).length }
  );

  async function handleSignOut() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.refresh();
  }

  const toggleGroup = useCallback((label: string) => {
    setActiveGroup((prev) => (prev === label ? null : label));
  }, []);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 bg-rose-50 border-b border-rose-100">

        {/* ── Row 1: brand / logo / actions ─────────────────────────── */}
        <div className="flex items-center h-12 px-4 sm:px-6 gap-3">

          {/* Brand */}
          <Link href="/" className="flex-shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors whitespace-nowrap">
            {bakeryName}
          </Link>

          {/* Logo */}
          <div className="flex-1 flex justify-center">
            {logoUrl && (
              <img src={logoUrl} alt={bakeryName} className="h-8 max-w-[160px] object-contain" />
            )}
          </div>

          {/* Right actions */}
          <div className="flex-shrink-0 flex items-center gap-1.5 relative">

            {/* Tasks button */}
            <button
              onClick={() => setTodoOpen((v) => !v)}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                todoOpen ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
              }`}
              title="Tasks"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="hidden sm:inline">Tasks</span>
              {openTaskCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none ring-2 ring-rose-50">
                  {openTaskCount > 99 ? "99+" : openTaskCount}
                </span>
              )}
            </button>

            {/* Personalise */}
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className={`p-2 rounded-lg text-sm transition-colors ${
                panelOpen ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
              }`}
              title="Personalise"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>

            {panelOpen && <PersonalisePanel onClose={() => setPanelOpen(false)} isLoggedIn={isLoggedIn} isAnonymous={isAnonymous} />}

            {/* Settings icon */}
            {isLoggedIn && !isAnonymous && (
              <Link
                href="/settings"
                className={`hidden sm:flex p-2 rounded-lg transition-colors ${
                  pathname.startsWith("/settings")
                    ? "bg-brand-600 text-white"
                    : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
                }`}
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            )}

            {/* Auth */}
            {isLoggedIn && !isAnonymous ? (
              <button
                onClick={handleSignOut}
                className="hidden sm:block text-xs text-brand-400 hover:text-brand-600 transition-colors px-2 py-1.5"
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

        {/* ── Row 2: grouped nav (desktop) ──────────────────────────── */}
        <nav ref={dropdownRef} className="hidden md:flex items-center justify-center h-10 border-t border-rose-100 px-4 gap-1">

          {/* Home */}
          <Link
            href="/"
            className={`px-3 h-full flex items-center text-sm font-medium transition-colors border-b-2 ${
              pathname === "/"
                ? "text-brand-700 border-brand-600"
                : "text-brand-400 border-transparent hover:text-brand-600 hover:border-brand-300"
            }`}
          >
            Home
          </Link>

          {/* Groups */}
          {MENU_GROUPS.map((group) => {
            const groupActive = isGroupActive(group, pathname);
            const isOpen = activeGroup === group.label;

            return (
              <div key={group.label} className="relative h-full flex items-center">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`px-3 h-full flex items-center gap-1 text-sm font-medium transition-colors border-b-2 select-none ${
                    groupActive
                      ? "text-brand-700 border-brand-600"
                      : "text-brand-400 border-transparent hover:text-brand-600 hover:border-brand-300"
                  }`}
                >
                  {group.label}
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="absolute top-full left-0 mt-0 w-48 bg-white rounded-xl shadow-lg border border-rose-100 py-1.5 z-50 overflow-hidden">
                    {group.items.map((item) => {
                      const active = isItemActive(item.href, pathname);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center px-4 py-2 text-sm transition-colors ${
                            active
                              ? "bg-brand-50 text-brand-700 font-medium"
                              : "text-gray-600 hover:bg-rose-50 hover:text-brand-700"
                          }`}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-brand-600 mr-2 flex-shrink-0" />}
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Mobile menu ───────────────────────────────────────────── */}
        {menuOpen && (
          <div className="md:hidden border-t border-rose-100 bg-rose-50 py-2 px-3 flex flex-col gap-1 max-h-[75vh] overflow-y-auto">

            <Link
              href="/"
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/" ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100"
              }`}
            >
              Home
            </Link>

            {MENU_GROUPS.map((group) => {
              const isExpanded = mobileGroup === group.label;
              const groupActive = isGroupActive(group, pathname);
              return (
                <div key={group.label}>
                  <button
                    onClick={() => setMobileGroup(isExpanded ? null : group.label)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      groupActive ? "text-brand-700 bg-brand-50" : "text-brand-500 hover:bg-brand-100"
                    }`}
                  >
                    {group.label}
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l-2 border-brand-100 pl-3">
                      {group.items.map((item) => {
                        const active = isItemActive(item.href, pathname);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                              active ? "bg-brand-600 text-white font-medium" : "text-brand-500 hover:bg-brand-100"
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
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

      {/* ── Todo sidebar (outside header so it renders over content) ── */}
      <TodoSidebar open={todoOpen} onClose={() => setTodoOpen(false)} />
    </>
  );
}
