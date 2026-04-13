"use client";

import Link from "next/link";
import { api } from "@/trpc/react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:    "bg-yellow-950/60 text-yellow-400",
    processing: "bg-blue-950/60 text-blue-400",
    completed:  "bg-emerald-950/60 text-emerald-400",
    failed:     "bg-red-950/60 text-red-400",
  };
  return map[status] ?? "bg-gray-800 text-gray-400";
}

function sourceBadge(source: string) {
  const map: Record<string, string> = {
    invoice: "bg-purple-950/60 text-purple-400",
    csv:     "bg-cyan-950/60 text-cyan-400",
    api:     "bg-orange-950/60 text-orange-400",
  };
  return map[source] ?? "bg-gray-800 text-gray-400";
}

export default function PriceIngestionPage() {
  const { data: sessions = [], isLoading } = api.priceIngestion.getSessions.useQuery();
  const { data: cogsResults = [] }         = api.priceIngestion.recalculateCOGS.useQuery();

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h2 className="page-title">Supplier Price Sync</h2>
        <p className="text-gray-500 mt-1">
          Import supplier invoices or CSV price lists, review matches, and apply prices to your ingredients.
        </p>
      </div>

      {/* Import options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/price-ingestion/invoice"
          className="card p-6 flex flex-col gap-3 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all group"
        >
          <span className="text-3xl">📄</span>
          <div>
            <h3 className="font-semibold text-gray-100 group-hover:text-brand-300 transition-colors">
              Invoice OCR
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Upload a PDF or photo of a supplier invoice. Claude AI extracts the line items for you.
            </p>
          </div>
          <span className="text-xs text-gray-600 mt-auto">Requires Anthropic API key</span>
        </Link>

        <Link
          href="/price-ingestion/csv"
          className="card p-6 flex flex-col gap-3 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all group"
        >
          <span className="text-3xl">📊</span>
          <div>
            <h3 className="font-semibold text-gray-100 group-hover:text-brand-300 transition-colors">
              CSV Import
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Upload a CSV price list from your supplier. Map columns, preview matches, confirm prices.
            </p>
          </div>
          <span className="text-xs text-gray-600 mt-auto">Accepts any CSV format</span>
        </Link>
      </div>

      {/* COGS summary */}
      {cogsResults.length > 0 && (
        <div>
          <h3 className="section-title mb-3">Recipe Cost Overview</h3>
          <div className="card divide-y divide-gray-800">
            {cogsResults.map((r) => (
              <div key={r.recipeId} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-gray-300 font-medium">{r.recipeName}</span>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-gray-500">
                    {r.yieldAmount} {r.yieldUnit}
                  </span>
                  <span className="text-gray-400 font-mono">
                    {r.totalCost.toFixed(2)} NOK total
                  </span>
                  <span className="text-brand-400 font-mono font-medium">
                    {r.costPerUnit.toFixed(4)} NOK / {r.yieldUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <h3 className="section-title mb-3">Import History</h3>
        {isLoading ? (
          <div className="card p-10 text-center text-gray-600">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="card p-12 text-center text-gray-600">
            <p className="text-3xl mb-3">📥</p>
            <p className="font-medium">No imports yet</p>
            <p className="text-sm mt-1">Use the options above to import your first price list.</p>
          </div>
        ) : (
          <div className="card divide-y divide-gray-800">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/price-ingestion/${s.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-800/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge text-xs ${sourceBadge(s.source)}`}>{s.source}</span>
                    <span className={`badge text-xs ${statusBadge(s.status)}`}>{s.status}</span>
                    <span className="text-gray-300 text-sm font-medium truncate">
                      {s.fileName ?? `${s.source} import`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(s.startedAt).toLocaleString()} ·{" "}
                    {s.itemCount ?? 0} items · {s.matchedCount ?? 0} matched · {s.appliedCount ?? 0} applied
                  </p>
                </div>
                <span className="text-gray-700 text-sm shrink-0">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
