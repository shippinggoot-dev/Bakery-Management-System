"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

export default function ProducePage() {
  const router = useRouter();
  const { data: recipes = [] } = api.recipes.getAll.useQuery();
  const { mutateAsync: recordProduction, isPending } = api.inventory.recordProduction.useMutation();

  const [recipeId,    setRecipeId]    = useState("");
  const [scaleFactor, setScaleFactor] = useState("1");
  const [notes,       setNotes]       = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<{
    batchId: string;
    deductions: { ingredientId: string; requested: number; deducted: number; insufficient: boolean }[];
    reorderAlerts: string[];
  } | null>(null);

  const selectedRecipe = recipes.find((r) => r.id === recipeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const scale = parseFloat(scaleFactor);
    if (!recipeId)          { setError("Select a recipe."); return; }
    if (!scale || scale <= 0) { setError("Scale factor must be greater than 0."); return; }

    try {
      const res = await recordProduction({ recipeId, scaleFactor: scale, notes: notes || null });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record production batch.");
    }
  }

  if (result) {
    const insufficient = result.deductions.filter((d) => d.insufficient);
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">←</button>
          <h1 className="text-lg font-bold">Batch Recorded</h1>
        </div>
        <div className="px-4 pt-5 max-w-lg mx-auto space-y-4 lg:px-8">
          <div className="rounded-xl bg-emerald-900/40 border border-emerald-700 text-emerald-300 px-4 py-3 text-sm font-medium">
            Production batch recorded successfully.
          </div>

          {insufficient.length > 0 && (
            <div className="rounded-xl bg-amber-900/40 border border-amber-700 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-300 mb-2">Insufficient stock for:</p>
              {insufficient.map((d) => (
                <p key={d.ingredientId} className="text-amber-200">
                  • Needed {d.requested.toFixed(2)} — only {d.deducted.toFixed(2)} available
                </p>
              ))}
            </div>
          )}

          {result.reorderAlerts.length > 0 && (
            <div className="rounded-xl bg-orange-900/40 border border-orange-700 px-4 py-3 text-sm">
              <p className="font-semibold text-orange-300 mb-1">Draft purchase orders created:</p>
              <p className="text-orange-200 text-xs">{result.reorderAlerts.length} ingredient(s) hit reorder point. Check Orders for draft POs.</p>
            </div>
          )}

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 text-sm font-semibold text-gray-400">Stock deductions</div>
            <div className="divide-y divide-gray-800">
              {result.deductions.map((d) => (
                <div key={d.ingredientId} className="px-4 py-2.5 flex justify-between items-center text-sm">
                  <span className="text-gray-300 font-mono text-xs text-gray-600">{d.ingredientId.slice(0, 8)}…</span>
                  <span className={`font-mono ${d.insufficient ? "text-amber-400" : "text-emerald-400"}`}>
                    -{d.deducted.toFixed(2)} / {d.requested.toFixed(2)} needed
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => router.push("/inventory")}
            className="w-full py-4 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 transition-colors"
          >
            Back to inventory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">←</button>
        <h1 className="text-lg font-bold">Record Production Batch</h1>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5 lg:px-8">
        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recipe */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Recipe *</label>
            <select
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">Select recipe…</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Selected recipe info */}
          {selectedRecipe && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
              <div className="text-gray-400">
                Yield per batch: <span className="text-gray-100 font-semibold">{selectedRecipe.yieldAmount} {selectedRecipe.yieldUnit}</span>
              </div>
            </div>
          )}

          {/* Scale factor — big stepper for kitchen use */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Batches / scale factor *</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setScaleFactor((v) => String(Math.max(0.25, parseFloat(v) - 0.25)))}
                className="w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 text-2xl font-bold hover:bg-gray-700 transition-colors"
              >
                −
              </button>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={scaleFactor}
                onChange={(e) => setScaleFactor(e.target.value)}
                className="flex-1 text-center py-4 rounded-xl bg-gray-800 border border-gray-700 text-xl font-bold focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => setScaleFactor((v) => String(parseFloat(v) + 0.25))}
                className="w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 text-2xl font-bold hover:bg-gray-700 transition-colors"
              >
                +
              </button>
            </div>
            {selectedRecipe && (
              <p className="text-xs text-gray-500 mt-1 text-center">
                Will produce {(parseFloat(selectedRecipe.yieldAmount) * parseFloat(scaleFactor || "1")).toFixed(2)} {selectedRecipe.yieldUnit}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. morning run, special order…"
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm resize-none focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-xs text-gray-500">
            Stock will be deducted automatically using <span className="text-gray-300">FEFO</span> (first-expiring lots first). A draft purchase order is created if any ingredient hits its reorder point.
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-4 rounded-xl bg-purple-600 text-white font-bold text-base hover:bg-purple-500 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Recording…" : "Record batch"}
          </button>
        </form>
      </div>
    </div>
  );
}
