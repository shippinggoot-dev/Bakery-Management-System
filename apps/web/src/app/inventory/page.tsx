"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

type StockStatus = "ok" | "low" | "critical" | "out";

interface StockLevel {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  parLevel: number | null;
  reorderPoint: number | null;
  status: StockStatus;
  lots: {
    id: string;
    lotNumber: string | null;
    quantity: number;
    expiryDate: string | null;
    receivedAt: Date;
  }[];
}

const STATUS_BAR: Record<StockStatus, string>   = {
  ok:       "bg-emerald-500",
  low:      "bg-amber-500",
  critical: "bg-red-500",
  out:      "bg-gray-600",
};

const STATUS_BADGE: Record<StockStatus, string> = {
  ok:       "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  low:      "bg-amber-900/50 text-amber-300 border-amber-700",
  critical: "bg-red-900/50 text-red-300 border-red-700",
  out:      "bg-gray-800 text-gray-400 border-gray-600",
};

const STATUS_ROW: Record<StockStatus, string> = {
  ok:       "",
  low:      "bg-amber-950/10",
  critical: "bg-red-950/20",
  out:      "bg-red-950/30",
};

function BarFill({ current, par }: { current: number; par: number | null }) {
  if (!par || par <= 0) return null;
  const pct = Math.min(100, Math.round((current / par) * 100));
  const status: StockStatus = pct <= 0 ? "out" : pct < 50 ? "low" : "ok";
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all ${STATUS_BAR[status]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

export default function InventoryPage() {
  const t = useTranslations("inventory");
  const utils = api.useUtils();
  const { data: levels = [], isLoading } = api.inventory.getStockLevels.useQuery(undefined);

  const [filter, setFilter] = useState<StockStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [liveFlash, setLiveFlash] = useState<string | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusLabels: Record<StockStatus, string> = {
    ok:       t("statusOk"),
    low:      t("statusLow"),
    critical: t("statusCritical"),
    out:      t("statusOut"),
  };

  // SSE live updates
  useEffect(() => {
    const evtSource = new EventSource("/api/inventory/stream");
    evtSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { type: string; ingredientId?: string };
        utils.inventory.getStockLevels.invalidate();
        if (payload.ingredientId) {
          setLiveFlash(payload.ingredientId);
          if (flashRef.current) clearTimeout(flashRef.current);
          flashRef.current = setTimeout(() => setLiveFlash(null), 2000);
        }
      } catch { /* not a JSON data event (comment/heartbeat) */ }
    };
    return () => evtSource.close();
  }, [utils]);

  const filtered = levels.filter((l) => {
    if (filter !== "all" && l.status !== filter) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all:      levels.length,
    ok:       levels.filter((l) => l.status === "ok").length,
    low:      levels.filter((l) => l.status === "low").length,
    critical: levels.filter((l) => l.status === "critical").length,
    out:      levels.filter((l) => l.status === "out").length,
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <div className="flex gap-2">
            <Link
              href="/inventory/receive"
              className="px-3 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 text-sm font-medium hover:bg-brand-500/30 transition-colors"
            >
              {t("receiveBtn")}
            </Link>
            <Link
              href="/inventory/produce"
              className="px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-medium hover:bg-purple-500/30 transition-colors"
            >
              {t("recordBatch")}
            </Link>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(["all", "critical", "low", "ok", "out"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === s
                  ? s === "all"
                    ? "bg-gray-700 text-gray-100 border-gray-600"
                    : `${STATUS_BADGE[s]} border`
                  : "bg-transparent text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {s === "all" ? t("filterAll") : statusLabels[s]}
              <span className="ml-1 opacity-70">{counts[s]}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700 text-sm placeholder-gray-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* ── Quick-action cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 lg:px-8 lg:grid-cols-4">
        <Link href="/inventory/waste" className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition-colors">
          <div className="text-2xl mb-1">🗑️</div>
          <div className="text-sm font-semibold text-gray-200">{t("logWaste")}</div>
          <div className="text-xs text-gray-500">{t("logWasteDesc")}</div>
        </Link>
        <Link href="/inventory/report" className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition-colors">
          <div className="text-2xl mb-1">📊</div>
          <div className="text-sm font-semibold text-gray-200">{t("wasteReport")}</div>
          <div className="text-xs text-gray-500">{t("wasteReportDesc")}</div>
        </Link>
        <Link href="/purchase-orders" className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition-colors">
          <div className="text-2xl mb-1">📦</div>
          <div className="text-sm font-semibold text-gray-200">{t("viewOrders")}</div>
          <div className="text-xs text-gray-500">{t("viewOrdersDesc")}</div>
        </Link>
        <Link href="/inventory/produce" className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition-colors">
          <div className="text-2xl mb-1">🧁</div>
          <div className="text-sm font-semibold text-gray-200">{t("produce")}</div>
          <div className="text-xs text-gray-500">{t("produceDesc")}</div>
        </Link>
      </div>

      {/* ── Stock list ────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 lg:px-8 space-y-2">
        {isLoading && (
          <div className="text-center text-gray-600 py-12">{t("loadingStock")}</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center text-gray-600 py-12">
            {search ? t("noMatch") : t("noIngredients")}
          </div>
        )}

        {filtered.map((item) => {
          const isExpanded = expanded === item.ingredientId;
          const isFlashing = liveFlash === item.ingredientId;

          // Find nearest expiry from available lots
          const nearestExpiry = item.lots
            .filter((l) => l.expiryDate)
            .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))[0];
          const daysLeft = nearestExpiry ? daysUntil(nearestExpiry.expiryDate!) : null;

          return (
            <div
              key={item.ingredientId}
              className={`rounded-xl border transition-all duration-300 ${
                isFlashing ? "border-brand-500/60 shadow-lg shadow-brand-500/10" : "border-gray-800"
              } ${STATUS_ROW[item.status]} bg-gray-900`}
            >
              {/* Main row — big touch target */}
              <button
                className="w-full text-left px-4 py-4 flex items-center gap-4"
                onClick={() => setExpanded(isExpanded ? null : item.ingredientId)}
              >
                {/* Status dot */}
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_BAR[item.status]}`} />

                {/* Name + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{item.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE[item.status]}`}>
                      {statusLabels[item.status]}
                    </span>
                    {daysLeft !== null && daysLeft <= 7 && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        daysLeft <= 0 ? "bg-red-900/50 text-red-300 border-red-700"
                        : daysLeft <= 3 ? "bg-orange-900/50 text-orange-300 border-orange-700"
                        : "bg-yellow-900/50 text-yellow-300 border-yellow-700"
                      }`}>
                        {daysLeft <= 0 ? t("expired") : t("expiresInDays").replace("{days}", String(daysLeft))}
                      </span>
                    )}
                  </div>
                  <BarFill current={item.currentStock} par={item.parLevel} />
                </div>

                {/* Stock number */}
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm font-bold">
                    {item.currentStock % 1 === 0 ? item.currentStock : item.currentStock.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">{item.unit}</div>
                </div>
              </button>

              {/* Expanded lot detail */}
              {isExpanded && (
                <div className="border-t border-gray-800 px-4 py-3 space-y-3">
                  <div className="flex gap-6 text-xs text-gray-500">
                    {item.parLevel && (
                      <span>{t("par").replace("{value}", String(item.parLevel)).replace("{unit}", item.unit)}</span>
                    )}
                    {item.reorderPoint && (
                      <span>{t("reorderAt").replace("{value}", String(item.reorderPoint)).replace("{unit}", item.unit)}</span>
                    )}
                  </div>

                  {item.lots.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1">{t("activeLots")}</div>
                      {item.lots.map((lot) => {
                        const d = lot.expiryDate ? daysUntil(lot.expiryDate) : null;
                        return (
                          <div key={lot.id} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2 text-xs">
                            <div className="text-gray-400">
                              {lot.lotNumber ? <span className="font-mono text-gray-300">{lot.lotNumber}</span> : <span className="italic text-gray-600">{t("noLotNumber")}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              {lot.expiryDate && (
                                <span className={d !== null && d <= 3 ? "text-red-400" : "text-gray-400"}>
                                  {t("expDate").replace("{date}", lot.expiryDate)}
                                </span>
                              )}
                              <span className="font-mono font-semibold text-gray-200">
                                {lot.quantity % 1 === 0 ? lot.quantity : lot.quantity.toFixed(1)} {item.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 italic">{t("noIngredients")}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/inventory/receive?ingredientId=${item.ingredientId}`}
                      className="flex-1 text-center py-2 rounded-lg bg-brand-500/20 text-brand-400 text-xs font-semibold border border-brand-500/30 hover:bg-brand-500/30 transition-colors"
                    >
                      {t("receiveDelivery")}
                    </Link>
                    <Link
                      href={`/inventory/waste?ingredientId=${item.ingredientId}`}
                      className="flex-1 text-center py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold border border-gray-700 hover:bg-gray-700 transition-colors"
                    >
                      {t("logWaste")}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
