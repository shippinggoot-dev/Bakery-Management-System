"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";

const PERIODS = [
  { label: "7 days",  days: 7  },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function fmt(n: number) {
  return `kr${n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-brand-400 font-medium leading-tight">{label}</p>
      <p className="text-3xl font-bold text-brand-700 leading-none">{value}</p>
      {sub && <p className="text-xs text-brand-300 mt-1">{sub}</p>}
    </div>
  );
}

// Tiny bar chart
function MiniBarChart({ series }: { series: { date: string; revenue: number; orders: number }[] }) {
  const max = Math.max(...series.map((s) => s.revenue), 1);
  const toShow = series.slice(-30); // last 30 days
  return (
    <div className="flex items-end gap-0.5 h-20">
      {toShow.map((s) => {
        const pct = Math.max(2, (s.revenue / max) * 100);
        return (
          <div key={s.date} className="flex-1 flex flex-col items-center group relative">
            <div
              className="w-full rounded-t bg-brand-400 hover:bg-brand-600 transition-colors cursor-pointer"
              style={{ height: `${pct}%` }}
            />
            {/* Tooltip */}
            <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-[9px] rounded px-1.5 py-0.5 shadow z-10">
              {s.date}<br />{fmt(s.revenue)}<br />{s.orders} order{s.orders !== 1 ? "s" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending:     "bg-rose-100 text-brand-600",
  planned:     "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed:   "bg-emerald-100 text-emerald-700",
  cancelled:   "bg-gray-100 text-gray-500",
};

export default function SalesPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = api.sales.getDashboard.useQuery({ daysBack: days });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-title">Sales Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customer order revenue and trends</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === p.days
                  ? "bg-brand-600 text-white border-brand-600"
                  : "border-rose-200 text-brand-600 hover:bg-rose-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-brand-300 py-12 text-center">Loading…</div>
      ) : !data ? null : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Revenue"     value={fmt(data.totalRevenue)}       sub={`${data.from} — ${data.to}`} />
            <StatCard label="Total Orders"      value={String(data.totalOrders)}     sub="customer orders" />
            <StatCard label="Avg Order Value"   value={fmt(data.averageOrderValue)}  />
            <StatCard label="Paid"              value={String(data.paidOrders)}      sub={`${data.pendingOrders} pending`} />
          </div>

          {/* Revenue chart */}
          {data.dailySeries.length > 0 && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="section-title">Daily Revenue</h3>
                <span className="text-xs text-brand-300">
                  {data.dailySeries.filter((s) => s.revenue > 0).length} days with sales
                </span>
              </div>
              <MiniBarChart series={data.dailySeries} />
              {/* X-axis labels: first and last */}
              {data.dailySeries.length > 1 && (
                <div className="flex justify-between text-[10px] text-brand-300">
                  <span>{data.dailySeries[0]!.date}</span>
                  <span>{data.dailySeries[data.dailySeries.length - 1]!.date}</span>
                </div>
              )}
            </div>
          )}

          {/* Status breakdown + Top recipes side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Order status breakdown */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-rose-100">
                <h3 className="section-title">Orders by Status</h3>
              </div>
              <div className="divide-y divide-rose-50">
                {Object.entries(data.statusCounts).length === 0 ? (
                  <p className="px-5 py-6 text-sm text-brand-300 text-center">No orders in this period.</p>
                ) : (
                  Object.entries(data.statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"}`}>
                        {status}
                      </span>
                      <span className="font-semibold text-gray-700">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top recipes */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-rose-100">
                <h3 className="section-title">Top Recipes by Revenue</h3>
                <Link href="/planner" className="text-xs text-brand-500 hover:text-brand-700 font-medium">Orders →</Link>
              </div>
              <div className="divide-y divide-rose-50">
                {data.topRecipes.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-brand-300 text-center">
                    No revenue data — add a sale price to your orders.
                  </p>
                ) : data.topRecipes.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-xs font-bold text-brand-300 w-4 flex-shrink-0">{i + 1}</span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-brand-400 flex-shrink-0">{r.count}×</span>
                    <span className="text-sm font-semibold text-brand-700 flex-shrink-0">{fmt(r.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Empty state hint when no sale prices set */}
          {data.totalRevenue === 0 && data.totalOrders > 0 && (
            <div className="card p-5 bg-amber-50 border-amber-200 text-center space-y-2">
              <p className="text-sm font-semibold text-amber-700">No revenue data yet</p>
              <p className="text-xs text-amber-600">
                You have {data.totalOrders} order{data.totalOrders !== 1 ? "s" : ""} but none have a sale price set.
                Open an order in{" "}
                <Link href="/planner" className="underline">Customer Orders</Link>
                {" "}and add a sale price to start tracking revenue.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
