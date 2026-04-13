"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const TIER_BADGE: Record<string, string> = {
  bronze: "bg-amber-900/50 text-amber-300 border-amber-700",
  silver: "bg-gray-700/50 text-gray-300 border-gray-600",
  gold:   "bg-yellow-900/50 text-yellow-300 border-yellow-700",
};

const REWARD_STATUS_BADGE: Record<string, string> = {
  pending:  "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  notified: "bg-blue-900/40 text-blue-300 border-blue-700",
  redeemed: "bg-gray-700/40 text-gray-500 border-gray-700 line-through",
  expired:  "bg-gray-800/40 text-gray-600 border-gray-700",
};

type Tab = "overview" | "history" | "rewards";

export default function CustomerProfilePage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const utils   = api.useUtils();

  const [tab,           setTab]           = useState<Tab>("overview");
  const [saleAmount,    setSaleAmount]    = useState("");
  const [saleItems,     setSaleItems]     = useState("");
  const [saleError,     setSaleError]     = useState<string | null>(null);
  const [saleSuccess,   setSaleSuccess]   = useState<string | null>(null);

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
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-600 animate-pulse">Loading…</div>;
  }
  if (!customer) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Customer not found.</div>;
  }

  const dietaryReqs: string[] = customer.dietaryRequirements ? JSON.parse(customer.dietaryRequirements) : [];
  const activeRewards = customer.rewards.filter((r) => r.status === "pending" && new Date(r.validUntil) > new Date());

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">←</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold truncate">{customer.firstName} {customer.lastName}</h1>
              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border capitalize ${TIER_BADGE[customer.tier] ?? TIER_BADGE.bronze}`}>
                {customer.tier}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-mono">{customer.cardNumber}</p>
          </div>
          <Link href={`/customers/${customer.id}/card`}
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs font-medium hover:bg-gray-700 transition-colors">
            View card
          </Link>
        </div>
      </div>

      {/* Points hero */}
      <div className="px-4 pt-4 lg:px-8 grid grid-cols-3 gap-3">
        {[
          { label: "Points",       value: customer.points.toLocaleString(),      sub: "available" },
          { label: "Lifetime",     value: customer.lifetimePoints.toLocaleString(), sub: "points earned" },
          { label: "Total spend",  value: `${parseFloat(customer.totalSpend).toFixed(0)}`, sub: "NOK" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-3 text-center">
            <div className="text-xl font-bold text-gray-100">{value}</div>
            <div className="text-[10px] text-gray-500">{label}</div>
            <div className="text-[10px] text-gray-700">{sub}</div>
          </div>
        ))}
      </div>

      {/* Active rewards banner */}
      {activeRewards.length > 0 && (
        <div className="px-4 pt-3 lg:px-8">
          <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-emerald-300 font-medium">
              {activeRewards.length} active reward{activeRewards.length > 1 ? "s" : ""}
            </p>
            <button onClick={() => setTab("rewards")} className="text-xs text-emerald-500 hover:text-emerald-300 transition-colors">
              View →
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-4 lg:px-8 flex gap-1.5">
        {(["overview", "history", "rewards"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold border capitalize transition-colors ${
              tab === t ? "bg-brand-500/20 text-brand-300 border-brand-500/40" : "bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-600"
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 lg:px-8 space-y-4">

        {/* ── Overview tab ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {/* Contact + preferences */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
              <div className="divide-y divide-gray-800 text-sm">
                {customer.phone && <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Phone</span><span>{customer.phone}</span></div>}
                {customer.email && <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Email</span><span className="truncate max-w-[180px]">{customer.email}</span></div>}
                {customer.birthday && <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Birthday</span><span>{customer.birthday}</span></div>}
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">Last visit</span>
                  <span>{customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString() : "Never"}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">Member since</span>
                  <span>{new Date(customer.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {dietaryReqs.length > 0 || customer.favouriteCategory ? (
              <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 flex flex-wrap gap-2">
                {dietaryReqs.map((d) => (
                  <span key={d} className="px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 text-xs border border-purple-800">{d.replace(/_/g, " ")}</span>
                ))}
                {customer.favouriteCategory && (
                  <span className="px-2 py-0.5 rounded-full bg-brand-900/40 text-brand-300 text-xs border border-brand-800">♥ {customer.favouriteCategory}</span>
                )}
              </div>
            ) : null}

            {/* ── Record a sale ─────────────────────────────────────────���─ */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">Record sale & award points</div>
              <form onSubmit={handleSale} className="px-4 py-4 space-y-3">
                {saleError   && <p className="text-sm text-red-400">{saleError}</p>}
                {saleSuccess && <p className="text-sm text-emerald-400">{saleSuccess}</p>}
                <div className="flex gap-3">
                  <input type="number" step="any" min="0" value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    placeholder="Amount (NOK)"
                    className="flex-1 px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
                  <button type="submit" disabled={awarding}
                    className="px-5 py-2.5 rounded-xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors">
                    {awarding ? "…" : "Award"}
                  </button>
                </div>
                <input type="text" value={saleItems} onChange={(e) => setSaleItems(e.target.value)}
                  placeholder="Items description (optional)"
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
              </form>
            </div>
          </>
        )}

        {/* ── History tab ──────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">Purchase history</div>
            {customer.sales.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-600 text-center">No sales recorded yet.</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {customer.sales.map((s) => (
                  <div key={s.id} className="px-4 py-3 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-medium">{s.items || "Sale"}</div>
                      <div className="text-xs text-gray-500">{new Date(s.soldAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold">{parseFloat(s.amount).toFixed(2)} {s.currency}</div>
                      <div className="text-xs text-emerald-500">+{s.pointsAwarded} pts</div>
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
              <p className="text-sm text-gray-600 text-center py-8">No rewards yet.</p>
            ) : (
              customer.rewards.map((r) => {
                const isActive = r.status === "pending" && new Date(r.validUntil) > new Date();
                return (
                  <div key={r.id} className={`rounded-xl border px-4 py-3 ${isActive ? "bg-emerald-950/20 border-emerald-800/50" : "bg-gray-900 border-gray-800"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isActive ? "text-emerald-300" : "text-gray-500"}`}>{r.description}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {r.type} · valid until {new Date(r.validUntil).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${REWARD_STATUS_BADGE[r.status] ?? ""}`}>
                        {r.status}
                      </span>
                    </div>
                    {isActive && (
                      <button onClick={() => handleRedeem(r.id)} disabled={redeeming}
                        className="mt-2 w-full py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors">
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
