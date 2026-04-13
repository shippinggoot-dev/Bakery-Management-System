"use client";

import { api } from "@/trpc/react";

function formatPrice(nok: string) {
  return `kr ${parseFloat(nok).toFixed(2)}`;
}

function priceDiff(oldP: string, newP: string) {
  const diff = parseFloat(newP) - parseFloat(oldP);
  const pct  = ((diff / parseFloat(oldP)) * 100).toFixed(1);
  return { diff, pct, up: diff > 0 };
}

export default function PriceAlertsPage() {
  const utils = api.useUtils();

  const { data: alerts = [], isLoading } = api.priceSync.getAlerts.useQuery();

  const dismiss    = api.priceSync.dismissAlert.useMutation({ onSuccess: () => utils.priceSync.getAlerts.invalidate() });
  const dismissAll = api.priceSync.dismissAll.useMutation({  onSuccess: () => utils.priceSync.getAlerts.invalidate() });

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Price Alerts</h2>
          <p className="text-gray-500 mt-1">
            {alerts.length === 0
              ? "No unread price changes"
              : `${alerts.length} unread change${alerts.length !== 1 ? "s" : ""}`}
          </p>
        </div>
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

      {/* Alert list */}
      {isLoading ? (
        <div className="card p-10 text-center text-gray-600">Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="card p-10 text-center text-gray-600">
          <p className="text-4xl mb-3">🔔</p>
          <p className="font-medium">All clear</p>
          <p className="text-sm mt-1">
            Price changes recorded via the CSV import script will appear here.
          </p>
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
      )}
    </div>
  );
}
