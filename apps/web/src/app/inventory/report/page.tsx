"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const REASON_LABELS: Record<string, string> = {
  expired:        "Expired",
  damaged:        "Damaged",
  quality_issue:  "Quality issue",
  spillage:       "Spillage",
  trimming:       "Trimming",
  overproduction: "Overproduction",
  other:          "Other",
};

const REASON_COLORS: Record<string, string> = {
  expired:        "bg-red-500",
  damaged:        "bg-orange-500",
  quality_issue:  "bg-yellow-500",
  spillage:       "bg-blue-500",
  trimming:       "bg-purple-500",
  overproduction: "bg-pink-500",
  other:          "bg-gray-500",
};

export default function WasteReportPage() {
  const router = useRouter();
  const [weeksBack, setWeeksBack] = useState(1);

  const { data: report, isLoading } = api.inventory.getWasteReport.useQuery({ weeksBack });

  const totalWaste = report
    ? Object.values(report.byReason).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">←</button>
        <h1 className="text-lg font-bold">Waste Report</h1>
        {isLoading && <span className="ml-auto text-xs text-gray-600 animate-pulse">Refreshing…</span>}
      </div>

      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-5 lg:px-8">
        {/* Period selector */}
        <div className="flex gap-2">
          {([1, 2, 4, 8, 12] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWeeksBack(w)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                weeksBack === w
                  ? "bg-brand-500/20 text-brand-300 border-brand-500/40"
                  : "bg-transparent text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {w === 1 ? "1 wk" : w === 2 ? "2 wks" : w === 4 ? "1 mo" : w === 8 ? "2 mo" : "3 mo"}
            </button>
          ))}
        </div>

        {report && (
          <>
            {/* Summary */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-2xl font-bold text-gray-100">{report.totalEntries}</div>
                  <div className="text-xs text-gray-500">waste events</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">
                    {new Date(report.from).toLocaleDateString()} – {new Date(report.to).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* By reason bar chart */}
              {Object.keys(report.byReason).length > 0 && (
                <div className="space-y-2 mt-3">
                  {Object.entries(report.byReason)
                    .sort(([, a], [, b]) => b - a)
                    .map(([reason, qty]) => {
                      const pct = totalWaste > 0 ? Math.round((qty / totalWaste) * 100) : 0;
                      return (
                        <div key={reason} className="flex items-center gap-3">
                          <div className="w-24 text-xs text-gray-400 text-right flex-shrink-0">
                            {REASON_LABELS[reason] ?? reason}
                          </div>
                          <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${REASON_COLORS[reason] ?? "bg-gray-500"} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-10 text-xs font-mono text-gray-400 flex-shrink-0">{pct}%</div>
                        </div>
                      );
                    })}
                </div>
              )}

              {Object.keys(report.byReason).length === 0 && (
                <p className="text-sm text-gray-600 text-center py-4">No waste logged in this period.</p>
              )}
            </div>

            {/* By ingredient */}
            {report.byIngredient.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 text-sm font-semibold text-gray-400">By ingredient</div>
                <div className="divide-y divide-gray-800">
                  {[...report.byIngredient]
                    .sort((a, b) => b.total - a.total)
                    .map((row) => (
                      <div key={row.ingredientId} className="px-4 py-3">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-medium text-gray-200">{row.name}</span>
                          <span className="font-mono text-sm font-bold text-red-400">
                            {row.total % 1 === 0 ? row.total : row.total.toFixed(2)} {row.unit}
                          </span>
                        </div>
                        {/* Mini breakdown by reason */}
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(row.byReason)
                            .sort(([, a], [, b]) => b - a)
                            .map(([reason, qty]) => (
                              <span
                                key={reason}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-400 border border-gray-700"
                              >
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
          <p className="text-center text-gray-600 py-12">No data available.</p>
        )}
      </div>
    </div>
  );
}
