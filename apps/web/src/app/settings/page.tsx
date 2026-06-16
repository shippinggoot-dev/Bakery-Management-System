"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization, THEMES, type ThemeId } from "@/components/ThemeProvider";
import { ShopifyWebhookWizard } from "@/components/wizard/ShopifyWebhookWizard";

// ── Connect-form helpers ──────────────────────────────────────────────────────

/**
 * Mirror of server-side normaliseDomain — strips protocol/www/path and
 * lowercases. Used for live preview so the user sees the cleaned-up
 * value reflected back. Pure function, no validation throws here.
 */
function previewDomain(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

const MYSHOPIFY_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const HANDLE_RE    = /^[a-z0-9][a-z0-9-]*$/;

type DomainState = { ok: boolean; canonical: string | null; reason: "empty" | "wrong" | "ok-handle" | "ok-domain" };

function checkDomain(raw: string): DomainState {
  const cleaned = previewDomain(raw);
  if (!cleaned) return { ok: false, canonical: null, reason: "empty" };
  if (MYSHOPIFY_RE.test(cleaned)) return { ok: true, canonical: cleaned, reason: "ok-domain" };
  if (HANDLE_RE.test(cleaned))    return { ok: true, canonical: `${cleaned}.myshopify.com`, reason: "ok-handle" };
  return { ok: false, canonical: null, reason: "wrong" };
}

/**
 * Map error codes from the OAuth callback (passed as ?shopify_error= on
 * the redirect back to /settings) to translation keys.
 */
function shopifyErrorMessageKey(code: string): string {
  switch (code) {
    case "invalid_shop_domain":    return "errors.invalidDomain";
    case "missing_params":         return "errors.cannotReach";
    case "hmac_mismatch":          return "errors.hmacMismatch";
    case "missing_state_cookie":
    case "invalid_state_cookie":
    case "state_mismatch":
    case "shop_mismatch":          return "errors.stateMismatch";
    case "token_exchange_failed":  return "errors.authFailed";
    case "oauth_not_configured":   return "errors.notConfigured";
    default:                       return "errors.generic";
  }
}

// ── Connect form ──────────────────────────────────────────────────────────────

function ConnectForm({ errorCode }: { errorCode: string | null }) {
  const t = useTranslations("settings.shopifyForm");
  const [domain,      setDomain]      = useState("");
  const [showFindUrl, setShowFindUrl] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  // The "Where do I find my Shopify URL?" disclosure stays open across
  // tab switches, route changes, and page reloads.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("bms-shopify-find-url-open") === "1") {
        setShowFindUrl(true);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("bms-shopify-find-url-open", showFindUrl ? "1" : "0");
    } catch { /* ignore */ }
  }, [showFindUrl]);

  // Preserve a half-typed store domain across an accidental reload — e.g. the
  // browser discarding an inactive tab to save memory. sessionStorage (not
  // localStorage) so the draft clears when the tab closes rather than
  // lingering for weeks after the connection is set up.
  const skipFirstDraftSave = useRef(true);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("bms-shopify-domain-draft");
      if (saved) setDomain(saved);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    // Skip the initial run so the empty mount value can't wipe the saved
    // draft before the restore effect above has had a chance to read it.
    if (skipFirstDraftSave.current) {
      skipFirstDraftSave.current = false;
      return;
    }
    try {
      if (domain) {
        window.sessionStorage.setItem("bms-shopify-domain-draft", domain);
      } else {
        window.sessionStorage.removeItem("bms-shopify-domain-draft");
      }
    } catch { /* ignore */ }
  }, [domain]);

  const domainState = useMemo(() => checkDomain(domain), [domain]);
  const formValid   = domainState.ok;

  /** Snap the input to the cleaned canonical form once the user blurs it. */
  function handleDomainBlur() {
    const state = checkDomain(domain);
    if (state.canonical && state.canonical !== domain) {
      setDomain(state.canonical);
    } else if (!state.ok && state.reason === "wrong") {
      const cleaned = previewDomain(domain);
      if (cleaned && cleaned !== domain) setDomain(cleaned);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    // Hand off to the server-side OAuth start endpoint. It will redirect
    // to Shopify, which after merchant approval redirects back to
    // /api/shopify/oauth/callback, which lands back on /settings.
    const shop = domainState.canonical ?? domain;
    window.location.href = `/api/shopify/oauth/start?shop=${encodeURIComponent(shop)}`;
  }

  const errorText = errorCode ? t(shopifyErrorMessageKey(errorCode)) : null;

  return (
    <div className="space-y-5">
      {/* What happens when you click Connect */}
      <div className="rounded-xl bg-rose-50 border border-rose-100 px-5 py-4">
        <p className="text-sm text-gray-700 font-medium">{t("oauthIntro.title")}</p>
        <ol className="mt-2.5 space-y-1.5 text-sm text-gray-600 list-decimal list-inside">
          <li>{t("oauthIntro.step1")}</li>
          <li>{t("oauthIntro.step2")}</li>
          <li>{t("oauthIntro.step3")}</li>
        </ol>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorText && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorText}
          </div>
        )}

        <div>
          <label className="form-label">{t("storeDomainLabel")}</label>
          <input
            className={`form-input ${
              domain && !domainState.ok ? "border-red-300 focus:border-red-400" : ""
            } ${domain && domainState.ok ? "border-emerald-300 focus:border-emerald-400" : ""}`}
            placeholder="my-bakery.myshopify.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={handleDomainBlur}
            autoFocus
            required
          />
          {domain && domainState.reason === "wrong" && (
            <p className="text-xs text-red-600 mt-1">{t("domainWrong")}</p>
          )}
          {domain && domainState.reason === "ok-handle" && (
            <p className="text-xs text-emerald-700 mt-1">
              ✓ {t("domainHandlePreview", { canonical: domainState.canonical ?? "" })}
            </p>
          )}
          {domain && domainState.reason === "ok-domain" && (
            <p className="text-xs text-emerald-700 mt-1">✓ {t("domainOk")}</p>
          )}
          {!domain && (
            <p className="text-xs text-gray-600 mt-1">
              {t("domainHint")} <span className="font-mono">my-bakery.myshopify.com</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowFindUrl((v) => !v)}
            className="mt-2 text-xs text-brand-500 hover:text-brand-400 underline underline-offset-2"
          >
            {showFindUrl ? t("hideFindUrl") : t("showFindUrl")}
          </button>
          {showFindUrl && (
            <div className="mt-2 rounded-lg bg-rose-50 border border-rose-100 p-3 text-xs text-gray-700 space-y-2">
              <p className="font-semibold text-gray-800">{t("findUrl.title")}</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>{t("findUrl.step1")}</li>
                <li>{t("findUrl.step2")}</li>
                <li>{t("findUrl.step3")}</li>
              </ol>
              <a
                href="https://admin.shopify.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-md bg-white border border-rose-200 text-brand-500 hover:bg-rose-50 text-xs font-medium transition-colors"
              >
                {t("findUrl.openAdmin")} ↗
              </a>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !formValid}
          className="w-full py-2.5 rounded-xl bg-[#96bf48]/20 text-[#96bf48] border border-[#96bf48]/30 hover:bg-[#96bf48]/30 font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {submitting ? t("redirecting") : t("connectButton")}
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

/**
 * Skeleton shown while `api.shopify.getSettings` is still loading. Mirrors
 * the rough shape and height of `ConnectForm` (the more common state for a
 * fresh visitor) so the card doesn't jump in size once the query resolves.
 */
function ShopifyCardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-hidden="true">
      <div className="rounded-xl bg-rose-50 border border-rose-100 px-5 py-4">
        <div className="h-4 bg-rose-100 rounded w-2/3 mb-2.5" />
        <div className="space-y-1.5">
          <div className="h-3 bg-rose-100 rounded w-11/12" />
          <div className="h-3 bg-rose-100 rounded w-4/5" />
          <div className="h-3 bg-rose-100 rounded w-3/4" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-rose-100 rounded w-24" />
        <div className="h-10 bg-rose-50 border border-rose-100 rounded-md" />
        <div className="h-3 bg-rose-100 rounded w-48" />
      </div>
      <div className="h-10 bg-rose-100 rounded-xl" />
    </div>
  );
}

function ConnectedPanel({
  settings,
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
    lastInventorySyncAt: Date | null;
    shopifyLocationId: string | null;
    webhookConfigured: boolean;
    lastWebhookReceivedAt: Date | null;
  };
}) {
  const utils = api.useUtils();

  const [syncResult,       setSyncResult]       = useState<{ synced: number; total: number; errors: string[] } | null>(null);
  const [inventoryResult,  setInventoryResult]  = useState<{ pushed: number; errors: string[] } | null>(null);
  const [customerResult,   setCustomerResult]   = useState<{ count: number; total: number; skipped: number; errors: string[] } | null>(null);
  const [orderResult,      setOrderResult]      = useState<{ count: number; total: number; errors: string[] } | null>(null);
  const [ordersOpen,       setOrdersOpen]       = useState(false);
  const [wizardOpen,       setWizardOpen]       = useState(false);

  const syncRecipes = api.shopify.syncRecipes.useMutation({
    onSuccess: (data) => {
      setSyncResult(data);
      utils.shopify.getSettings.invalidate();
    },
  });

  const syncProducts = api.shopify.syncProducts.useMutation({
    onSuccess: (data) => {
      setSyncResult(data);
      utils.shopify.getSettings.invalidate();
    },
  });

  const pushInventory = api.shopify.pushInventory.useMutation({
    onSuccess: (data) => {
      setInventoryResult(data);
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
    onSuccess: () => utils.shopify.getSettings.invalidate(),
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
            <p className="text-sm text-gray-700">Sync products to Shopify</p>
            <p className="text-xs text-gray-500">Push active recipes and premade cakes to your product catalog. Inventory levels also update in the background.</p>
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

      {/* Actions — products + inventory */}
      {settings.syncProducts && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Products & inventory
          </div>
          <div className="px-5 py-4 space-y-4">

            {/* Product sync */}
            <div className="space-y-2">
              {syncResult && (
                <div className={`rounded-lg px-3 py-2.5 text-sm border ${
                  syncResult.errors.length > 0
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}>
                  {syncResult.synced} of {syncResult.total} products synced to Shopify.
                  {syncResult.errors.length > 0 && (
                    <ul className="mt-1.5 text-xs text-amber-600 space-y-0.5">
                      {syncResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {syncProducts.error && (
                <p className="text-sm text-red-400">{syncProducts.error.message}</p>
              )}
              <p className="text-sm text-gray-500">
                Pushes recipes <em>and</em> premade cakes to Shopify. Items already on Shopify get updated (title, price, status); new items get created. Selling price flows through to the Shopify variant.
              </p>
              <button
                onClick={() => syncProducts.mutate()}
                disabled={syncProducts.isPending}
                className="w-full py-2.5 rounded-xl bg-[#96bf48]/15 text-[#96bf48] border border-[#96bf48]/25 hover:bg-[#96bf48]/25 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {syncProducts.isPending ? "Syncing…" : "Push products to Shopify"}
              </button>
            </div>

            {/* Inventory push */}
            <div className="space-y-2 pt-3 border-t border-rose-100">
              {inventoryResult && (
                <div className={`rounded-lg px-3 py-2.5 text-sm border ${
                  inventoryResult.errors.length > 0
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}>
                  {inventoryResult.pushed} inventory level(s) pushed to Shopify.
                  {inventoryResult.errors.length > 0 && (
                    <ul className="mt-1.5 text-xs text-amber-600 space-y-0.5">
                      {inventoryResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {pushInventory.error && (
                <p className="text-sm text-red-400">{pushInventory.error.message}</p>
              )}
              <p className="text-sm text-gray-500">
                Recalculates how many units of each product can be made from current ingredient stock and sets that as the Shopify inventory level. Levels also push automatically on every stock change in the background.
              </p>
              {settings.lastInventorySyncAt && (
                <p className="text-xs text-gray-700">Last pushed {fmtDate(settings.lastInventorySyncAt)}</p>
              )}
              <button
                onClick={() => pushInventory.mutate()}
                disabled={pushInventory.isPending}
                className="w-full py-2.5 rounded-xl bg-brand-500/15 text-brand-400 border border-brand-500/25 hover:bg-brand-500/25 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {pushInventory.isPending ? "Pushing…" : "Push inventory now"}
              </button>
            </div>
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

      {/* Automatic order intake — wizard launcher */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-rose-100 flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
            Automatic order intake
          </p>
          {settings.webhookConfigured ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#96bf48]/15 text-[#96bf48] border border-[#96bf48]/30">
              Active
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              Not set up
            </span>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-600">
            {settings.webhookConfigured
              ? "New Shopify orders flow into your Planner automatically. You can re-run setup if you've rotated your signing secret."
              : "Skip manual imports — set up automatic order delivery so every new Shopify order appears in your Planner within seconds."}
          </p>
          {settings.lastWebhookReceivedAt && (
            <p className="text-xs text-gray-500">
              Last order received {fmtDate(settings.lastWebhookReceivedAt)}
            </p>
          )}
          <button
            onClick={() => setWizardOpen(true)}
            className="w-full py-2.5 rounded-xl bg-[#96bf48]/15 text-[#96bf48] border border-[#96bf48]/25 hover:bg-[#96bf48]/25 text-sm font-medium transition-colors"
          >
            {settings.webhookConfigured ? "Re-run setup" : "Set up automatic orders"}
          </button>
        </div>
      </div>

      <ShopifyWebhookWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

// ── Ignored Shopify products ──────────────────────────────────────────────────

/**
 * Per-workspace block list management. Items only ever enter this list via
 * the Planner's 🚫 Block button (see `apps/web/src/app/planner/page.tsx`).
 * From here the owner can review what's blocked and unblock individual
 * titles so future Shopify imports pick them back up.
 */
function IgnoredShopifyProductsCard() {
  const utils = api.useUtils();
  const { data: ignored = [], isLoading } = api.shopify.listIgnoredProducts.useQuery();
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const unignore = api.shopify.unignoreProduct.useMutation({
    onSuccess: (_data, id) => {
      const removed = ignored.find((i) => i.id === id);
      setConfirmation(removed?.shopifyTitle ?? null);
      utils.shopify.listIgnoredProducts.invalidate();
    },
  });

  // Auto-dismiss the inline confirmation. The effect's cleanup cancels the
  // previous timer if a second unblock fires before the first one expires,
  // so the banner stays in sync with the most recent action.
  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(() => setConfirmation(null), 3500);
    return () => clearTimeout(t);
  }, [confirmation]);

  if (isLoading) {
    return (
      <div className="card overflow-hidden" aria-hidden="true">
        <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-rose-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-rose-100 rounded w-44" />
            <div className="h-2.5 bg-rose-100 rounded w-64" />
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = ignored.length === 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-base flex-shrink-0">
          🚫
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">Ignored Shopify products</p>
          <p className="text-xs text-gray-500">Skipped during Shopify import — never reach the Planner</p>
        </div>
        {!isEmpty && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-brand-500 border border-rose-200 flex-shrink-0">
            {ignored.length}
          </span>
        )}
      </div>

      {confirmation && (
        <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-700">
          Unblocked &ldquo;{confirmation}&rdquo; — future imports will include it again.
        </div>
      )}

      {unignore.error && !confirmation && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
          Couldn&apos;t unblock that item: {unignore.error.message}
        </div>
      )}

      {isEmpty ? (
        <div className="px-6 py-4">
          <p className="text-sm text-gray-500">
            No products blocked — items added via the Planner&apos;s 🚫 Block button appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-rose-100">
          {ignored.map((item) => {
            const pending = unignore.isPending && unignore.variables === item.id;
            return (
              <li key={item.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm break-words">{item.shopifyTitle}</p>
                  {item.reason && (
                    <p className="text-xs text-gray-500 mt-0.5 break-words">{item.reason}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">Blocked {fmtDate(item.createdAt)}</p>
                </div>
                <button
                  onClick={() => unignore.mutate(item.id)}
                  disabled={pending}
                  className="flex-shrink-0 text-xs text-brand-500 hover:text-brand-400 font-medium transition-colors disabled:opacity-50"
                >
                  {pending ? "Unblocking…" : "Unblock"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Email settings section ────────────────────────────────────────────────────

const RESEND_STEPS = [
  { n: 1, text: "Go to resend.com and create a free account (3,000 emails/month free)." },
  { n: 2, text: "Add your domain (e.g. yourbakery.com) under Domains and verify the DNS records they give you. This usually takes a few minutes." },
  { n: 3, text: "Go to API Keys → Create API Key. Copy the key — it's shown only once." },
  { n: 4, text: "Paste the key below along with the email address you want orders to be sent from." },
];

// ── Workflow preferences ──────────────────────────────────────────────────────

function WorkflowPreferencesSection() {
  const utils = api.useUtils();
  const { data: prefs } = api.preferences.get.useQuery();
  const update = api.preferences.update.useMutation({
    onSuccess: () => utils.preferences.get.invalidate(),
  });

  const confirmBatch    = prefs?.confirmBatchCompletion    ?? true;
  const showShopifyTile = prefs?.dashboardShowShopifyTile  ?? true;

  return (
    <div id="workflow" className="card overflow-hidden scroll-mt-6">
      <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-base flex-shrink-0">
          ⚙️
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">Workflow preferences</p>
          <p className="text-xs text-gray-500">How the system behaves when you take destructive actions</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmBatch}
            onChange={(e) => update.mutate({ confirmBatchCompletion: e.target.checked })}
            disabled={update.isPending}
            className="w-4 h-4 mt-0.5 rounded accent-brand-500"
          />
          <div className="flex-1">
            <p className="text-sm text-gray-700 font-medium">
              Confirm before recording a production batch
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              When you mark a scheduled batch as &ldquo;done&rdquo;, the system shows a summary first
              and waits for your confirmation. Turn this off if you prefer one-tap recording.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showShopifyTile}
            onChange={(e) => update.mutate({ dashboardShowShopifyTile: e.target.checked })}
            disabled={update.isPending}
            className="w-4 h-4 mt-0.5 rounded accent-brand-500"
          />
          <div className="flex-1">
            <p className="text-sm text-gray-700 font-medium">
              Show Shopify tile on dashboard
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              When on, the dashboard shows a Shopify tile (with order activity if connected, or a
              setup hint if not). When off, the Tomorrow preview takes its place.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}

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
            placeholder="Your Bakery"
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
    { id: "warm",     label: "Warm",     ids: ["sunrise", "rose"]        },
    { id: "neutral",  label: "Neutral",  ids: ["slate", "stone", "sage"] },
    { id: "feminine", label: "Feminine", ids: ["lavender", "peach"]      },
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
              placeholder="Your bakery"
              maxLength={40}
            />
            <button
              onClick={() => setBakeryName(nameInput.trim() || "Your bakery")}
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
  const searchParams   = useSearchParams();
  const shopifyJustConnected  = searchParams.get("shopify") === "connected";
  const shopifyErrorCode      = searchParams.get("shopify_error");

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

      {/* Workflow preferences */}
      {!isAnonymous && <WorkflowPreferencesSection />}

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
          {isLoading ? (
            // Invisible placeholder sized to the longer "Not connected" label —
            // keeps the badge slot a fixed width so the header doesn't shift
            // when the query resolves.
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-gray-100 border-gray-200 text-transparent animate-pulse"
              aria-hidden="true"
            >
              Not connected
            </span>
          ) : (
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
          {shopifyJustConnected && shopify?.isConnected && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">
              Shopify connected successfully.
            </div>
          )}
          {isLoading ? (
            <ShopifyCardSkeleton />
          ) : isAnonymous ? (
            <p className="text-sm text-gray-600">Sign in to connect your Shopify store.</p>
          ) : shopify?.isConnected ? (
            <ConnectedPanel settings={shopify} />
          ) : (
            <ConnectForm errorCode={shopifyErrorCode} />
          )}
        </div>
      </div>

      {/* Ignored Shopify products — visible whenever the user could have items here */}
      {!isAnonymous && <IgnoredShopifyProductsCard />}

      {/* Email notifications */}
      {!isAnonymous && <EmailSettingsSection />}
    </div>
  );
}
