"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

const TIER_BADGE: Record<string, string> = {
  bronze: "bg-amber-900/50 text-amber-300 border-amber-700",
  silver: "bg-gray-700/50 text-gray-300 border-gray-600",
  gold:   "bg-yellow-900/50 text-yellow-300 border-yellow-700",
};

type SortKey = "name" | "points" | "lastVisit" | "spend";
type TierFilter = "bronze" | "silver" | "gold" | "";

export default function CustomersPage() {
  const t = useTranslations("customers");
  const [search,    setSearch]    = useState("");
  const [tier,      setTier]      = useState<TierFilter>("");
  const [sort,      setSort]      = useState<SortKey>("name");
  const [dietaryReq, setDietaryReq] = useState("");

  const { data: customers = [], isLoading } = api.customers.getAll.useQuery({
    search:    search || undefined,
    tier:      (tier as "bronze" | "silver" | "gold") || undefined,
    dietaryReq: dietaryReq || undefined,
    sort,
    limit: 100,
  });

  const totalPoints = customers.reduce((s, c) => s + c.points, 0);
  const loyalty     = customers.filter((c) => c.loyaltyOptIn).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">{t("title")}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {customers.length} {t("total")} · {loyalty} {t("loyaltyMembers")}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/customers/lookup"
              className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              {t("posLookup")}
            </Link>
            <Link
              href="/customers/register"
              className="px-3 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 text-sm font-medium hover:bg-brand-500/30 transition-colors"
            >
              {t("register")}
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar text-xs">
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-800/50">
            🥉 {customers.filter((c) => c.tier === "bronze").length} Bronze
          </div>
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-700/30 text-gray-300 border border-gray-600/50">
            🥈 {customers.filter((c) => c.tier === "silver").length} Silver
          </div>
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800/50">
            🥇 {customers.filter((c) => c.tier === "gold").length} Gold
          </div>
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 text-gray-400 border border-gray-800">
            {totalPoints.toLocaleString()} pts outstanding
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pt-4 lg:px-8 flex flex-col gap-2">
        <input
          type="search"
          placeholder="Search name, phone, email, card #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-gray-800/60 border border-gray-700 text-sm placeholder-gray-600 focus:outline-none focus:border-brand-500"
        />
        <div className="flex gap-2 flex-wrap">
          {/* Tier filter */}
          {(["", "bronze", "silver", "gold"] as TierFilter[]).map((tv) => (
            <button key={tv || "all"} onClick={() => setTier(tv)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                tier === tv
                  ? "bg-brand-500/20 text-brand-300 border-brand-500/40"
                  : "bg-transparent text-gray-500 border-gray-800 hover:border-gray-600"
              }`}>
              {tv ? tv.charAt(0).toUpperCase() + tv.slice(1) : t("allTiers")}
            </button>
          ))}
          {/* Dietary */}
          {["", "gluten_free", "vegan", "nut_free"].map((d) => (
            <button key={d || "any"} onClick={() => setDietaryReq(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                dietaryReq === d
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-transparent text-gray-600 border-gray-800 hover:border-gray-600"
              }`}>
              {d ? d.replace(/_/g, " ") : t("anyDietary")}
            </button>
          ))}
          {/* Sort */}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="ml-auto px-3 py-1.5 rounded-full bg-gray-900 border border-gray-700 text-xs text-gray-400 focus:outline-none">
            <option value="name">{t("sortName")}</option>
            <option value="points">{t("sortPoints")}</option>
            <option value="lastVisit">{t("sortLastVisit")}</option>
            <option value="spend">{t("sortSpend")}</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="px-4 pt-3 lg:px-8 space-y-2">
        {isLoading && (
          <div className="text-center text-gray-600 py-12 text-sm animate-pulse">{t("loading")}</div>
        )}
        {!isLoading && customers.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">{t("noCustomers")}</p>
            <Link href="/customers/register" className="px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 text-sm font-medium">
              {t("registerFirst")}
            </Link>
          </div>
        )}

        {customers.map((c) => {
          const dietaryReqs: string[] = c.dietaryRequirements ? JSON.parse(c.dietaryRequirements) : [];
          const daysSince = c.lastVisitAt
            ? Math.round((Date.now() - new Date(c.lastVisitAt).getTime()) / 86_400_000)
            : null;
          return (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="block rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Avatar initials */}
                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400 flex-shrink-0">
                  {c.firstName[0]}{c.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.firstName} {c.lastName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border capitalize ${TIER_BADGE[c.tier] ?? TIER_BADGE.bronze}`}>
                      {c.tier}
                    </span>
                    {dietaryReqs.slice(0, 2).map((d) => (
                      <span key={d} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/30 text-purple-400 border border-purple-800/50">
                        {d.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span className="truncate max-w-[140px]">{c.email}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm font-bold text-gray-200">{c.points.toLocaleString()} pts</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {daysSince !== null ? (daysSince === 0 ? "Today" : `${daysSince}d ago`) : t("never")}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer links */}
      <div className="px-4 pt-6 lg:px-8 flex gap-3">
        <Link href="/customers/segments" className="flex-1 text-center py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:border-gray-600 transition-colors">
          {t("segments")}
        </Link>
        <Link href="/customers/tiers" className="flex-1 text-center py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:border-gray-600 transition-colors">
          {t("tierConfig")}
        </Link>
      </div>
    </div>
  );
}
