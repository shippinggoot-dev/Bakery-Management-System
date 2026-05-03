"use client";

import Link from "next/link";
import { api } from "@/trpc/react";

const NOK = new Intl.NumberFormat("nb-NO", {
  style:                 "currency",
  currency:              "NOK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function fmtNOK(value: number) { return NOK.format(value); }

const STOCK_DOT: Record<string, string> = {
  low:      "bg-amber-400",
  critical: "bg-red-500",
  out:      "bg-gray-400",
};
const STOCK_LABEL: Record<string, string> = {
  low:      "text-amber-700 bg-amber-50  border-amber-200",
  critical: "text-red-700   bg-red-50    border-red-200",
  out:      "text-gray-600  bg-gray-100  border-gray-200",
};

const SHIFT_ICON: Record<string, string>  = { morning: "🌅", afternoon: "☀️",  evening: "🌙" };
const SHIFT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

function ZoneHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-[0.12em] mb-3 select-none">
      {children}
    </h2>
  );
}

function TodayCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title:     string;
  href:      string;
  linkLabel: string;
  children:  React.ReactNode;
}) {
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        <Link
          href={href}
          prefetch={false}
          className="text-xs text-brand-500 hover:text-brand-700 font-medium flex-shrink-0 transition-colors"
        >
          {linkLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  caption,
}: {
  label:    string;
  value:    string;
  caption?: string;
}) {
  return (
    <div className="card px-5 py-4 flex flex-col gap-1">
      <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-brand-700 leading-none mt-1">{value}</p>
      {caption && <p className="text-xs text-brand-300 mt-1 leading-snug">{caption}</p>}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-pulse">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="h-4 bg-rose-100 rounded w-24" />
          <div className="h-8 bg-rose-100 rounded w-16" />
          <div className="h-3 bg-rose-100 rounded w-32" />
        </div>
      ))}
    </div>
  );
}

function WeekSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="card px-6 py-5 space-y-2">
        <div className="h-3 bg-rose-100 rounded w-16" />
        <div className="h-12 bg-rose-100 rounded w-48" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card px-5 py-4 space-y-2">
            <div className="h-3 bg-rose-100 rounded w-16" />
            <div className="h-6 bg-rose-100 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: today, isLoading: loadingToday } = api.dashboard.getTodaySummary.useQuery();
  const { data: week,  isLoading: loadingWeek  } = api.dashboard.getWeekSummary.useQuery();

  const showDeliveries = (today?.deliveriesToday.length ?? 0) > 0;
  const showBatches    = (today?.batchesToday.length    ?? 0) > 0;

  return (
    <div className="space-y-8 max-w-5xl">

      <section>
        <ZoneHeading>Today</ZoneHeading>

        {loadingToday ? <TodaySkeleton /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          <TodayCard title="Open tasks" href="/todos" linkLabel="All tasks →">
            <div>
              <p className="text-4xl font-bold text-brand-700 leading-none">
                {today?.tasks.count ?? 0}
              </p>
              <p className="text-xs text-brand-400 mt-1">
                {today?.tasks.count === 1 ? "task open" : "tasks open"}
              </p>
            </div>
            {today && today.tasks.titles.length > 0 ? (
              <ul className="space-y-2 border-t border-rose-100 pt-3">
                {today.tasks.titles.map((title, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-300 flex-shrink-0" />
                    <span className="truncate">{title}</span>
                  </li>
                ))}
                {today.tasks.count > 3 && (
                  <li className="text-xs text-brand-300 pl-3.5">
                    +{today.tasks.count - 3} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-brand-300 border-t border-rose-100 pt-3">
                All done — nothing open
              </p>
            )}
          </TodayCard>

          <TodayCard title="Stock alerts" href="/inventory" linkLabel="Inventory →">
            {today && today.stockAlerts.length > 0 ? (
              <ul className="space-y-2.5">
                {today.stockAlerts.map((s) => (
                  <li key={s.ingredientId} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STOCK_DOT[s.status] ?? "bg-gray-400"}`} />
                    <span className="text-sm text-gray-700 flex-1 truncate">{s.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${STOCK_LABEL[s.status] ?? "text-gray-600 bg-gray-100 border-gray-200"}`}>
                      {s.currentStock.toFixed(1)} {s.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-brand-300">All stock levels OK</p>
            )}
          </TodayCard>

          {showDeliveries && (
            <TodayCard title="Deliveries today" href="/purchase-orders" linkLabel="Orders →">
              <ul className="space-y-3">
                {today!.deliveriesToday.map((d) => (
                  <li key={d.id}>
                    <p className="text-sm font-semibold text-gray-800">{d.supplier.name}</p>
                    {d.orderNumber && (
                      <p className="text-xs text-brand-400 mt-0.5">{d.orderNumber}</p>
                    )}
                    <span className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                      d.status === "confirmed"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            </TodayCard>
          )}

          {showBatches && (
            <TodayCard title="Batches to bake" href="/production" linkLabel="Production →">
              <ul className="space-y-3">
                {today!.batchesToday.map((b) => (
                  <li key={b.id} className="flex items-start gap-2.5">
                    <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                      {SHIFT_ICON[b.shift] ?? "🍳"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {b.recipeName ?? b.recipe?.name ?? "—"}
                      </p>
                      <p className="text-xs text-brand-400 mt-0.5">
                        {SHIFT_LABEL[b.shift] ?? b.shift} · {b.batchCount}× batch
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </TodayCard>
          )}
        </div>
        )}
      </section>

      <section>
        <ZoneHeading>This week</ZoneHeading>

        {loadingWeek ? <WeekSkeleton /> : (
        <div className="space-y-3">

          <div className="card px-6 py-5">
            <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">
              Revenue
            </p>
            {week?.weekRevenue ? (
              <>
                <p className="text-5xl sm:text-6xl font-bold text-brand-700 leading-none mt-2 tabular-nums">
                  {fmtNOK(week.weekRevenue)}
                </p>
                <p className="text-xs text-brand-300 mt-2">combined orders &amp; POS sales</p>
              </>
            ) : (
              <>
                <p className="text-5xl sm:text-6xl font-bold text-brand-300 leading-none mt-2">—</p>
                <p className="text-xs text-brand-300 mt-2">
                  No data yet · Add sale prices to orders or record a POS sale to track revenue
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Orders"
              value={week?.orderCount ? String(week.orderCount) : "—"}
              caption={
                week?.orderCount
                  ? week.orderCount === 1 ? "customer order" : "customer orders"
                  : "No orders this week"
              }
            />
            <KpiCard
              label="Top seller"
              value={week?.topSeller?.name ?? "—"}
              caption={
                week?.topSeller
                  ? `${week.topSeller.totalQty % 1 === 0
                      ? week.topSeller.totalQty
                      : week.topSeller.totalQty.toFixed(1)} units ordered`
                  : "No orders linked to recipes yet"
              }
            />
            <KpiCard
              label="Waste logged"
              value={week?.wasteEventCount ? String(week.wasteEventCount) : "—"}
              caption={
                week?.wasteEventCount
                  ? week.wasteEventCount === 1 ? "event this week" : "events this week"
                  : "No waste logged this week"
              }
            />
          </div>
        </div>
        )}
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "New order",       href: "/purchase-orders" },
          { label: "Cost check",      href: "/ingredients"     },
          { label: "Customers",       href: "/customers"       },
          { label: "Content planner", href: "/social"          },
        ] as const).map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="bg-white border border-rose-200 rounded-2xl px-4 py-3 text-sm font-medium text-brand-600 hover:bg-rose-50 hover:border-brand-300 transition-all text-center shadow-sm"
          >
            {label}
          </Link>
        ))}
      </div>

    </div>
  );
}
