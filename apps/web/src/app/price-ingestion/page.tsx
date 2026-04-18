"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:    "bg-yellow-50 text-yellow-700 border-yellow-200",
    processing: "bg-blue-50 text-blue-700 border-blue-200",
    completed:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed:     "bg-red-50 text-red-700 border-red-200",
  };
  return map[status] ?? "bg-gray-100 text-gray-500 border-gray-200";
}

function sourceBadge(source: string) {
  const map: Record<string, string> = {
    invoice: "bg-purple-50 text-purple-700 border-purple-200",
    csv:     "bg-cyan-50 text-cyan-700 border-cyan-200",
    api:     "bg-orange-50 text-orange-700 border-orange-200",
  };
  return map[source] ?? "bg-gray-100 text-gray-500 border-gray-200";
}

export default function PriceIngestionPage() {
  const t = useTranslations("priceIngestion");
  const { data: sessions = [], isLoading } = api.priceIngestion.getSessions.useQuery();
  const { data: cogsResults = [] }         = api.priceIngestion.recalculateCOGS.useQuery();

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h2 className="page-title">{t("title")}</h2>
        <p className="text-gray-500 mt-1">{t("subtitle")}</p>
      </div>

      {/* Import options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/price-ingestion/invoice"
          className="card p-6 flex flex-col gap-3 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all group"
        >
          <span className="text-3xl">📄</span>
          <div>
            <h3 className="font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">
              {t("invoiceOcr")}
            </h3>
            <p className="text-sm text-gray-500 mt-1">{t("invoiceOcrDesc")}</p>
          </div>
          <span className="text-xs text-gray-600 mt-auto">{t("requiresApiKey")}</span>
        </Link>

        <Link
          href="/price-ingestion/csv"
          className="card p-6 flex flex-col gap-3 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all group"
        >
          <span className="text-3xl">📊</span>
          <div>
            <h3 className="font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">
              {t("csvImport")}
            </h3>
            <p className="text-sm text-gray-500 mt-1">{t("csvImportDesc")}</p>
          </div>
          <span className="text-xs text-gray-600 mt-auto">{t("acceptsAnyFormat")}</span>
        </Link>
      </div>

      {/* COGS summary */}
      {cogsResults.length > 0 && (
        <div>
          <h3 className="section-title mb-3">{t("costOverview")}</h3>
          <div className="card divide-y divide-rose-50">
            {cogsResults.map((r) => (
              <div key={r.recipeId} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-gray-800 font-medium">{r.recipeName}</span>
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
        <h3 className="section-title mb-3">{t("importHistory")}</h3>
        {isLoading ? (
          <div className="card p-10 text-center text-gray-600">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="card p-12 text-center text-gray-600">
            <p className="text-3xl mb-3">📥</p>
            <p className="font-medium">{t("noImports")}</p>
            <p className="text-sm mt-1">{t("noImportsHint")}</p>
          </div>
        ) : (
          <div className="card divide-y divide-rose-50">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/price-ingestion/${s.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-rose-50/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge text-xs ${sourceBadge(s.source)}`}>{s.source}</span>
                    <span className={`badge text-xs ${statusBadge(s.status)}`}>{s.status}</span>
                    <span className="text-gray-800 text-sm font-medium truncate">
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
