"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";

const STORAGE_KEY = "bakery_price_sync";
const INTERVAL_OPTIONS = [
  { label: "Every 6 hours",  value: 6   },
  { label: "Every 12 hours", value: 12  },
  { label: "Daily",          value: 24  },
  { label: "Weekly",         value: 168 },
];

interface SyncSettings {
  autoEnabled: boolean;
  intervalHours: number;
  lastSyncAt: string | null;
}

function loadSettings(): SyncSettings {
  if (typeof window === "undefined")
    return { autoEnabled: false, intervalHours: 24, lastSyncAt: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SyncSettings;
  } catch {}
  return { autoEnabled: false, intervalHours: 24, lastSyncAt: null };
}

function saveSettings(s: SyncSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function formatPrice(nok: string) {
  return `kr ${parseFloat(nok).toFixed(2)}`;
}

function priceDiff(oldP: string, newP: string) {
  const diff = parseFloat(newP) - parseFloat(oldP);
  const pct  = ((diff / parseFloat(oldP)) * 100).toFixed(1);
  return { diff, pct, up: diff > 0 };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function PriceAlertsPage() {
  const utils = api.useUtils();

  const [settings, setSettings] = useState<SyncSettings>({
    autoEnabled: false,
    intervalHours: 24,
    lastSyncAt: null,
  });

  // Load settings from localStorage on mount
  useEffect(() => { setSettings(loadSettings()); }, []);

  const { data: alerts = [], isLoading } = api.priceSync.getAlerts.useQuery();
  const { data: linkedCount = 0 } = api.priceSync.getLinkedCount.useQuery();

  const dismiss    = api.priceSync.dismissAlert.useMutation({ onSuccess: () => utils.priceSync.getAlerts.invalidate() });
  const dismissAll = api.priceSync.dismissAll.useMutation({  onSuccess: () => utils.priceSync.getAlerts.invalidate() });

  const sync = api.priceSync.sync.useMutation({
    onSuccess: () => {
      const updated = { ...settings, lastSyncAt: new Date().toISOString() };
      setSettings(updated);
      saveSettings(updated);
      utils.priceSync.getAlerts.invalidate();
      utils.priceSync.getAlertCount.invalidate();
      utils.priceSync.getLinkedCount.invalidate();
    },
  });

  // Auto-sync: trigger on mount if interval has passed, then set up interval
  useEffect(() => {
    if (!settings.autoEnabled) return;

    const shouldSync = !settings.lastSyncAt ||
      Date.now() - new Date(settings.lastSyncAt).getTime() > settings.intervalHours * 3_600_000;

    if (shouldSync) sync.mutate();

    const timer = setInterval(() => sync.mutate(), settings.intervalHours * 3_600_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoEnabled, settings.intervalHours]);

  function toggleAuto() {
    const updated = { ...settings, autoEnabled: !settings.autoEnabled };
    setSettings(updated);
    saveSettings(updated);
  }

  function setInterval_(hours: number) {
    const updated = { ...settings, intervalHours: hours };
    setSettings(updated);
    saveSettings(updated);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Price Alerts</h2>
          <p className="text-gray-500 mt-1">
            {linkedCount === 0
              ? "No ingredients linked to grocery products yet"
              : `${linkedCount} ingredient${linkedCount !== 1 ? "s" : ""} linked · ${
                  alerts.length === 0
                    ? "no unread changes"
                    : `${alerts.length} unread change${alerts.length !== 1 ? "s" : ""}`
                }`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="btn-ghost text-sm"
          >
            {sync.isPending ? "Checking…" : "⟳ Check now"}
          </button>
          {alerts.length > 0 && (
            <button
              onClick={() => dismissAll.mutate()}
              disabled={dismissAll.isPending}
              className="btn-ghost text-sm"
            >
              Dismiss all
            </button>
          )}
        </div>
      </div>

      {/* Auto-sync settings card */}
      <div className="card px-6 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-200">Automatic price updates</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Checks Kassal.app for price changes while the app is open
            </p>
          </div>
          {/* Toggle switch */}
          <button
            onClick={toggleAuto}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              settings.autoEnabled ? "bg-brand-500" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.autoEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {settings.autoEnabled && (
          <div className="flex items-center gap-3 pt-1 border-t border-gray-800">
            <p className="text-sm text-gray-400">Check frequency:</p>
            <div className="flex gap-2 flex-wrap">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setInterval_(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    settings.intervalHours === opt.value
                      ? "bg-brand-500/30 text-brand-400 border border-brand-500/40"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300 border border-transparent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {settings.lastSyncAt && (
          <p className="text-xs text-gray-600">
            Last checked: {timeAgo(settings.lastSyncAt)}
          </p>
        )}
      </div>

      {/* Sync result flash */}
      {sync.data && (
        <div className="card px-5 py-3 text-sm text-gray-400">
          Checked {sync.data.checked} linked ingredient{sync.data.checked !== 1 ? "s" : ""} —{" "}
          {sync.data.updated === 0
            ? "no price changes found."
            : `${sync.data.updated} price${sync.data.updated !== 1 ? "s" : ""} updated.`}
        </div>
      )}

      {/* No linked ingredients hint */}
      {linkedCount === 0 && !isLoading && (
        <div className="card p-10 text-center text-gray-600">
          <p className="text-4xl mb-3">🔗</p>
          <p className="font-medium text-gray-400">No ingredients linked yet</p>
          <p className="text-sm mt-1">
            Go to <a href="/ingredients" className="text-brand-400 hover:underline">Ingredients</a> and
            click <strong className="text-gray-400">Link price</strong> on each ingredient to connect
            it to a grocery product.
          </p>
        </div>
      )}

      {/* Alert list */}
      {linkedCount > 0 && (
        isLoading ? (
          <div className="card p-10 text-center text-gray-600">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="card p-10 text-center text-gray-600">
            <p className="text-4xl mb-3">🔔</p>
            <p className="font-medium">All clear</p>
            <p className="text-sm mt-1">Price changes will appear here automatically.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-gray-800">
              {alerts.map((alert) => {
                const { pct, up } = priceDiff(alert.oldPriceNok, alert.newPriceNok);
                return (
                  <li key={alert.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-100">{alert.ingredientName}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {alert.newStore}
                        {alert.oldStore && alert.oldStore !== alert.newStore && (
                          <span className="text-gray-600"> (was {alert.oldStore})</span>
                        )}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-gray-500 line-through text-sm">
                          {formatPrice(alert.oldPriceNok)}
                        </span>
                        <span className="text-gray-100 font-semibold">
                          {formatPrice(alert.newPriceNok)}
                        </span>
                        <span className={`badge ${up ? "bg-red-950/60 text-red-300" : "bg-emerald-950/60 text-emerald-300"}`}>
                          {up ? "▲" : "▼"} {Math.abs(Number(pct))}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(alert.detectedAt).toLocaleDateString("nb-NO", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <button
                      onClick={() => dismiss.mutate(alert.id)}
                      className="text-gray-700 hover:text-gray-400 transition-colors text-lg leading-none shrink-0"
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
