"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization, THEMES, type ThemeId } from "@/components/ThemeProvider";

// ── Shopify setup guide steps ─────────────────────────────────────────────────

const SETUP_STEPS = [
  { n: 1, text: 'In your Shopify admin, go to Settings → Apps and sales channels.' },
  { n: 2, text: 'Click "Develop apps" and enable custom app development if prompted.' },
  { n: 3, text: 'Click "Create an app" and give it a name (e.g. "Bakery Management").' },
  { n: 4, text: 'Under Configuration → Admin API access scopes, enable: read_products, write_products, read_orders, read_customers.' },
  { n: 5, text: 'Click Install app, then copy the Admin API access token shown once.' },
];

// ── Connect form ──────────────────────────────────────────────────────────────

function ConnectForm({ onSuccess }: { onSuccess: () => void }) {
  const utils = api.useUtils();
  const [domain,    setDomain]    = useState("");
  const [token,     setToken]     = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [syncProd,  setSyncProd]  = useState(true);
  const [syncOrd,   setSyncOrd]   = useState(false);

  const connect = api.shopify.connect.useMutation({
    onSuccess: () => { utils.shopify.getSettings.invalidate(); onSuccess(); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    connect.mutate({ shopDomain: domain, accessToken: token, syncProducts: syncProd, syncOrders: syncOrd });
  }

  return (
    <div className="space-y-5">
      {/* Setup guide */}
      <div className="rounded-xl bg-gray-800/60 border border-gray-700 overflow-hidden">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors"
        >
          <span>How to get your access token</span>
          <span className={`text-gray-500 transition-transform duration-200 ${showGuide ? "rotate-180" : ""}`}>▼</span>
        </button>
        {showGuide && (
          <div className="px-5 pb-4 border-t border-gray-700">
            <ol className="mt-3 space-y-2">
              {SETUP_STEPS.map((s) => (
                <li key={s.n} className="flex gap-3 text-sm text-gray-400">
                  <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {s.n}
                  </span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-gray-600">
              The token is shown only once — save it somewhere safe before pasting it here.
            </p>
          </div>
        )}
      </div>

      {/* Credentials form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {connect.error && (
          <div className="rounded-lg bg-red-950/40 border border-red-800 px-4 py-3 text-sm text-red-300">
            {connect.error.message.includes("Shopify API 401") || connect.error.message.includes("401")
              ? "Invalid access token — make sure you copied the full token from Shopify."
              : connect.error.message.includes("ENOTFOUND") || connect.error.message.includes("404")
              ? "Store not found — check your store domain."
              : connect.error.message}
          </div>
        )}

        <div>
          <label className="form-label">Store domain</label>
          <input
            className="form-input"
            placeholder="my-bakery.myshopify.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoFocus
            required
          />
          <p className="text-xs text-gray-600 mt-1">Your Shopify store URL, e.g. <span className="font-mono">my-bakery.myshopify.com</span></p>
        </div>

        <div>
          <label className="form-label">Admin API access token</label>
          <div className="flex gap-2">
            <input
              className="form-input font-mono text-sm flex-1"
              placeholder="shpat_••••••••••••••••••••••••••••••••"
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="px-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 space-y-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sync options</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={syncProd} onChange={(e) => setSyncProd(e.target.checked)}
              className="w-4 h-4 rounded accent-brand-500" />
            <div>
              <p className="text-sm text-gray-300">Sync recipes → Shopify products</p>
              <p className="text-xs text-gray-600">Exports your active recipes to your Shopify product catalog</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={syncOrd} onChange={(e) => setSyncOrd(e.target.checked)}
              className="w-4 h-4 rounded accent-brand-500" />
            <div>
              <p className="text-sm text-gray-300">View Shopify orders in dashboard</p>
              <p className="text-xs text-gray-600">Preview recent orders from your Shopify store</p>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={connect.isPending || !domain || !token}
          className="w-full py-2.5 rounded-xl bg-[#96bf48]/20 text-[#96bf48] border border-[#96bf48]/30 hover:bg-[#96bf48]/30 font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {connect.isPending ? "Connecting…" : "Connect to Shopify"}
        </button>
      </form>
    </div>
  );
}

// ── Connected panel ───────────────────────────────────────────────────────────

function fmtDate(d: Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ImportResult({
  label,
  result,
  error,
}: {
  label: string;
  result: { count: number; total: number; skipped?: number; errors: string[] } | null;
  error: string | null;
}) {
  if (!result && !error) return null;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!result) return null;
  const hasErrors = result.errors.length > 0;
  return (
    <div className={`rounded-lg px-3 py-2.5 text-sm border ${hasErrors ? "bg-amber-950/30 border-amber-800 text-amber-300" : "bg-emerald-950/30 border-emerald-800 text-emerald-300"}`}>
      {label}: {result.count} new{result.skipped !== undefined ? `, ${result.skipped} skipped` : ""} of {result.total} total.
      {hasErrors && (
        <ul className="mt-1.5 text-xs text-amber-400 space-y-0.5">
          {result.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </div>
  );
}

function ConnectedPanel({
  settings,
  onDisconnect,
}: {
  settings: {
    shopDomain: string;
    shopName: string | null;
    shopEmail: string | null;
    tokenPreview: string;
    syncProducts: boolean;
    syncOrders: boolean;
    lastSyncAt: Date | null;
    lastCustomerImportAt: Date | null;
    lastOrderImportAt: Date | null;
  };
  onDisconnect: () => void;
}) {
  const utils = api.useUtils();

  const [syncResult,       setSyncResult]       = useState<{ synced: number; total: number; errors: string[] } | null>(null);
  const [customerResult,   setCustomerResult]   = useState<{ count: number; total: number; skipped: number; errors: string[] } | null>(null);
  const [orderResult,      setOrderResult]      = useState<{ count: number; total: number; errors: string[] } | null>(null);
  const [ordersOpen,       setOrdersOpen]       = useState(false);

  const syncRecipes = api.shopify.syncRecipes.useMutation({
    onSuccess: (data) => {
      setSyncResult(data);
      utils.shopify.getSettings.invalidate();
    },
  });

  const importCustomers = api.shopify.importCustomers.useMutation({
    onSuccess: (data) => {
      setCustomerResult({ count: data.created, total: data.total, skipped: data.skipped, errors: data.errors });
      utils.shopify.getSettings.invalidate();
    },
  });

  const importOrders = api.shopify.importOrders.useMutation({
    onSuccess: (data) => {
      setOrderResult({ count: data.imported, total: data.total, errors: data.errors });
      utils.shopify.getSettings.invalidate();
    },
  });

  const { data: orders = [], isFetching: fetchingOrders } = api.shopify.previewOrders.useQuery(
    undefined,
    { enabled: ordersOpen && settings.syncOrders }
  );

  const updatePrefs = api.shopify.updatePreferences.useMutation({
    onSuccess: () => utils.shopify.getSettings.invalidate(),
  });

  const disconnect = api.shopify.disconnect.useMutation({
    onSuccess: () => { utils.shopify.getSettings.invalidate(); onDisconnect(); },
  });

  return (
    <div className="space-y-4">
      {/* Store header */}
      <div className="rounded-xl bg-gray-900 border border-[#96bf48]/30 overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#96bf48]/10 border border-[#96bf48]/30 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🛍</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-100 truncate">{settings.shopName ?? settings.shopDomain}</p>
              <span className="px-2 py-0.5 rounded-full bg-[#96bf48]/15 text-[#96bf48] text-[10px] font-bold border border-[#96bf48]/30 flex-shrink-0">
                Connected
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{settings.shopDomain}</p>
            {settings.shopEmail && <p className="text-xs text-gray-600 mt-0.5">{settings.shopEmail}</p>}
          </div>
          <button
            onClick={() => { if (confirm("Disconnect your Shopify store?")) disconnect.mutate(); }}
            disabled={disconnect.isPending}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 text-xs hover:bg-red-900/50 transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
        <div className="border-t border-gray-800 px-5 py-2.5 flex items-center gap-2">
          <span className="text-xs text-gray-600 font-mono">Token:</span>
          <span className="text-xs text-gray-600 font-mono">{settings.tokenPreview}</span>
          {settings.lastSyncAt && (
            <span className="ml-auto text-xs text-gray-700">
              Last synced {new Date(settings.lastSyncAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Sync preferences */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sync settings</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.syncProducts}
            onChange={(e) => updatePrefs.mutate({ syncProducts: e.target.checked, syncOrders: settings.syncOrders })}
            className="w-4 h-4 rounded accent-brand-500"
          />
          <div className="flex-1">
            <p className="text-sm text-gray-300">Sync recipes → Shopify products</p>
            <p className="text-xs text-gray-600">Push active recipes to your product catalog</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.syncOrders}
            onChange={(e) => updatePrefs.mutate({ syncProducts: settings.syncProducts, syncOrders: e.target.checked })}
            className="w-4 h-4 rounded accent-brand-500"
          />
          <div className="flex-1">
            <p className="text-sm text-gray-300">Show recent Shopify orders</p>
            <p className="text-xs text-gray-600">View last 60 days of orders from Shopify</p>
          </div>
        </label>
      </div>

      {/* Actions */}
      {settings.syncProducts && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Products
          </div>
          <div className="px-5 py-4 space-y-3">
            {syncResult && (
              <div className={`rounded-lg px-3 py-2.5 text-sm border ${
                syncResult.errors.length > 0
                  ? "bg-amber-950/30 border-amber-800 text-amber-300"
                  : "bg-emerald-950/30 border-emerald-800 text-emerald-300"
              }`}>
                {syncResult.synced} of {syncResult.total} recipes synced to Shopify.
                {syncResult.errors.length > 0 && (
                  <ul className="mt-1.5 text-xs text-amber-400 space-y-0.5">
                    {syncResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
              </div>
            )}
            {syncRecipes.error && (
              <p className="text-sm text-red-400">{syncRecipes.error.message}</p>
            )}
            <p className="text-sm text-gray-500">
              Creates new Shopify products for each of your active recipes. Existing Shopify products are not modified.
            </p>
            <button
              onClick={() => syncRecipes.mutate()}
              disabled={syncRecipes.isPending}
              className="w-full py-2.5 rounded-xl bg-[#96bf48]/15 text-[#96bf48] border border-[#96bf48]/25 hover:bg-[#96bf48]/25 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {syncRecipes.isPending ? "Syncing…" : "Push recipes to Shopify"}
            </button>
          </div>
        </div>
      )}

      {/* Import customers */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Customers
        </div>
        <div className="px-5 py-4 space-y-3">
          <ImportResult
            label="Customers imported"
            result={customerResult}
            error={importCustomers.error ? importCustomers.error.message : null}
          />
          <p className="text-sm text-gray-500">
            Pull your Shopify customers into the bakery database. New customers get a loyalty card; existing ones (matched by email) are skipped.
          </p>
          {settings.lastCustomerImportAt && (
            <p className="text-xs text-gray-700">Last imported {fmtDate(settings.lastCustomerImportAt)}</p>
          )}
          <button
            onClick={() => importCustomers.mutate()}
            disabled={importCustomers.isPending}
            className="w-full py-2.5 rounded-xl bg-brand-500/15 text-brand-400 border border-brand-500/25 hover:bg-brand-500/25 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {importCustomers.isPending ? "Importing…" : "Import customers from Shopify"}
          </button>
        </div>
      </div>

      {/* Import orders */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Orders
        </div>
        <div className="px-5 py-4 space-y-3">
          <ImportResult
            label="Orders imported"
            result={orderResult}
            error={importOrders.error ? importOrders.error.message : null}
          />
          <p className="text-sm text-gray-500">
            {settings.lastOrderImportAt
              ? `Fetches Shopify orders created after ${fmtDate(settings.lastOrderImportAt)} and saves them as sales records. Each sale is linked to a matching customer by email.`
              : "Fetches all Shopify orders and saves them as sales records. Each sale is linked to a matching customer by email."}
          </p>
          {settings.lastOrderImportAt && (
            <p className="text-xs text-gray-700">Last imported {fmtDate(settings.lastOrderImportAt)}</p>
          )}
          <button
            onClick={() => importOrders.mutate()}
            disabled={importOrders.isPending}
            className="w-full py-2.5 rounded-xl bg-brand-500/15 text-brand-400 border border-brand-500/25 hover:bg-brand-500/25 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {importOrders.isPending ? "Importing…" : "Import orders from Shopify"}
          </button>
        </div>
      </div>

      {settings.syncOrders && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <button
            onClick={() => setOrdersOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors"
          >
            <span>Recent Shopify orders</span>
            <span className={`transition-transform duration-200 ${ordersOpen ? "rotate-180" : ""}`}>▼</span>
          </button>

          {ordersOpen && (
            <div className="border-t border-gray-800">
              {fetchingOrders ? (
                <p className="px-5 py-6 text-sm text-gray-600 text-center animate-pulse">Loading orders…</p>
              ) : orders.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-600 text-center">No orders in the last 60 days.</p>
              ) : (
                <div className="divide-y divide-gray-800 max-h-80 overflow-y-auto">
                  {orders.map((o) => (
                    <div key={o.id} className="px-5 py-3 flex justify-between items-start gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-200">{o.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            o.status === "paid" ? "bg-emerald-900/40 text-emerald-400"
                            : o.status === "pending" ? "bg-amber-900/40 text-amber-400"
                            : "bg-gray-800 text-gray-500"
                          }`}>{o.status}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{o.customer}</p>
                        <p className="text-xs text-gray-700 mt-0.5 truncate">{o.items}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono font-bold text-gray-200">{parseFloat(o.total).toFixed(2)} {o.currency}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {new Date(o.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────

// ── Personalization section ───────────────────────────────────────────────────

function PersonalizationSection() {
  const { theme, setTheme, bakeryName, setBakeryName } = usePersonalization();
  const [nameInput, setNameInput] = useState(bakeryName);

  // Keep input in sync if bakeryName loads from localStorage after mount
  useEffect(() => { setNameInput(bakeryName); }, [bakeryName]);

  const categories: Array<{ id: string; label: string; ids: ThemeId[] }> = [
    { id: "current",  label: "Current",  ids: ["rose"]               },
    { id: "neutral",  label: "Neutral",  ids: ["slate", "stone", "sage"] },
    { id: "feminine", label: "Feminine", ids: ["lavender", "peach"]  },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-100 border border-brand-200 flex items-center justify-center text-base flex-shrink-0">🎨</div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Personalisation</p>
          <p className="text-xs text-gray-500">Bakery name and colour scheme</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Bakery name */}
        <div>
          <label className="form-label">Bakery name</label>
          <div className="flex gap-2">
            <input
              className="form-input flex-1"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="My Bakery"
              maxLength={40}
            />
            <button
              onClick={() => setBakeryName(nameInput.trim() || "My Bakery")}
              className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Shown in the navigation bar. Saved locally to this browser.</p>
        </div>

        {/* Colour scheme */}
        <div>
          <p className="form-label">Colour scheme</p>
          <div className="space-y-4">
            {categories.map(({ id, label, ids }) => (
              <div key={id}>
                <p className="text-xs text-gray-500 mb-2">{label}</p>
                <div className="flex flex-wrap gap-3">
                  {ids.map((tid) => {
                    const t = THEMES[tid];
                    const active = theme === tid;
                    return (
                      <button
                        key={tid}
                        onClick={() => setTheme(tid)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 text-left transition-all ${
                          active ? "border-brand-600 bg-brand-50" : "border-rose-100 bg-white hover:border-brand-300"
                        }`}
                      >
                        {/* Colour swatch */}
                        <span
                          className="w-8 h-8 rounded-lg flex-shrink-0 border border-black/5"
                          style={{ background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 100%)` }}
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">{t.label}</span>
                          <span className="block text-xs text-gray-500">{t.desc}</span>
                        </span>
                        {active && <span className="ml-1 text-brand-600 text-base leading-none">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">Saved locally to this browser — each device can have its own scheme.</p>
        </div>
      </div>
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [isLoggedIn,   setIsLoggedIn]   = useState(false);
  const [isAnonymous,  setIsAnonymous]  = useState(false);
  const [connected,    setConnected]    = useState(false);

  useEffect(() => {
    const supabase = createClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setIsAnonymous(session?.user?.is_anonymous ?? false);
    });
  }, []);

  const { data: shopify, isLoading } = api.shopify.getSettings.useQuery();

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <h2 className="page-title">Settings</h2>
        <p className="text-gray-500 mt-1">Manage integrations and account preferences.</p>
      </div>

      {/* Personalisation — available to everyone */}
      <PersonalizationSection />

      {/* Must be signed in */}
      {isAnonymous && (
        <div className="card px-5 py-4 border-amber-800/40 bg-amber-950/20 flex items-start gap-3">
          <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-300">Sign in to connect integrations</p>
            <p className="text-xs text-amber-500/70 mt-0.5">
              You&apos;re currently in demo mode. Create an account to save your Shopify connection.
            </p>
            <Link href="/login" className="inline-block mt-2 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors">
              Create account →
            </Link>
          </div>
        </div>
      )}

      {/* Shopify integration card */}
      <div className="card overflow-hidden">
        {/* Card header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#96bf48]/10 border border-[#96bf48]/20 flex items-center justify-center text-base flex-shrink-0">
            🛍
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-200 text-sm">Shopify</p>
            <p className="text-xs text-gray-500">Sync products and view orders from your Shopify store</p>
          </div>
          {!isLoading && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              shopify?.isConnected
                ? "bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/30"
                : "bg-gray-800 text-gray-500 border-gray-700"
            }`}>
              {shopify?.isConnected ? "Connected" : "Not connected"}
            </span>
          )}
        </div>

        <div className="px-6 py-5">
          {isLoading ? (
            <p className="text-sm text-gray-600 animate-pulse">Loading…</p>
          ) : isAnonymous ? (
            <p className="text-sm text-gray-600">Sign in to connect your Shopify store.</p>
          ) : shopify?.isConnected ? (
            <ConnectedPanel
              settings={shopify}
              onDisconnect={() => setConnected(false)}
            />
          ) : (
            <ConnectForm onSuccess={() => setConnected(true)} />
          )}
        </div>
      </div>

      {/* Placeholder for future integrations */}
      <div className="card px-6 py-5 opacity-40 pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-base">📧</div>
          <div>
            <p className="font-semibold text-gray-400 text-sm">Email / SMS notifications</p>
            <p className="text-xs text-gray-600">Coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
