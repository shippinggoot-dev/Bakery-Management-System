"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const TIER_COLOR: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold:   "#FFD700",
};

export default function POSLookupPage() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const utils    = api.useUtils();

  const [query,       setQuery]       = useState("");
  const [saleAmount,  setSaleAmount]  = useState("");
  const [saleItems,   setSaleItems]   = useState("");
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);
  const [saleError,   setSaleError]   = useState<string | null>(null);
  const [searching,   setSearching]   = useState(false);

  const { mutateAsync: lookup      } = api.customers.lookup.useMutation();
  const { mutateAsync: awardPoints, isPending: awarding } = api.customers.awardPoints.useMutation();

  const [found,    setFound]    = useState<Awaited<ReturnType<typeof lookup>> | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Debounced search — fires 200 ms after the user stops typing
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      setNotFound(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await lookup({ query: q });
        if (result) { setFound(result); setNotFound(false); }
        else         { setFound(null);  setNotFound(true);  }
      } catch {
        setFound(null);
        setNotFound(false);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearSearch() {
    setQuery("");
    setFound(null);
    setNotFound(false);
    setSaleSuccess(null);
    inputRef.current?.focus();
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
      amount:     amt,
      currency:   "NOK",
      items:      saleItems || null,
      notes:      null,
    });
    setSaleSuccess(`+${res.pointsAwarded} pts awarded${res.tierUpgraded ? ` · Tier upgraded to ${res.tierUpgraded}!` : ""}`);
    setSaleAmount("");
    setSaleItems("");
    const refreshed = await lookup({ query: query.trim() });
    if (refreshed) setFound(refreshed);
  }

  const activeRewards = found?.rewards?.filter(
    (r) => r.status === "pending" && new Date(r.validUntil) > new Date()
  ) ?? [];

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-3 -ml-1 rounded-xl text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <div>
          <h1 className="page-title">Customer Lookup</h1>
          <p className="text-xs text-brand-400">Search by name, phone, email or card #</p>
        </div>
      </div>

      {/* Search field — autofocused, debounced, no submit button needed */}
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          inputMode="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone, email or card #"
          autoFocus
          autoComplete="off"
          className="form-input text-base py-4 pr-12"
        />
        {/* Spinner while searching */}
        {searching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-300 text-sm animate-pulse">
            …
          </span>
        )}
        {/* Clear button when there's a query and not searching */}
        {query && !searching && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-rose-50 transition-colors text-lg leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Not found */}
      {notFound && (
        <div className="card px-4 py-5 bg-amber-50 border-amber-200 text-center space-y-3">
          <p className="text-amber-700 font-semibold">No customer found</p>
          <p className="text-sm text-amber-600">No match for &ldquo;{query}&rdquo;</p>
          <Link
            href="/customers/register"
            className="inline-block btn bg-white border border-rose-200 text-brand-600 hover:bg-rose-50 text-sm"
          >
            Register new customer
          </Link>
        </div>
      )}

      {/* Found customer */}
      {found && (
        <div className="space-y-3">

          {/* Customer card — tappable, goes to full profile */}
          <Link href={`/customers/${found.id}`} className="card overflow-hidden block hover:border-brand-200 hover:shadow-md transition-all">
            <div className="px-4 py-4 flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
                style={{ backgroundColor: `${TIER_COLOR[found.tier]}22`, color: TIER_COLOR[found.tier] }}
              >
                {found.firstName[0]}{found.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-gray-800">{found.firstName} {found.lastName}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold capitalize shrink-0"
                    style={{
                      backgroundColor: `${TIER_COLOR[found.tier]}22`,
                      color: TIER_COLOR[found.tier],
                      border: `1px solid ${TIER_COLOR[found.tier]}66`,
                    }}
                  >
                    {found.tier}
                  </span>
                </div>
                <p className="text-sm text-brand-400 truncate">{found.phone ?? found.email}</p>
                <p className="text-xs font-mono text-brand-300">{found.cardNumber}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-black text-brand-600">{found.points.toLocaleString()}</div>
                <div className="text-xs text-brand-400">points</div>
              </div>
            </div>

            {activeRewards.length > 0 && (
              <div className="border-t border-rose-100 bg-emerald-50 px-4 py-2.5">
                <p className="text-xs font-semibold text-emerald-700">
                  {activeRewards.length} active reward{activeRewards.length > 1 ? "s" : ""}: {activeRewards[0]?.description}
                  {activeRewards.length > 1 && ` +${activeRewards.length - 1} more`}
                </p>
              </div>
            )}
          </Link>

          {/* Quick sale */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-rose-100 text-xs font-bold text-brand-400 uppercase tracking-wider">
              Record sale &amp; award points
            </div>
            <form onSubmit={handleSale} className="px-4 py-4 space-y-3">
              {saleError && <p className="text-sm text-red-600">{saleError}</p>}
              {saleSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 font-semibold">
                  {saleSuccess}
                </div>
              )}
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  placeholder="0.00 NOK"
                  className="form-input flex-1 text-xl font-bold text-center py-3"
                />
                <button
                  type="submit"
                  disabled={awarding || !saleAmount}
                  className="btn-primary text-base px-5 py-3 disabled:opacity-40"
                >
                  {awarding ? "…" : "Award pts"}
                </button>
              </div>
              <input
                type="text"
                value={saleItems}
                onChange={(e) => setSaleItems(e.target.value)}
                placeholder="Items (optional)"
                className="form-input"
              />
            </form>
          </div>

          {/* Quick links */}
          <div className="flex gap-2">
            <Link
              href={`/customers/${found.id}`}
              className="flex-1 text-center py-3.5 card text-sm font-medium text-brand-600 hover:border-brand-200 transition-colors"
            >
              Full profile
            </Link>
            <Link
              href={`/customers/${found.id}/card`}
              className="flex-1 text-center py-3.5 card text-sm font-medium text-brand-600 hover:border-brand-200 transition-colors"
            >
              Loyalty card
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
