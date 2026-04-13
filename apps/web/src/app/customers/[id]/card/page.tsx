"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const TIER_CONFIG: Record<string, { color: string; label: string; gradient: string }> = {
  bronze: { color: "#CD7F32", label: "Bronze",  gradient: "from-amber-900/80 to-amber-800/60" },
  silver: { color: "#C0C0C0", label: "Silver",  gradient: "from-gray-600/80 to-gray-500/60" },
  gold:   { color: "#FFD700", label: "Gold",    gradient: "from-yellow-700/80 to-yellow-600/60" },
};

export default function LoyaltyCardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading } = api.customers.getById.useQuery(params.id);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    const url = `${window.location.origin}/customers/${customer.id}/card`;
    // Dynamic import to keep qrcode out of the main bundle
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: { dark: "#111827", light: "#F9FAFB" },
      }).then(setQrDataUrl);
    });
  }, [customer]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading card…</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Customer not found.</div>
      </div>
    );
  }

  const tier   = TIER_CONFIG[customer.tier] ?? TIER_CONFIG.bronze;
  const activeRewards = customer.rewards.filter(
    (r) => r.status === "pending" && new Date(r.validUntil) > new Date()
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4 gap-6">
      <button
        onClick={() => router.back()}
        className="self-start text-gray-500 hover:text-gray-300 text-sm transition-colors"
      >
        ← Back
      </button>

      {/* ── Loyalty Card ────────────────────────────────────────────────���─── */}
      <div
        className={`w-full max-w-sm rounded-3xl bg-gradient-to-br ${tier.gradient} border border-white/10 shadow-2xl overflow-hidden`}
        style={{ aspectRatio: "1.586 / 1" }} // ISO/IEC 7810 ID-1 ratio
      >
        {/* Card header */}
        <div className="px-6 pt-5 pb-3 flex justify-between items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70" style={{ color: tier.color }}>
              Loyalty Card
            </p>
            <h2 className="text-xl font-bold text-white leading-tight mt-0.5">
              {customer.firstName} {customer.lastName}
            </h2>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border" style={{ borderColor: tier.color, color: tier.color, backgroundColor: `${tier.color}20` }}>
              {tier.label}
            </div>
          </div>
        </div>

        {/* Points + card number */}
        <div className="px-6 pb-4 flex justify-between items-end">
          <div>
            <p className="text-3xl font-black text-white tabular-nums">{customer.points.toLocaleString()}</p>
            <p className="text-xs text-white/60 mt-0.5">points available</p>
            <p className="text-xs font-mono text-white/40 mt-2">{customer.cardNumber}</p>
          </div>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Loyalty card QR code"
              className="w-20 h-20 rounded-xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-white/10 animate-pulse" />
          )}
        </div>
      </div>

      {/* ── Points summary ─────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm grid grid-cols-3 gap-3">
        {[
          { label: "Points",          value: customer.points.toLocaleString() },
          { label: "Lifetime pts",    value: customer.lifetimePoints.toLocaleString() },
          { label: "Total spend",     value: `${parseFloat(customer.totalSpend).toFixed(0)} NOK` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-3 text-center">
            <div className="text-lg font-bold text-gray-100">{value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Active rewards ─────────────────────────────────────────────────── */}
      {activeRewards.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active rewards</h3>
          {activeRewards.map((reward) => (
            <div key={reward.id} className="rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-emerald-300">{reward.description}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Valid until {new Date(reward.validUntil).toLocaleDateString()}
                  </p>
                </div>
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-400 text-[10px] font-bold border border-emerald-700 capitalize">
                  {reward.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dietary / preference ───────────────────────────────────────────── */}
      {(customer.dietaryRequirements || customer.favouriteCategory) && (
        <div className="w-full max-w-sm rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 flex flex-wrap gap-2">
          {customer.dietaryRequirements &&
            (JSON.parse(customer.dietaryRequirements) as string[]).map((d) => (
              <span key={d} className="px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 text-xs border border-purple-800">
                {d.replace(/_/g, " ")}
              </span>
            ))}
          {customer.favouriteCategory && (
            <span className="px-2 py-0.5 rounded-full bg-brand-900/40 text-brand-300 text-xs border border-brand-800">
              ♥ {customer.favouriteCategory}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
