"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const REASON_LABELS: Record<string, string> = {
  expired: "Expired", damaged: "Damaged", quality_issue: "Quality issue",
  spillage: "Spillage", trimming: "Trimming", overproduction: "Overproduction", other: "Other",
};

const REASON_BAR: Record<string, string> = {
  expired: "bg-red-400", damaged: "bg-orange-400", quality_issue: "bg-yellow-400",
  spillage: "bg-blue-400", trimming: "bg-purple-400", overproduction: "bg-pink-400", other: "bg-gray-400",
};

export default function WasteReportPage() {
  const router = useRouter();
  const [weeksBack, setWeeksBack] = useState(1);

  const { data: report, isLoading } = api.inventory.getWasteReport.useQuery({ weeksBack });

  const totalWaste = report ? Object.values(report.byReason).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <h1 className="page-title flex-1">Waste Report</h1>
        {isLoading && <span className="text-xs text-brand-300 animate-pulse">Refreshing…</span>}
      </div>

      {/* Period selector */}
      <div className="card p-1 flex gap-1">
        {([1, 2, 4, 8, 12] as const).map((w) => (
          <button key={w} onClick={() => setWeeksBack(w)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              weeksBack === w
                ? "bg-brand-600 text-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-rose-50"
            }`}>
            {w === 1 ? "1 wk" : w === 2 ? "2 wks" : w === 4 ? "1 mo" : w === 8 ? "2 mo" : "3 mo"}
          </button>
        ))}
      </div>

      {report && (
        <>
          {/* Summary card */}
          <div className="card px-5 py-4 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-3xl font-bold text-brand-700">{report.totalEntries}</div>
                <div className="text-xs text-brand-400 mt-0.5">waste events</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-brand-400">
                  {new Date(report.from).toLocaleDateString()} – {new Date(report.to).toLocaleDateString()}
                </div>
              </div>
            </div>

            {Object.keys(report.byReason).length > 0 ? (
              <div className="space-y-2.5">
                {Object.entries(report.byReason)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, qty]) => {
                    const pct = totalWaste > 0 ? Math.round((qty / totalWaste) * 100) : 0;
                    return (
                      <div key={reason} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-brand-400 text-right flex-shrink-0">
                          {REASON_LABELS[reason] ?? reason}
                        </div>
                        <div className="flex-1 h-2.5 bg-rose-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${REASON_BAR[reason] ?? "bg-gray-400"} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-10 text-xs font-mono text-brand-500 flex-shrink-0 text-right">{pct}%</div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-brand-300 text-center py-4">No waste logged in this period.</p>
            )}
          </div>

          {/* By ingredient */}
          {report.byIngredient.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-rose-100 text-xs font-bold text-brand-400 uppercase tracking-wider">By ingredient</div>
              <div className="divide-y divide-rose-50">
                {[...report.byIngredient]
                  .sort((a, b) => b.total - a.total)
                  .map((row) => (
                    <div key={row.ingredientId} className="px-4 py-3">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium text-gray-800">{row.name}</span>
                        <span className="font-mono text-sm font-bold text-red-600">
                          {row.total % 1 === 0 ? row.total : row.total.toFixed(2)} {row.unit}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(row.byReason)
                          .sort(([, a], [, b]) => b - a)
                          .map(([reason, qty]) => (
                            <span key={reason}
                              className="px-2 py-0.5 rounded-full text-[10px] bg-rose-50 text-brand-500 border border-rose-200">
                              {REASON_LABELS[reason] ?? reason}: {qty % 1 === 0 ? qty : qty.toFixed(1)}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {!isLoading && !report && (
        <p className="text-center text-brand-300 py-12">No data available.</p>
      )}
    </div>
  );
}
