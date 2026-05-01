"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Row = {
  ingredientId: string;
  name:         string;
  unit:         string;
  current:      number;
  counted:      string; // user-edited value
  dirty:        boolean;
};

export default function StocktakePage() {
  const router = useRouter();
  const { data: stockLevels = [], isLoading } = api.inventory.getStockLevels.useQuery();
  const adjustStock = api.inventory.adjustStock.useMutation();

  const [rows,    setRows]    = useState<Row[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    if (!stockLevels.length) return;
    setRows(
      stockLevels.map((s) => ({
        ingredientId: s.ingredientId,
        name:         s.name,
        unit:         s.unit,
        current:      s.currentStock,
        counted:      String(s.currentStock),
        dirty:        false,
      }))
    );
  }, [stockLevels]);

  function setCounted(ingredientId: string, value: string) {
    setRows((r) =>
      r.map((row) =>
        row.ingredientId === ingredientId
          ? { ...row, counted: value, dirty: value !== String(row.current) }
          : row
      )
    );
  }

  async function handleSave() {
    const changed = rows.filter((r) => r.dirty && r.counted.trim() !== "" && !isNaN(parseFloat(r.counted)));
    if (changed.length === 0) { router.push("/inventory"); return; }

    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        changed.map((r) =>
          adjustStock.mutateAsync({
            ingredientId: r.ingredientId,
            newQuantity:  parseFloat(r.counted),
            unit:         r.unit,
            notes:        "Stocktake",
          })
        )
      );
      setSaved(true);
      setTimeout(() => router.push("/inventory"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stocktake.");
      setSaving(false);
    }
  }

  const changedCount = rows.filter((r) => r.dirty && !isNaN(parseFloat(r.counted))).length;
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-3 -ml-1 rounded-xl text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors"
        >
          ←
        </button>
        <div>
          <h1 className="page-title">Stocktake</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enter your counted quantities. Only changed rows will be saved.</p>
        </div>
      </div>

      {saved && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm font-medium">
          Stock updated! Redirecting…
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <input
        type="search"
        placeholder="Filter ingredients…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="form-input"
      />

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-rose-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-rose-50 border-b border-rose-100">
                <th className="table-header px-4 py-3 text-left">Ingredient</th>
                <th className="table-header px-4 py-3 text-right">Current</th>
                <th className="table-header px-4 py-3 text-right w-36">Counted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50">
              {filtered.map((row) => (
                <tr key={row.ingredientId} className={row.dirty ? "bg-amber-50/60" : "hover:bg-rose-50/40"}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-800 text-sm">{row.name}</span>
                    <span className="ml-1.5 text-xs text-gray-400">{row.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-500 tabular-nums">
                    {row.current}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.counted}
                      onChange={(e) => setCounted(row.ingredientId, e.target.value)}
                      className={`w-28 text-right rounded-lg border px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 transition-colors ${
                        row.dirty
                          ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-300"
                          : "border-rose-200 bg-white focus:border-brand-400 focus:ring-brand-300"
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-sm text-gray-500">
          {changedCount > 0
            ? <span className="font-medium text-amber-700">{changedCount} ingredient{changedCount !== 1 ? "s" : ""} changed</span>
            : "No changes yet"}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-xl text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="px-6 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : `Save count${changedCount > 0 ? ` (${changedCount})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
