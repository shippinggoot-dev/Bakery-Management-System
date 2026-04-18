"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

const TIER_BADGE: Record<string, string> = {
  bronze: "bg-amber-50 text-amber-700 border-amber-300",
  silver: "bg-gray-100 text-gray-600 border-gray-300",
  gold:   "bg-yellow-50 text-yellow-700 border-yellow-300",
};

type SortKey = "name" | "points" | "lastVisit" | "spend";
type TierFilter = "bronze" | "silver" | "gold" | "";

export default function CustomersPage() {
  const t = useTranslations("customers");
  const [search,     setSearch]     = useState("");
  const [tier,       setTier]       = useState<TierFilter>("");
  const [sort,       setSort]       = useState<SortKey>("name");
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
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="text-sm text-brand-400 mt-0.5">
            {customers.length} {t("total")} · {loyalty} {t("loyaltyMembers")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/customers/lookup" className="btn bg-white border border-rose-200 text-brand-600 hover:bg-rose-50">
            {t("posLookup")}
          </Link>
          <Link href="/customers/register" className="btn-primary">
            {t("register")}
          </Link>
        </div>
      </div>

      {/* Tier summary strip */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
          🥉 {customers.filter((c) => c.tier === "bronze").length} Bronze
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold">
          🥈 {customers.filter((c) => c.tier === "silver").length} Silver
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-semibold">
          🥇 {customers.filter((c) => c.tier === "gold").length} Gold
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 text-brand-600 border border-rose-200 text-xs font-semibold">
          {totalPoints.toLocaleString()} pts outstanding
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <input
          type="search"
          placeholder="Search name, phone, email, card #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input"
        />
        <div className="flex gap-2 flex-wrap items-center">
          {/* Tier filter */}
          {(["", "bronze", "silver", "gold"] as TierFilter[]).map((tv) => (
            <button key={tv || "all"} onClick={() => setTier(tv)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                tier === tv
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-500 border-rose-200 hover:border-brand-300 hover:text-gray-700"
              }`}>
              {tv ? tv.charAt(0).toUpperCase() + tv.slice(1) : t("allTiers")}
            </button>
          ))}
          {/* Dietary */}
          {["", "gluten_free", "vegan", "nut_free"].map((d) => (
            <button key={d || "any"} onClick={() => setDietaryReq(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                dietaryReq === d
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-gray-500 border-rose-200 hover:border-purple-300 hover:text-gray-700"
              }`}>
              {d ? d.replace(/_/g, " ") : t("anyDietary")}
            </button>
          ))}
          {/* Sort */}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="ml-auto form-input w-auto text-xs py-1.5">
            <option value="name">{t("sortName")}</option>
            <option value="points">{t("sortPoints")}</option>
            <option value="lastVisit">{t("sortLastVisit")}</option>
            <option value="spend">{t("sortSpend")}</option>
          </select>
        </div>
      </div>

      {/* Customer list */}
      <div className="space-y-2">
        {isLoading && (
          <p className="text-center text-brand-300 py-12 text-sm animate-pulse">{t("loading")}</p>
        )}
        {!isLoading && customers.length === 0 && (
          <div className="card p-12 text-center">
            <p className="text-brand-400 mb-4">{t("noCustomers")}</p>
            <Link href="/customers/register" className="btn-primary">
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
              className="card px-4 py-3 hover:border-brand-200 hover:shadow-md transition-all block"
            >
              <div className="flex items-center gap-3">
                {/* Avatar initials */}
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-sm font-bold text-brand-600 flex-shrink-0">
                  {c.firstName[0]}{c.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{c.firstName} {c.lastName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border capitalize ${TIER_BADGE[c.tier] ?? TIER_BADGE.bronze}`}>
                      {c.tier}
                    </span>
                    {dietaryReqs.slice(0, 2).map((d) => (
                      <span key={d} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                        {d.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-brand-400 mt-0.5 flex gap-3">
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span className="truncate max-w-[140px]">{c.email}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm font-bold text-brand-700">{c.points.toLocaleString()} pts</div>
                  <div className="text-[10px] text-brand-400 mt-0.5">
                    {daysSince !== null ? (daysSince === 0 ? "Today" : `${daysSince}d ago`) : t("never")}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer links */}
      <div className="flex gap-3">
        <Link href="/customers/segments" className="flex-1 text-center py-2.5 card text-sm text-brand-600 hover:border-brand-200 transition-colors font-medium">
          {t("segments")}
        </Link>
        <Link href="/customers/tiers" className="flex-1 text-center py-2.5 card text-sm text-brand-600 hover:border-brand-200 transition-colors font-medium">
          {t("tierConfig")}
        </Link>
      </div>
    </div>
  );
}
