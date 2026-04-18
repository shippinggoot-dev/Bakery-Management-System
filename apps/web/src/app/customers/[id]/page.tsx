"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const TIER_BADGE: Record<string, string> = {
  bronze: "bg-amber-50 text-amber-700 border-amber-300",
  silver: "bg-gray-100 text-gray-600 border-gray-300",
  gold:   "bg-yellow-50 text-yellow-700 border-yellow-300",
};

const REWARD_STATUS_BADGE: Record<string, string> = {
  pending:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  notified: "bg-blue-50 text-blue-700 border-blue-200",
  redeemed: "bg-gray-100 text-gray-400 border-gray-200 line-through",
  expired:  "bg-gray-50 text-gray-400 border-gray-200",
};

type Tab = "overview" | "history" | "rewards";

export default function CustomerProfilePage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const utils   = api.useUtils();

  const [tab,         setTab]         = useState<Tab>("overview");
  const [saleAmount,  setSaleAmount]  = useState("");
  const [saleItems,   setSaleItems]   = useState("");
  const [saleError,   setSaleError]   = useState<string | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);

  const { data: customer, isLoading } = api.customers.getById.useQuery(params.id);
  const { mutateAsync: awardPoints,  isPending: awarding }  = api.customers.awardPoints.useMutation();
  const { mutateAsync: redeemReward, isPending: redeeming } = api.customers.redeemReward.useMutation();

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    setSaleError(null);
    setSaleSuccess(null);
    const amt = parseFloat(saleAmount);
    if (!amt || amt <= 0) { setSaleError("Enter a valid amount."); return; }
    try {
      const res = await awardPoints({
        customerId: params.id,
        amount:     amt,
        currency:   "NOK",
        items:      saleItems || null,
        notes:      null,
      });
      utils.customers.getById.invalidate(params.id);
      setSaleAmount("");
      setSaleItems("");
      setSaleSuccess(`+${res.pointsAwarded} pts awarded${res.tierUpgraded ? ` · Upgraded to ${res.tierUpgraded}!` : ""}`);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Failed to award points.");
    }
  }

  async function handleRedeem(rewardId: string) {
    try {
      await redeemReward({ customerId: params.id, rewardId });
      utils.customers.getById.invalidate(params.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to redeem.");
    }
  }

  if (isLoading) {
    return <div className="py-16 text-center text-brand-300 animate-pulse">Loading…</div>;
  }
  if (!customer) {
    return <div className="py-16 text-center text-brand-400">Customer not found.</div>;
  }

  const dietaryReqs: string[] = customer.dietaryRequirements ? JSON.parse(customer.dietaryRequirements) : [];
  const activeRewards = customer.rewards.filter((r) => r.status === "pending" && new Date(r.validUntil) > new Date());

  return (
    <div className="space-y-5 max-w-xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="page-title truncate">{customer.firstName} {customer.lastName}</h1>
            <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border capitalize ${TIER_BADGE[customer.tier] ?? TIER_BADGE.bronze}`}>
              {customer.tier}
            </span>
          </div>
          <p className="text-xs text-brand-400 font-mono">{customer.cardNumber}</p>
        </div>
        <Link href={`/customers/${customer.id}/card`}
          className="flex-shrink-0 btn bg-white border border-rose-200 text-brand-600 hover:bg-rose-50 text-xs">
          View card
        </Link>
      </div>

      {/* Points hero */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Points",      value: customer.points.toLocaleString(),            sub: "available"    },
          { label: "Lifetime",    value: customer.lifetimePoints.toLocaleString(),    sub: "points earned" },
          { label: "Total spend", value: `${parseFloat(customer.totalSpend).toFixed(0)}`, sub: "NOK"      },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card px-3 py-3 text-center">
            <div className="text-xl font-bold text-brand-700">{value}</div>
            <div className="text-[10px] text-brand-400 font-semibold uppercase tracking-wide mt-0.5">{label}</div>
            <div className="text-[10px] text-brand-300">{sub}</div>
          </div>
        ))}
      </div>

      {/* Active rewards banner */}
      {activeRewards.length > 0 && (
        <div className="card px-4 py-3 bg-emerald-50 border-emerald-200 flex items-center justify-between">
          <p className="text-sm text-emerald-700 font-medium">
            {activeRewards.length} active reward{activeRewards.length > 1 ? "s" : ""}
          </p>
          <button onClick={() => setTab("rewards")} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
            View →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="card p-1 flex gap-1">
        {(["overview", "history", "rewards"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === t
                ? "bg-brand-600 text-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-rose-50"
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4">

        {/* ── Overview tab ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {/* Contact + preferences */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-rose-100 text-xs font-bold text-brand-400 uppercase tracking-wider">Contact</div>
              <div className="divide-y divide-rose-50 text-sm">
                {customer.phone && (
                  <div className="px-4 py-2.5 flex justify-between">
                    <span className="text-brand-400">Phone</span><span className="text-gray-700">{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="px-4 py-2.5 flex justify-between">
                    <span className="text-brand-400">Email</span><span className="text-gray-700 truncate max-w-[180px]">{customer.email}</span>
                  </div>
                )}
                {customer.birthday && (
                  <div className="px-4 py-2.5 flex justify-between">
                    <span className="text-brand-400">Birthday</span><span className="text-gray-700">{customer.birthday}</span>
                  </div>
                )}
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-brand-400">Last visit</span>
                  <span className="text-gray-700">{customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString() : "Never"}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-brand-400">Member since</span>
                  <span className="text-gray-700">{new Date(customer.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {(dietaryReqs.length > 0 || customer.favouriteCategory) ? (
              <div className="card px-4 py-3 flex flex-wrap gap-2">
                {dietaryReqs.map((d) => (
                  <span key={d} className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs border border-purple-200">{d.replace(/_/g, " ")}</span>
                ))}
                {customer.favouriteCategory && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-brand-600 text-xs border border-rose-200">♥ {customer.favouriteCategory}</span>
                )}
              </div>
            ) : null}

            {/* Record a sale */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-rose-100 text-xs font-bold text-brand-400 uppercase tracking-wider">Record sale &amp; award points</div>
              <form onSubmit={handleSale} className="px-4 py-4 space-y-3">
                {saleError   && <p className="text-sm text-red-600">{saleError}</p>}
                {saleSuccess && <p className="text-sm text-emerald-600 font-semibold">{saleSuccess}</p>}
                <div className="flex gap-3">
                  <input type="number" step="any" min="0" value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    placeholder="Amount (NOK)"
                    className="form-input flex-1" />
                  <button type="submit" disabled={awarding}
                    className="btn-primary disabled:opacity-50">
                    {awarding ? "…" : "Award"}
                  </button>
                </div>
                <input type="text" value={saleItems} onChange={(e) => setSaleItems(e.target.value)}
                  placeholder="Items description (optional)"
                  className="form-input" />
              </form>
            </div>
          </>
        )}

        {/* ── History tab ──────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-rose-100 text-xs font-bold text-brand-400 uppercase tracking-wider">Purchase history</div>
            {customer.sales.length === 0 ? (
              <p className="px-4 py-6 text-sm text-brand-300 text-center">No sales recorded yet.</p>
            ) : (
              <div className="divide-y divide-rose-50">
                {customer.sales.map((s) => (
                  <div key={s.id} className="px-4 py-3 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-medium text-gray-800">{s.items || "Sale"}</div>
                      <div className="text-xs text-brand-400">{new Date(s.soldAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-gray-800">{parseFloat(s.amount).toFixed(2)} {s.currency}</div>
                      <div className="text-xs text-emerald-600">+{s.pointsAwarded} pts</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Rewards tab ──────────────────────────────────────────────── */}
        {tab === "rewards" && (
          <div className="space-y-2">
            {customer.rewards.length === 0 ? (
              <p className="text-sm text-brand-300 text-center py-8">No rewards yet.</p>
            ) : (
              customer.rewards.map((r) => {
                const isActive = r.status === "pending" && new Date(r.validUntil) > new Date();
                return (
                  <div key={r.id} className={`card px-4 py-3 ${isActive ? "bg-emerald-50 border-emerald-200" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isActive ? "text-emerald-700" : "text-gray-500"}`}>{r.description}</p>
                        <p className="text-xs text-brand-400 mt-0.5">
                          {r.type} · valid until {new Date(r.validUntil).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${REWARD_STATUS_BADGE[r.status] ?? ""}`}>
                        {r.status}
                      </span>
                    </div>
                    {isActive && (
                      <button onClick={() => handleRedeem(r.id)} disabled={redeeming}
                        className="mt-2 w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                        Redeem now
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
