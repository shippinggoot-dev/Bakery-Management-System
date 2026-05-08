"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization, THEMES, type ThemeId } from "@/components/ThemeProvider";
import { GlobalSearchTrigger } from "@/components/GlobalSearch";

// ── Nav data ──────────────────────────────────────────────────────────────────

type NavItem    = { href: string; label: string };
type NavSection = {
  key:      string;
  label:    string;
  href:     string;        // landing page when clicking the section pill
  items:    NavItem[];     // sub-pages (empty for Home)
  prefixes: string[];      // pathname prefixes that count as "this section is active"
};

function useNavSections(): NavSection[] {
  const t = useTranslations("nav");
  return [
    {
      key: "home",
      label: t("home"),
      href: "/",
      items: [],
      prefixes: ["/"],
    },
    {
      key: "kitchen",
      label: t("kitchen"),
      href: "/recipes",
      items: [
        { href: "/recipes",       label: t("recipes") },
        { href: "/premade-cakes", label: t("premadeCakes") },
        { href: "/nutrients",     label: t("nutritionLabels") },
      ],
      prefixes: ["/recipes", "/premade-cakes", "/nutrients"],
    },
    {
      key: "stock",
      label: t("stock"),
      href: "/ingredients",
      items: [
        { href: "/ingredients", label: t("costCalculator") },
        { href: "/inventory",   label: t("inventory") },
        { href: "/suppliers",   label: t("suppliers") },
      ],
      prefixes: ["/ingredients", "/inventory", "/suppliers"],
    },
    {
      key: "purchasing",
      label: t("purchasing"),
      href: "/purchase-orders",
      items: [
        { href: "/purchase-orders", label: t("purchaseOrders") },
        { href: "/shopping-lists",  label: t("shoppingLists") },
        { href: "/price-ingestion", label: t("priceUpdates") },
        { href: "/price-alerts",    label: t("priceAlerts") },
      ],
      prefixes: ["/purchase-orders", "/shopping-lists", "/price-ingestion", "/price-alerts"],
    },
    {
      key: "customers",
      label: t("customers"),
      href: "/planner",
      items: [
        { href: "/planner",   label: t("customerOrders") },
        { href: "/customers", label: t("customerList") },
      ],
      prefixes: ["/planner", "/customers"],
    },
    {
      key: "operations",
      label: t("operations"),
      href: "/production",
      items: [
        { href: "/production", label: t("production") },
        { href: "/sales",      label: t("sales") },
        { href: "/social",     label: t("social") },
      ],
      prefixes: ["/production", "/sales", "/social"],
    },
  ];
}

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function isSectionActive(section: NavSection, pathname: string): boolean {
  return section.prefixes.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

// ── Language switcher ─────────────────────────────────────────────────────────

function LanguageSwitcher() {
  const locale = useLocale();
  const t      = useTranslations("nav");

  function switchLocale() {
    const next = locale === "en" ? "nb" : "en";
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <button
      onClick={switchLocale}
      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-500 hover:bg-brand-100 hover:text-brand-700 transition-colors"
      title={t("language")}
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
      <span>{locale === "en" ? "NO" : "EN"}</span>
    </button>
  );
}

// ── Dark mode toggle ──────────────────────────────────────────────────────────

function DarkModeToggle({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("nav");
  const { dark, setDark } = usePersonalization();
  const label = dark ? t("lightMode") : t("darkMode");

  return (
    <button
      onClick={() => setDark(!dark)}
      aria-label={label}
      title={label}
      className={`${compact ? "p-2" : "p-1.5"} rounded-lg text-brand-500 hover:bg-brand-100 hover:text-brand-700 transition-colors`}
    >
      {dark ? (
        // Sun (we're in dark — clicking switches to light)
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
        </svg>
      ) : (
        // Moon (we're in light — clicking switches to dark)
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
        </svg>
      )}
    </button>
  );
}

// ── Personalisation panel ─────────────────────────────────────────────────────

function PersonalisePanel({ onClose, isLoggedIn, isAnonymous, positionClass = "absolute right-0 top-full mt-2" }: {
  onClose: () => void;
  isLoggedIn: boolean;
  isAnonymous: boolean;
  positionClass?: string;
}) {
  const t  = useTranslations("nav");
  const tc = useTranslations("common");
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
      className={`${positionClass} w-72 bg-white rounded-2xl border border-rose-100 shadow-xl z-50 overflow-hidden`}
    >
      <div className="px-4 py-3 border-b border-rose-100 flex items-center justify-between">
        <p className="font-semibold text-gray-900 text-sm">{t("personalise")}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
      </div>

      <div className="px-4 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
        {isLoggedIn && !isAnonymous && (
          <div>
            <p className="form-label">{t("bakeryLogo")}</p>
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
                  {logoUrl ? t("changeLogo") : t("uploadLogo")}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <p className="text-[10px] text-gray-400 mt-1 text-center">{t("logoHint")}</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="form-label">{t("bakeryName")}</p>
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
              {tc("save")}
            </button>
          </div>
        </div>

        <div>
          <p className="form-label">{t("colourScheme")}</p>
          <div className="flex flex-wrap gap-2">
            {allThemeIds.map((tid) => {
              const thm    = THEMES[tid];
              const active = theme === tid;
              return (
                <button
                  key={tid}
                  onClick={() => setTheme(tid)}
                  title={thm.desc}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 transition-all text-left ${
                    active ? "border-brand-600 bg-brand-50" : "border-rose-100 bg-white hover:border-brand-300"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex-shrink-0 border border-black/10"
                    style={{ background: `linear-gradient(135deg, ${thm.bg} 40%, ${thm.accent} 100%)` }}
                  />
                  <span className="text-xs font-medium text-gray-800">{thm.label}</span>
                  {active && <span className="text-brand-600 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isLoggedIn && !isAnonymous && (
        <div className="border-t border-rose-100 px-4 py-3 bg-rose-50/40">
          <Link
            href="/settings"
            prefetch={false}
            onClick={onClose}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-rose-100 text-sm font-semibold text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t("openFullSettings")}
            </span>
            <span className="text-brand-400">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Todo sidebar ──────────────────────────────────────────────────────────────

function TodoSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("nav");
  const [newTitle, setNewTitle] = useState("");
  const { data: todos = [], refetch } = api.todos.list.useQuery();
  const create = api.todos.create.useMutation({ onSuccess: () => { setNewTitle(""); refetch(); } });
  const toggle = api.todos.toggle.useMutation({ onSuccess: () => refetch() });

  const active = todos.filter((td) => !td.completed);

  function today() { return new Date().toISOString().slice(0, 10); }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/20 z-40 md:bg-transparent" onClick={onClose} />
      )}

      <div
        className={`fixed top-12 md:top-0 right-0 h-[calc(100vh-48px)] md:h-screen w-80 bg-white border-l border-rose-100 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm">{t("tasks")}</p>
            {active.length > 0 && (
              <span className="text-[10px] font-bold bg-brand-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                {active.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="flex gap-2 px-3 py-2.5 border-b border-rose-100 flex-shrink-0">
          <input
            className="flex-1 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 text-gray-800 placeholder-brand-300 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            placeholder={t("addTask")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) create.mutate({ title: newTitle.trim() });
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

        <div className="flex-1 overflow-y-auto divide-y divide-rose-50">
          {active.length === 0 ? (
            <p className="px-4 py-8 text-sm text-brand-300 text-center">{t("allDone")}</p>
          ) : (
            active.map((td) => (
              <label key={td.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-rose-50 transition-colors">
                <input
                  type="checkbox"
                  checked={td.completed}
                  onChange={() => toggle.mutate({ id: td.id })}
                  className="w-4 h-4 rounded border-2 border-brand-300 accent-brand-600 flex-shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{td.title}</p>
                  {td.dueDate && (
                    <p className={`text-xs mt-0.5 ${td.dueDate < today() ? "text-red-400" : "text-gray-400"}`}>
                      {td.dueDate < today() ? "Overdue · " : ""}{td.dueDate}
                    </p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        <div className="flex-shrink-0 border-t border-rose-100 px-4 py-3">
          <Link
            href="/todos"
            onClick={onClose}
            prefetch={false}
            className="block text-center text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors"
          >
            {t("seeAllTasks")}
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Section pill (top-row) ────────────────────────────────────────────────────

function SectionPill({ section, pathname }: { section: NavSection; pathname: string }) {
  const active = isSectionActive(section, pathname);
  return (
    <div className="relative group">
      <Link
        href={section.href}
        prefetch={false}
        className={`relative inline-flex items-center px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "text-brand-700" : "text-gray-600 hover:text-brand-600"
        }`}
      >
        {section.label}
        {active && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1/2 h-[2px] bg-brand-600 rounded-full" />
        )}
      </Link>

      {/* Hover preview — small dropdown listing the section's sub-pages */}
      {section.items.length > 0 && (
        <div className="hidden group-hover:block absolute left-1/2 top-full -translate-x-1/2 z-50 pt-2">
          <div className="min-w-[180px] bg-white rounded-xl border border-rose-100 shadow-lg py-1.5">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="block px-4 py-1.5 text-sm text-gray-700 hover:bg-rose-50 hover:text-brand-700 transition-colors whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-nav link (second row) ─────────────────────────────────────────────────

function SubNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`relative px-3 py-1 text-sm transition-colors ${
        active ? "text-brand-700 font-medium" : "text-gray-500 hover:text-brand-600"
      }`}
    >
      {item.label}
      {active && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1/2 h-[2px] bg-brand-500 rounded-full" />
      )}
    </Link>
  );
}

// ── Bottom tab bar (mobile only) ──────────────────────────────────────────────

const MOBILE_TABS = [
  { labelKey: "home",       icon: "🏠", href: "/",          prefixes: ["/", "/planner", "/todos"] },
  { labelKey: "kitchen",    icon: "🍳", href: "/recipes",   prefixes: ["/recipes", "/nutrients", "/ingredients", "/premade-cakes"] },
  { labelKey: "stock",      icon: "📦", href: "/inventory", prefixes: ["/inventory", "/suppliers", "/price-ingestion", "/price-alerts", "/purchase-orders", "/shopping-lists"] },
  { labelKey: "customers",  icon: "👥", href: "/customers", prefixes: ["/customers"] },
  { labelKey: "operations", icon: "🏭", href: "/production",prefixes: ["/production", "/sales", "/social"] },
] as const;

function BottomTabBar() {
  const pathname = usePathname();
  const t        = useTranslations("nav");

  function isTabActive(prefixes: readonly string[]) {
    return prefixes.some((p) => p === "/" ? pathname === "/" : pathname.startsWith(p));
  }

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-rose-50 border-t border-rose-100 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {MOBILE_TABS.map((tab) => {
        const active = isTabActive(tab.prefixes);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors min-h-[56px] ${
              active ? "text-brand-700" : "text-brand-400 hover:text-brand-600"
            }`}
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-brand-600" />
            )}
            <span className={`text-xl leading-none transition-transform ${active ? "scale-110" : ""}`}>
              {tab.icon}
            </span>
            <span>{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export function Nav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const t         = useTranslations("nav");
  const { bakeryName, logoUrl } = usePersonalization();

  const [panelOpen,   setPanelOpen]   = useState(false);
  const [todoOpen,    setTodoOpen]    = useState(false);
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

  const { data: openTaskCount = 0 } = api.todos.list.useQuery(
    undefined,
    { select: (td) => td.filter((x) => !x.completed).length }
  );

  const sections      = useNavSections();
  const activeSection = sections.find((s) => isSectionActive(s, pathname));
  const showSubNav    = !!activeSection && activeSection.items.length > 0;

  async function handleSignOut() {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    router.refresh();
  }

  function openSearch() {
    (window as typeof window & { __openGlobalSearch?: () => void }).__openGlobalSearch?.();
  }

  return (
    <>
      {/* ── Desktop top header ──────────────────────────────────────────── */}
      <header className="hidden md:block fixed top-0 inset-x-0 z-30 bg-rose-50 border-b border-rose-100">

        {/* Row 1 — search · brand · controls. 3 equal columns guarantee the brand is at viewport-center. */}
        <div className="grid grid-cols-3 items-center px-6 pt-2 pb-1.5 gap-4">
          <div className="justify-self-start">
            <GlobalSearchTrigger onClick={openSearch} />
          </div>

          <Link
            href="/"
            className="justify-self-center flex items-center gap-2 text-base font-bold text-brand-700 hover:text-brand-900 transition-colors"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-8 w-8 rounded-lg object-contain flex-shrink-0" />
            ) : (
              <span className="text-xl flex-shrink-0 leading-none">🏪</span>
            )}
            <span>Bakery Management System</span>
          </Link>

          <div className="justify-self-end flex items-center gap-1">
            <LanguageSwitcher />
            <DarkModeToggle />

            {/* Personalise */}
            <div className="relative">
              <button
                onClick={() => setPanelOpen((v) => !v)}
                className={`p-1.5 rounded-lg text-sm transition-colors ${
                  panelOpen ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
                }`}
                title={t("personalise")}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
                </svg>
              </button>
              {panelOpen && (
                <PersonalisePanel
                  onClose={() => setPanelOpen(false)}
                  isLoggedIn={isLoggedIn}
                  isAnonymous={isAnonymous}
                  positionClass="absolute right-0 top-full mt-1"
                />
              )}
            </div>

            {/* Tasks */}
            <button
              onClick={() => setTodoOpen((v) => !v)}
              className={`relative p-1.5 rounded-lg transition-colors ${
                todoOpen ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100 hover:text-brand-700"
              }`}
              title={t("tasks")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {openTaskCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none ring-2 ring-rose-50">
                  {openTaskCount > 99 ? "99+" : openTaskCount}
                </span>
              )}
            </button>

            {/* Auth */}
            {isLoggedIn && !isAnonymous ? (
              <button
                onClick={handleSignOut}
                className="text-xs text-brand-400 hover:text-brand-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-rose-100"
              >
                {t("signOut")}
              </button>
            ) : (
              <Link
                href="/login"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
              >
                {isAnonymous ? t("createAccount") : t("logIn")}
              </Link>
            )}
          </div>
        </div>

        {/* Row 2 — section pills, centered */}
        <nav className="flex justify-center items-center gap-1 px-4 pb-2">
          {sections.map((section) => (
            <SectionPill key={section.key} section={section} pathname={pathname} />
          ))}
        </nav>

        {/* Row 3 — sub-nav. Only renders when active section has sub-pages. */}
        {showSubNav && (
          <div className="border-t border-rose-100/60 flex items-center justify-center">
            <nav className="flex items-center gap-3 px-4 py-1.5">
              {activeSection!.items.map((item) => (
                <SubNavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Spacer to push page content below the fixed desktop header.
          Two heights — one for when the sub-nav row is visible, one for when it isn't. */}
      <div className={`hidden md:block ${showSubNav ? "h-[124px]" : "h-[88px]"}`} />

      {/* ── Mobile top bar ────────────────────────────────────────────────── */}
      <header className="md:hidden fixed inset-x-0 top-0 z-40 bg-rose-50 border-b border-rose-100 h-12 flex items-center px-4 gap-3">
        <Link href="/" className="flex items-center gap-2 flex-1 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt={bakeryName} className="h-7 max-w-[120px] object-contain" />
          ) : (
            <span className="font-semibold text-brand-700 text-sm truncate">{bakeryName}</span>
          )}
        </Link>
        <div className="flex items-center gap-1 flex-shrink-0">
          <GlobalSearchTrigger onClick={openSearch} />
          <DarkModeToggle compact />
          <button
            onClick={() => setTodoOpen((v) => !v)}
            className={`relative p-2 rounded-lg transition-colors ${
              todoOpen ? "bg-brand-600 text-white" : "text-brand-500 hover:bg-brand-100"
            }`}
            title={t("tasks")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            {openTaskCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none ring-2 ring-rose-50">
                {openTaskCount > 99 ? "99+" : openTaskCount}
              </span>
            )}
          </button>
          {isLoggedIn && !isAnonymous ? (
            <button
              onClick={handleSignOut}
              className="text-xs text-brand-400 hover:text-brand-600 transition-colors px-1.5 py-1"
            >
              {t("signOut")}
            </button>
          ) : (
            <Link
              href="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              {isAnonymous ? t("createAccount") : t("logIn")}
            </Link>
          )}
        </div>
      </header>

      <TodoSidebar open={todoOpen} onClose={() => setTodoOpen(false)} />
      <BottomTabBar />
    </>
  );
}
