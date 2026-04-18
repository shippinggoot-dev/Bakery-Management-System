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
      <div className="rounded-xl bg-rose-50 border border-rose-100 overflow-hidden">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <span>How to get your access token</span>
          <span className={`text-gray-400 transition-transform duration-200 ${showGuide ? "rotate-180" : ""}`}>▼</span>
        </button>
        {showGuide && (
          <div className="px-5 pb-4 border-t border-rose-100">
            <ol className="mt-3 space-y-2">
              {SETUP_STEPS.map((s) => (
                <li key={s.n} className="flex gap-3 text-sm text-gray-500">
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
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
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
              className="px-3 rounded-xl bg-gray-100 border border-rose-200 text-gray-500 hover:text-gray-700 text-xs transition-colors"
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 space-y-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sync options</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={syncProd} onChange={(e) => setSyncProd(e.target.checked)}
              className="w-4 h-4 rounded accent-brand-500" />
            <div>
              <p className="text-sm text-gray-700">Sync recipes → Shopify products</p>
              <p className="text-xs text-gray-500">Exports your active recipes to your Shopify product catalog</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={syncOrd} onChange={(e) => setSyncOrd(e.target.checked)}
              className="w-4 h-4 rounded accent-brand-500" />
            <div>
              <p className="text-sm text-gray-700">View Shopify orders in dashboard</p>
              <p className="text-xs text-gray-500">Preview recent orders from your Shopify store</p>
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
    <div className={`rounded-lg px-3 py-2.5 text-sm border ${hasErrors ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
      {label}: {result.count} new{result.skipped !== undefined ? `, ${result.skipped} skipped` : ""} of {result.total} total.
      {hasErrors && (
        <ul className="mt-1.5 text-xs text-amber-600 space-y-0.5">
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
  const [webhookSecret,    setWebhookSecret]    = useState("");
  const [webhookSaved,     setWebhookSaved]     = useState(false);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const [showSecret,       setShowSecret]       = useState(false);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/shopify`
    : "/api/webhooks/shopify";

  const saveWebhookSecret = api.shopify.updateWebhookSecret.useMutation({
    onSuccess: () => { setWebhookSaved(true); setTimeout(() => setWebhookSaved(false), 3000); },
  });

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
      <div className="rounded-xl bg-white border border-[#96bf48]/30 overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#96bf48]/10 border border-[#96bf48]/30 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🛍</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 truncate">{settings.shopName ?? settings.shopDomain}</p>
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
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
        <div className="border-t border-rose-100 px-5 py-2.5 flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">Token:</span>
          <span className="text-xs text-gray-500 font-mono">{settings.tokenPreview}</span>
          {settings.lastSyncAt && (
            <span className="ml-auto text-xs text-gray-500">
              Last synced {new Date(settings.lastSyncAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Sync preferences */}
      <div className="rounded-xl bg-rose-50 border border-rose-100 px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sync settings</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.syncProducts}
            onChange={(e) => updatePrefs.mutate({ syncProducts: e.target.checked, syncOrders: settings.syncOrders })}
            className="w-4 h-4 rounded accent-brand-500"
          />
          <div className="flex-1">
            <p className="text-sm text-gray-700">Sync recipes → Shopify products</p>
            <p className="text-xs text-gray-500">Push active recipes to your product catalog</p>
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
            <p className="text-sm text-gray-700">Show recent Shopify orders</p>
            <p className="text-xs text-gray-500">View last 60 days of orders from Shopify</p>
          </div>
        </label>
      </div>

      {/* Actions */}
      {settings.syncProducts && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Products
          </div>
          <div className="px-5 py-4 space-y-3">
            {syncResult && (
              <div className={`rounded-lg px-3 py-2.5 text-sm border ${
                syncResult.errors.length > 0
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}>
                {syncResult.synced} of {syncResult.total} recipes synced to Shopify.
                {syncResult.errors.length > 0 && (
                  <ul className="mt-1.5 text-xs text-amber-600 space-y-0.5">
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
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
        <div className="card overflow-hidden">
          <button
            onClick={() => setOrdersOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
          >
            <span>Recent Shopify orders</span>
            <span className={`transition-transform duration-200 ${ordersOpen ? "rotate-180" : ""}`}>▼</span>
          </button>

          {ordersOpen && (
            <div className="border-t border-rose-100">
              {fetchingOrders ? (
                <p className="px-5 py-6 text-sm text-gray-600 text-center animate-pulse">Loading orders…</p>
              ) : orders.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-600 text-center">No orders in the last 60 days.</p>
              ) : (
                <div className="divide-y divide-rose-50 max-h-80 overflow-y-auto">
                  {orders.map((o) => (
                    <div key={o.id} className="px-5 py-3 flex justify-between items-start gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{o.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            o.status === "paid" ? "bg-emerald-50 text-emerald-700"
                            : o.status === "pending" ? "bg-amber-50 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                          }`}>{o.status}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{o.customer}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{o.items}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono font-bold text-gray-800">{parseFloat(o.total).toFixed(2)} {o.currency}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
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

      {/* Webhook setup */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Automatic order intake (Webhook)
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Set up a webhook in Shopify so every new order automatically appears in your Planner — no manual importing needed.
          </p>

          {/* Collapsible guide */}
          <div className="rounded-xl bg-rose-50 border border-rose-100 overflow-hidden">
            <button
              onClick={() => setShowWebhookGuide((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <span>Step-by-step setup guide</span>
              <span className={`text-gray-400 transition-transform duration-200 ${showWebhookGuide ? "rotate-180" : ""}`}>▼</span>
            </button>
            {showWebhookGuide && (
              <div className="px-4 pb-4 border-t border-rose-100">
                <ol className="mt-3 space-y-3">
                  {[
                    { n: 1, text: "In your Shopify admin, go to Settings → Notifications." },
                    { n: 2, text: "Scroll to the bottom and click \"Create webhook\"." },
                    { n: 3, text: "Set Event to \"Order creation\", Format to JSON." },
                    { n: 4, text: "Paste the URL below into the URL field and save." },
                    { n: 5, text: "Shopify will show you a signing secret. Copy it and paste it into the field below." },
                  ].map((s) => (
                    <li key={s.n} className="flex gap-3 text-sm text-gray-500">
                      <span className="w-5 h-5 rounded-full bg-[#96bf48]/20 text-[#96bf48] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {s.n}
                      </span>
                      <span>{s.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Webhook URL (copy) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Your webhook URL</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="flex-1 form-input font-mono text-xs bg-rose-50 text-gray-700 cursor-text select-all"
              />
              <button
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Webhook secret */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Shopify signing secret</p>
            <div className="flex gap-2">
              <input
                className="flex-1 form-input font-mono text-sm"
                type={showSecret ? "text" : "password"}
                placeholder="whsec_••••••••••••••••"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="px-3 rounded-xl bg-gray-100 border border-rose-200 text-gray-500 hover:text-gray-700 text-xs transition-colors"
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Found in Shopify under Settings → Notifications → Webhooks after creating the webhook.</p>
          </div>

          <button
            onClick={() => { if (webhookSecret.trim()) saveWebhookSecret.mutate({ webhookSecret: webhookSecret.trim() }); }}
            disabled={!webhookSecret.trim() || saveWebhookSecret.isPending}
            className="w-full py-2.5 rounded-xl bg-[#96bf48]/15 text-[#96bf48] border border-[#96bf48]/25 hover:bg-[#96bf48]/25 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saveWebhookSecret.isPending ? "Saving…" : webhookSaved ? "Saved ✓" : "Save signing secret"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email settings section ────────────────────────────────────────────────────

const RESEND_STEPS = [
  { n: 1, text: "Go to resend.com and create a free account (3,000 emails/month free)." },
  { n: 2, text: "Add your domain (e.g. sucrekaker.com) under Domains and verify the DNS records they give you. This usually takes a few minutes." },
  { n: 3, text: "Go to API Keys → Create API Key. Copy the key — it's shown only once." },
  { n: 4, text: "Paste the key below along with the email address you want orders to be sent from." },
];

function EmailSettingsSection() {
  const utils = api.useUtils();
  const { data: emailCfg, isLoading } = api.emailSettings.getSettings.useQuery();

  const [fromName,     setFromName]     = useState("");
  const [fromEmail,    setFromEmail]    = useState("");
  const [apiKey,       setApiKey]       = useState("");
  const [showKey,      setShowKey]      = useState(false);
  const [showGuide,    setShowGuide]    = useState(false);
  const [confirmations, setConfirmations] = useState(false);
  const [statusUpdates, setStatusUpdates] = useState(false);
  const [saved,        setSaved]        = useState(false);

  useEffect(() => {
    if (emailCfg) {
      setFromName(emailCfg.fromName ?? "");
      setFromEmail(emailCfg.fromEmail ?? "");
      setApiKey(emailCfg.keyPreview ?? "");
      setConfirmations(emailCfg.sendConfirmations);
      setStatusUpdates(emailCfg.sendStatusUpdates);
    }
  }, [emailCfg]);

  const upsert = api.emailSettings.upsert.useMutation({
    onSuccess: () => {
      utils.emailSettings.getSettings.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const removeKey = api.emailSettings.removeKey.useMutation({
    onSuccess: () => { utils.emailSettings.getSettings.invalidate(); setApiKey(""); },
  });

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-100 border border-brand-200 flex items-center justify-center text-base flex-shrink-0">📧</div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">Email notifications</p>
          <p className="text-xs text-gray-500">Send order confirmations and status updates to customers</p>
        </div>
        {!isLoading && emailCfg?.hasKey && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
            Active
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Setup guide */}
        <div className="rounded-xl bg-rose-50 border border-rose-100 overflow-hidden">
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <span>How to set up email sending (Resend)</span>
            <span className={`text-gray-400 transition-transform duration-200 ${showGuide ? "rotate-180" : ""}`}>▼</span>
          </button>
          {showGuide && (
            <div className="px-4 pb-4 border-t border-rose-100">
              <ol className="mt-3 space-y-3">
                {RESEND_STEPS.map((s) => (
                  <li key={s.n} className="flex gap-3 text-sm text-gray-500">
                    <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {s.n}
                    </span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-gray-400">
                Need to send from a Gmail or other address? You can use Resend with any domain you own.
              </p>
            </div>
          )}
        </div>

        {/* From name */}
        <div>
          <label className="form-label">From name</label>
          <input
            className="form-input"
            placeholder="Sucre Kaker"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
          />
        </div>

        {/* From email */}
        <div>
          <label className="form-label">From email address</label>
          <input
            className="form-input"
            type="email"
            placeholder="orders@yourbakery.com"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">Must be on a domain you&apos;ve verified in Resend.</p>
        </div>

        {/* Resend API key */}
        <div>
          <label className="form-label">Resend API key</label>
          <div className="flex gap-2">
            <input
              className="flex-1 form-input font-mono text-sm"
              type={showKey ? "text" : "password"}
              placeholder="re_••••••••••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="px-3 rounded-xl bg-gray-100 border border-rose-200 text-gray-500 hover:text-gray-700 text-xs transition-colors"
            >
              {showKey ? "Hide" : "Show"}
            </button>
            {emailCfg?.hasKey && (
              <button
                type="button"
                onClick={() => { if (confirm("Remove your Resend API key?")) removeKey.mutate(); }}
                className="px-3 rounded-xl bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 text-xs transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">Stored securely — never shown in full after saving.</p>
        </div>

        {/* Toggles */}
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">When to send emails</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={confirmations} onChange={(e) => setConfirmations(e.target.checked)}
              className="w-4 h-4 accent-brand-600" />
            <div>
              <p className="text-sm text-gray-700">Order confirmations</p>
              <p className="text-xs text-gray-500">Sent automatically when a new Shopify order arrives</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={statusUpdates} onChange={(e) => setStatusUpdates(e.target.checked)}
              className="w-4 h-4 accent-brand-600" />
            <div>
              <p className="text-sm text-gray-700">Status updates</p>
              <p className="text-xs text-gray-500">Sent when you mark an order as &quot;In progress&quot;, &quot;Ready&quot;, or &quot;Cancelled&quot;</p>
            </div>
          </label>
        </div>

        {upsert.error && (
          <p className="text-sm text-red-500">{upsert.error.message}</p>
        )}

        <button
          onClick={() => upsert.mutate({ fromName, fromEmail, resendApiKey: apiKey, sendConfirmations: confirmations, sendStatusUpdates: statusUpdates })}
          disabled={upsert.isPending}
          className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors disabled:opacity-40"
        >
          {upsert.isPending ? "Saving…" : saved ? "Saved ✓" : "Save email settings"}
        </button>
      </div>
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
        <div className="card px-5 py-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-700">Sign in to connect integrations</p>
            <p className="text-xs text-amber-600 mt-0.5">
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
        <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#96bf48]/10 border border-[#96bf48]/20 flex items-center justify-center text-base flex-shrink-0">
            🛍
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">Shopify</p>
            <p className="text-xs text-gray-500">Sync products and view orders from your Shopify store</p>
          </div>
          {!isLoading && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              shopify?.isConnected
                ? "bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/30"
                : "bg-gray-100 text-gray-500 border-gray-200"
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

      {/* Email notifications */}
      {!isAnonymous && <EmailSettingsSection />}
    </div>
  );
}
