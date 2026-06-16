"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  onDismiss,
  dismissLabel,
  children,
}: {
  title:         string;
  href:          string;
  linkLabel:     string;
  /** Optional dismiss action — renders an X button next to the corner link. */
  onDismiss?:    () => void;
  dismissLabel?: string;
  children:      React.ReactNode;
}) {
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={href}
            prefetch={false}
            className="text-xs text-brand-500 hover:text-brand-700 font-medium transition-colors"
          >
            {linkLabel}
          </Link>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className="text-gray-300 hover:text-gray-500 text-base leading-none transition-colors"
            >
              ✕
            </button>
          )}
        </div>
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

const STOCKTAKE_NUDGE_THRESHOLD_DAYS = 30;

export default function DashboardPage() {
  const t       = useTranslations("dashboard");
  const utils   = api.useUtils();
  const { data: today,        isLoading: loadingToday } = api.dashboard.getTodaySummary.useQuery();
  const { data: week,         isLoading: loadingWeek  } = api.dashboard.getWeekSummary.useQuery();
  const { data: lastStocktake }                         = api.dashboard.getLastStocktake.useQuery();
  const { data: tomorrow }                              = api.dashboard.getTomorrowPreview.useQuery();
  const { data: shopify }                               = api.dashboard.getShopifyActivity.useQuery();
  const { data: prefs }                                 = api.preferences.get.useQuery();
  const { data: socialPlannedToday = 0 }                = api.socialPosts.todayPlannedCount.useQuery();

  const showShopifyTile = prefs?.dashboardShowShopifyTile ?? true;

  const updatePrefs = api.preferences.update.useMutation({
    onSuccess: () => utils.preferences.get.invalidate(),
  });

  const showDeliveries = (today?.deliveriesToday.length ?? 0) > 0;

  // Show nudge if there's never been a stocktake, or it's been a while
  const stocktakeOverdue =
    lastStocktake?.daysSince === null ||
    (lastStocktake?.daysSince !== undefined &&
     lastStocktake?.daysSince !== null &&
     lastStocktake.daysSince >= STOCKTAKE_NUDGE_THRESHOLD_DAYS);

  const [stocktakeDismissed, setStocktakeDismissed] = useState(false);

  return (
    <div className="space-y-8 max-w-5xl">

      {/* Social reminder — posts the user planned for today, awaiting hand-off
          to whichever network they use. Drives them straight to /social where
          they can copy the caption and download the image. */}
      {socialPlannedToday > 0 && (
        <div className="card p-4 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">📣</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-purple-800 text-sm">
              {socialPlannedToday === 1
                ? t("socialPlanned_one")
                : t("socialPlanned_other", { count: socialPlannedToday })}
            </p>
            <p className="text-xs text-purple-700 mt-0.5">
              {t("socialPlannedHint")}
            </p>
          </div>
          <Link
            href="/social"
            prefetch={false}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors flex-shrink-0"
          >
            {t("socialPlannedCta")} →
          </Link>
        </div>
      )}

      {/* Stocktake nudge — appears when overdue or never done, dismissable */}
      {stocktakeOverdue && !stocktakeDismissed && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-800 text-sm">
              {lastStocktake?.lastAt
                ? `Last stocktake: ${lastStocktake.daysSince} days ago`
                : "No stocktake on record yet"}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Stock counts drift over time. A quick recount keeps the system honest.
            </p>
          </div>
          <Link
            href="/inventory/stocktake"
            prefetch={false}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex-shrink-0"
          >
            Start stocktake →
          </Link>
          <button
            onClick={() => setStocktakeDismissed(true)}
            className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0"
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

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

          {/* Slot 3 — Batches today (permanent, with empty state) */}
          <TodayCard title="Batches to bake" href="/production" linkLabel="Production →">
            {today && today.batchesToday.length > 0 ? (
              <ul className="space-y-3">
                {today.batchesToday.map((b) => (
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
            ) : (
              <p className="text-sm text-brand-300">{t("batchesEmpty")}</p>
            )}
          </TodayCard>

          {/* Slot 4 — Shopify (offer or activity) OR Tomorrow when dismissed */}
          {showShopifyTile ? (
            shopify?.isConnected ? (
              <TodayCard title={t("shopifyTitle")} href="/settings" linkLabel={t("shopifyLink")}>
                <div>
                  <p className="text-4xl font-bold text-brand-700 leading-none">
                    {shopify.ordersToday}
                  </p>
                  <p className="text-xs text-brand-400 mt-1">
                    {shopify.ordersToday === 1 ? t("shopifyOrdersToday_one") : t("shopifyOrdersToday_other")}
                  </p>
                </div>
                <div className="border-t border-rose-100 pt-3 space-y-1.5">
                  {shopify.pendingReview > 0 ? (
                    <p className="text-sm text-amber-700">
                      <span className="font-semibold">{shopify.pendingReview}</span>{" "}
                      {shopify.pendingReview === 1 ? t("shopifyNeedsReview_one") : t("shopifyNeedsReview_other")}
                    </p>
                  ) : (
                    <p className="text-sm text-brand-300">{t("shopifyAllLinked")}</p>
                  )}
                  {shopify.shopName && (
                    <p className="text-xs text-gray-400 truncate">
                      {t("shopifyConnectedTo", { name: shopify.shopName })}
                    </p>
                  )}
                </div>
              </TodayCard>
            ) : (
              <TodayCard
                title={t("shopifyTitle")}
                href="/settings"
                linkLabel={t("shopifySetUp")}
                onDismiss={() => updatePrefs.mutate({ dashboardShowShopifyTile: false })}
                dismissLabel={t("shopifyDismiss")}
              >
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("shopifyOptional")}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{t("shopifyOffer")}</p>
              </TodayCard>
            )
          ) : (
            <TodayCard title={t("tomorrowTitle")} href="/planner" linkLabel={t("tomorrowLink")}>
              <div className="space-y-2.5">
                <div>
                  <p className="text-4xl font-bold text-brand-700 leading-none">
                    {tomorrow?.cakeOrderCount ?? 0}
                  </p>
                  <p className="text-xs text-brand-400 mt-1">
                    {(tomorrow?.cakeOrderCount ?? 0) === 1
                      ? t("tomorrowCakeOrders_one")
                      : t("tomorrowCakeOrders_other")}
                  </p>
                </div>
                <div className="border-t border-rose-100 pt-2.5">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">{tomorrow?.batchCount ?? 0}</span>{" "}
                    {(tomorrow?.batchCount ?? 0) === 1
                      ? t("tomorrowBatches_one")
                      : t("tomorrowBatches_other")}
                  </p>
                </div>
              </div>
            </TodayCard>
          )}

          {/* Conditional 5th tile — Deliveries (only on days with incoming POs) */}
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

      {/* Quiet discovery line for optional integrations — not central to the
          product, just a low-key hint that they exist for those who want them. */}
      <p className="text-center text-xs text-gray-400 pt-2">
        {t.rich("integrationsHint", {
          link: (chunks) => (
            <Link
              href="/settings"
              prefetch={false}
              className="text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

    </div>
  );
}
