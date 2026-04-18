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
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
          <h1 className="page-title">Batch Recorded</h1>
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm font-medium">
          Production batch recorded successfully.
        </div>

        {insufficient.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-700 mb-2">Insufficient stock for:</p>
            {insufficient.map((d) => (
              <p key={d.ingredientId} className="text-amber-600">
                • Needed {d.requested.toFixed(2)} — only {d.deducted.toFixed(2)} available
              </p>
            ))}
          </div>
        )}

        {result.reorderAlerts.length > 0 && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-sm">
            <p className="font-semibold text-orange-700 mb-1">Draft purchase orders created:</p>
            <p className="text-orange-600 text-xs">{result.reorderAlerts.length} ingredient(s) hit reorder point. Check Orders for draft POs.</p>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 text-sm font-bold text-brand-400 uppercase tracking-wider">Stock deductions</div>
          <div className="divide-y divide-rose-50">
            {result.deductions.map((d) => (
              <div key={d.ingredientId} className="px-4 py-2.5 flex justify-between items-center text-sm">
                <span className="font-mono text-xs text-brand-300">{d.ingredientId.slice(0, 8)}…</span>
                <span className={`font-mono font-semibold ${d.insufficient ? "text-amber-600" : "text-emerald-600"}`}>
                  -{d.deducted.toFixed(2)} / {d.requested.toFixed(2)} needed
                </span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => router.push("/inventory")}
          className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 transition-colors">
          Back to inventory
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <h1 className="page-title">Record Production Batch</h1>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">Recipe *</label>
          <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} required className="form-input">
            <option value="">Select recipe…</option>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {selectedRecipe && (
          <div className="card px-4 py-3 bg-rose-50 text-sm text-brand-600">
            Yield per batch: <span className="font-semibold text-brand-700">{selectedRecipe.yieldAmount} {selectedRecipe.yieldUnit}</span>
          </div>
        )}

        {/* Scale factor stepper */}
        <div>
          <label className="form-label">Batches / scale factor *</label>
          <div className="flex items-center gap-3 mt-1">
            <button type="button"
              onClick={() => setScaleFactor((v) => String(Math.max(0.25, parseFloat(v) - 0.25)))}
              className="w-14 h-14 rounded-xl bg-white border border-rose-200 text-2xl font-bold text-brand-600 hover:bg-rose-50 transition-colors">
              −
            </button>
            <input type="number" step="0.25" min="0.25" value={scaleFactor}
              onChange={(e) => setScaleFactor(e.target.value)}
              className="flex-1 text-center py-4 rounded-xl border border-rose-200 text-xl font-bold text-gray-800 bg-white focus:outline-none focus:border-brand-400" />
            <button type="button"
              onClick={() => setScaleFactor((v) => String(parseFloat(v) + 0.25))}
              className="w-14 h-14 rounded-xl bg-white border border-rose-200 text-2xl font-bold text-brand-600 hover:bg-rose-50 transition-colors">
              +
            </button>
          </div>
          {selectedRecipe && (
            <p className="text-xs text-brand-400 mt-1 text-center">
              Will produce {(parseFloat(selectedRecipe.yieldAmount) * parseFloat(scaleFactor || "1")).toFixed(2)} {selectedRecipe.yieldUnit}
            </p>
          )}
        </div>

        <div>
          <label className="form-label">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="e.g. morning run, special order…" className="form-input resize-none" />
        </div>

        <div className="card px-4 py-3 bg-rose-50 text-xs text-brand-500">
          Stock will be deducted automatically using <span className="font-semibold text-brand-700">FEFO</span> (first-expiring lots first). A draft purchase order is created if any ingredient hits its reorder point.
        </div>

        <button type="submit" disabled={isPending}
          className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-base hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {isPending ? "Recording…" : "Record batch"}
        </button>
      </form>
    </div>
  );
}
