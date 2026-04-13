"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

export default function POSLookupPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();

  const [query,       setQuery]       = useState("");
  const [saleAmount,  setSaleAmount]  = useState("");
  const [saleItems,   setSaleItems]   = useState("");
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);
  const [saleError,   setSaleError]   = useState<string | null>(null);

  const { mutateAsync: lookup, isPending: looking } = api.customers.lookup.useMutation();
  const { mutateAsync: awardPoints, isPending: awarding } = api.customers.awardPoints.useMutation();

  const [found, setFound] = useState<Awaited<ReturnType<typeof lookup>> | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function handleLookup(q: string) {
    if (!q.trim()) return;
    setFound(null);
    setNotFound(false);
    setSaleSuccess(null);
    const result = await lookup({ query: q.trim() });
    if (result) {
      setFound(result);
    } else {
      setNotFound(true);
    }
  }

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    if (!found) return;
    setSaleError(null);
    setSaleSuccess(null);
    const amt = parseFloat(saleAmount);
    if (!amt || amt <= 0) { setSaleError("Enter a valid amount."); return; }
    const res = await awardPoints({
      customerId: found.id,
      amount: amt,
      currency: "NOK",
      items: saleItems || null,
      notes: null,
    });
    setSaleSuccess(`+${res.pointsAwarded} pts awarded${res.tierUpgraded ? ` · Tier upgraded to ${res.tierUpgraded}!` : ""}`);
    setSaleAmount("");
    setSaleItems("");
    // Refresh the found customer data
    const refreshed = await lookup({ query: query });
    if (refreshed) setFound(refreshed);
  }

  const TIER_COLOR: Record<string, string> = {
    bronze: "#CD7F32", silver: "#C0C0C0", gold: "#FFD700",
  };
  const activeRewards = found?.rewards?.filter(
    (r) => r.status === "pending" && new Date(r.validUntil) > new Date()
  ) ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">←</button>
        <div>
          <h1 className="text-lg font-bold">POS Customer Lookup</h1>
          <p className="text-xs text-gray-500">Enter phone, email, or scan loyalty card</p>
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto lg:px-8 space-y-4">

        {/* ── Search field — large for quick tapping ──────────────────────── */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFound(null); setNotFound(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleLookup(query)}
            placeholder="Phone, email, or card # (e.g. BAK-000001)"
            autoFocus
            className="flex-1 px-4 py-4 rounded-xl bg-gray-800 border border-gray-700 text-base focus:outline-none focus:border-brand-500 placeholder-gray-600"
          />
          <button
            onClick={() => handleLookup(query)}
            disabled={looking || !query.trim()}
            className="px-5 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 disabled:opacity-40 transition-colors"
          >
            {looking ? "…" : "Find"}
          </button>
        </div>

        {/* ── Not found ───────────────────────────────────────────────────── */}
        {notFound && (
          <div className="rounded-xl bg-amber-900/30 border border-amber-800 px-4 py-4 text-center space-y-3">
            <p className="text-amber-300 font-semibold">Customer not found</p>
            <p className="text-sm text-amber-400/70">No match for "{query}"</p>
            <Link href="/customers/register"
              className="inline-block px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 text-sm font-medium hover:bg-brand-500/30 transition-colors">
              Register new customer
            </Link>
          </div>
        )}

        {/* ── Found customer ──────────────────────────────────────────────── */}
        {found && (
          <div className="space-y-3">
            {/* Customer card */}
            <div className="rounded-xl bg-gray-900 border-2 border-brand-500/40 overflow-hidden">
              <div className="px-4 py-4 flex items-center gap-4">
                {/* Avatar */}
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
                  style={{ backgroundColor: `${TIER_COLOR[found.tier]}22`, color: TIER_COLOR[found.tier] }}>
                  {found.firstName[0]}{found.lastName[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{found.firstName} {found.lastName}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold capitalize"
                      style={{ backgroundColor: `${TIER_COLOR[found.tier]}33`, color: TIER_COLOR[found.tier], border: `1px solid ${TIER_COLOR[found.tier]}66` }}>
                      {found.tier}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{found.phone ?? found.email}</p>
                  <p className="text-xs font-mono text-gray-600">{found.cardNumber}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-2xl font-black text-brand-400">{found.points.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">points</div>
                </div>
              </div>

              {activeRewards.length > 0 && (
                <div className="border-t border-gray-800 bg-emerald-950/20 px-4 py-2.5">
                  <p className="text-xs font-semibold text-emerald-400">
                    {activeRewards.length} active reward{activeRewards.length > 1 ? "s" : ""}: {activeRewards[0]?.description}
                    {activeRewards.length > 1 && ` +${activeRewards.length - 1} more`}
                  </p>
                </div>
              )}
            </div>

            {/* ── Quick sale form ──────────────────────────────────────────── */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Record sale & award points
              </div>
              <form onSubmit={handleSale} className="px-4 py-4 space-y-3">
                {saleError   && <p className="text-sm text-red-400">{saleError}</p>}
                {saleSuccess && <div className="rounded-lg bg-emerald-900/40 border border-emerald-700 px-3 py-2 text-sm text-emerald-300 font-semibold">{saleSuccess}</div>}
                <div className="flex gap-3 items-center">
                  {/* Big number input for quick entry */}
                  <input type="number" step="any" min="0" value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    placeholder="0.00 NOK"
                    className="flex-1 px-4 py-4 rounded-xl bg-gray-800 border border-gray-700 text-xl font-bold text-center focus:outline-none focus:border-brand-500"
                  />
                  <button type="submit" disabled={awarding || !saleAmount}
                    className="px-6 py-4 rounded-xl bg-brand-500 text-white font-black text-lg hover:bg-brand-600 disabled:opacity-40 transition-colors whitespace-nowrap">
                    {awarding ? "…" : "Award pts"}
                  </button>
                </div>
                <input type="text" value={saleItems} onChange={(e) => setSaleItems(e.target.value)}
                  placeholder="Items (optional)"
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
              </form>
            </div>

            <div className="flex gap-2">
              <Link href={`/customers/${found.id}`}
                className="flex-1 text-center py-3 rounded-xl bg-gray-900 border border-gray-800 text-sm font-medium text-gray-400 hover:border-gray-600 transition-colors">
                Full profile
              </Link>
              <Link href={`/customers/${found.id}/card`}
                className="flex-1 text-center py-3 rounded-xl bg-gray-900 border border-gray-800 text-sm font-medium text-gray-400 hover:border-gray-600 transition-colors">
                Loyalty card
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
