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

const STATUS_DOT: Record<StockStatus, string> = {
  ok:       "bg-emerald-500",
  low:      "bg-amber-400",
  critical: "bg-red-500",
  out:      "bg-gray-400",
};

const STATUS_BADGE: Record<StockStatus, string> = {
  ok:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  low:      "bg-amber-50  text-amber-700  border-amber-200",
  critical: "bg-red-50    text-red-700    border-red-200",
  out:      "bg-gray-100  text-gray-600   border-gray-200",
};

const STATUS_ROW: Record<StockStatus, string> = {
  ok:       "",
  low:      "border-l-4 border-l-amber-300",
  critical: "border-l-4 border-l-red-400",
  out:      "border-l-4 border-l-gray-300",
};

const FILTER_ACTIVE: Record<StockStatus | "all", string> = {
  all:      "bg-brand-600 text-white border-brand-600",
  ok:       "bg-emerald-500 text-white border-emerald-500",
  low:      "bg-amber-400 text-white border-amber-400",
  critical: "bg-red-500 text-white border-red-500",
  out:      "bg-gray-400 text-white border-gray-400",
};

function BarFill({ current, par }: { current: number; par: number | null }) {
  if (!par || par <= 0) return null;
  const pct = Math.min(100, Math.round((current / par) * 100));
  const color = pct <= 0 ? "bg-gray-300" : pct < 50 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="w-full h-1.5 bg-rose-100 rounded-full overflow-hidden mt-1.5">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
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

  const [filter, setFilter]     = useState<StockStatus | "all">("all");
  const [search, setSearch]     = useState("");
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
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">{t("title")}</h1>
        <div className="flex gap-2">
          <Link href="/inventory/receive" className="btn-primary">
            {t("receiveBtn")}
          </Link>
          <Link href="/inventory/produce" className="btn bg-white border border-rose-200 text-brand-600 hover:bg-rose-50">
            {t("recordBatch")}
          </Link>
        </div>
      </div>

      {/* ── Quick-action cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/inventory/waste",   icon: "🗑️",  label: t("logWaste"),    desc: t("logWasteDesc")    },
          { href: "/inventory/report",  icon: "📊",  label: t("wasteReport"), desc: t("wasteReportDesc") },
          { href: "/purchase-orders",   icon: "📦",  label: t("viewOrders"),  desc: t("viewOrdersDesc")  },
          { href: "/inventory/produce", icon: "🧁",  label: t("produce"),     desc: t("produceDesc")     },
        ].map(({ href, icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="card p-4 hover:border-brand-200 hover:shadow-md transition-all flex flex-col gap-1"
          >
            <span className="text-2xl leading-none">{icon}</span>
            <span className="text-sm font-semibold text-gray-800 mt-1">{label}</span>
            <span className="text-xs text-brand-400">{desc}</span>
          </Link>
        ))}
      </div>

      {/* ── Filters + search ─────────────────────────────────────────────── */}
      <div className="card p-4 flex flex-col gap-3">
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {(["all", "critical", "low", "ok", "out"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === s
                  ? FILTER_ACTIVE[s]
                  : "bg-white text-gray-500 border-rose-200 hover:border-brand-300 hover:text-gray-700"
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
          className="form-input"
        />
      </div>

      {/* ── Stock list ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {isLoading && (
          <p className="text-center text-brand-300 py-12">{t("loadingStock")}</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-brand-300 py-12">
            {search ? t("noMatch") : t("noIngredients")}
          </p>
        )}

        {filtered.map((item) => {
          const isExpanded = expanded === item.ingredientId;
          const isFlashing = liveFlash === item.ingredientId;

          const nearestExpiry = item.lots
            .filter((l) => l.expiryDate)
            .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))[0];
          const daysLeft = nearestExpiry ? daysUntil(nearestExpiry.expiryDate!) : null;

          return (
            <div
              key={item.ingredientId}
              className={`card overflow-hidden transition-all duration-300 ${STATUS_ROW[item.status]} ${
                isFlashing ? "ring-2 ring-brand-300 shadow-md" : ""
              }`}
            >
              {/* Main row */}
              <button
                className="w-full text-left px-5 py-4 flex items-center gap-4"
                onClick={() => setExpanded(isExpanded ? null : item.ingredientId)}
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[item.status]}`} />

                {/* Name + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800 truncate">{item.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[item.status]}`}>
                      {statusLabels[item.status]}
                    </span>
                    {daysLeft !== null && daysLeft <= 7 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                        daysLeft <= 0  ? "bg-red-50 text-red-700 border-red-200"
                        : daysLeft <= 3 ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-yellow-50 text-yellow-700 border-yellow-200"
                      }`}>
                        {daysLeft <= 0 ? t("expired") : t("expiresInDays").replace("{days}", String(daysLeft))}
                      </span>
                    )}
                  </div>
                  <BarFill current={item.currentStock} par={item.parLevel} />
                </div>

                {/* Stock number */}
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm font-bold text-brand-700">
                    {item.currentStock % 1 === 0 ? item.currentStock : item.currentStock.toFixed(1)}
                  </div>
                  <div className="text-xs text-brand-400">{item.unit}</div>
                </div>

                {/* Chevron */}
                <div className={`text-brand-300 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded lot detail */}
              {isExpanded && (
                <div className="border-t border-rose-100 px-5 py-4 space-y-3 bg-rose-50/40">
                  {(item.parLevel || item.reorderPoint) && (
                    <div className="flex gap-6 text-xs text-brand-400">
                      {item.parLevel && (
                        <span>{t("par").replace("{value}", String(item.parLevel)).replace("{unit}", item.unit)}</span>
                      )}
                      {item.reorderPoint && (
                        <span>{t("reorderAt").replace("{value}", String(item.reorderPoint)).replace("{unit}", item.unit)}</span>
                      )}
                    </div>
                  )}

                  {item.lots.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">
                        {t("activeLots")}
                      </p>
                      {item.lots.map((lot) => {
                        const d = lot.expiryDate ? daysUntil(lot.expiryDate) : null;
                        return (
                          <div
                            key={lot.id}
                            className="flex items-center justify-between bg-white border border-rose-100 rounded-xl px-3 py-2 text-xs"
                          >
                            <span className="text-gray-500 font-mono">
                              {lot.lotNumber ?? <span className="italic text-brand-300">{t("noLotNumber")}</span>}
                            </span>
                            <div className="flex items-center gap-3">
                              {lot.expiryDate && (
                                <span className={d !== null && d <= 3 ? "text-red-600" : "text-brand-400"}>
                                  {t("expDate").replace("{date}", lot.expiryDate)}
                                </span>
                              )}
                              <span className="font-mono font-semibold text-gray-800">
                                {lot.quantity % 1 === 0 ? lot.quantity : lot.quantity.toFixed(1)} {item.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-brand-300 italic">{t("noIngredients")}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/inventory/receive?ingredientId=${item.ingredientId}`}
                      className="flex-1 text-center py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                    >
                      {t("receiveDelivery")}
                    </Link>
                    <Link
                      href={`/inventory/waste?ingredientId=${item.ingredientId}`}
                      className="flex-1 text-center py-2 rounded-xl bg-white border border-rose-200 text-brand-600 text-xs font-semibold hover:bg-rose-50 transition-colors"
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
