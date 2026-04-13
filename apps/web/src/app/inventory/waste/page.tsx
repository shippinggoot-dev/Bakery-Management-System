"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";

const WASTE_REASONS = [
  { value: "expired",        label: "Expired",         icon: "📅" },
  { value: "damaged",        label: "Damaged",          icon: "💥" },
  { value: "quality_issue",  label: "Quality issue",    icon: "⚠️" },
  { value: "spillage",       label: "Spillage",         icon: "💧" },
  { value: "trimming",       label: "Trimming",         icon: "✂️" },
  { value: "overproduction", label: "Overproduction",   icon: "📦" },
  { value: "other",          label: "Other",            icon: "❓" },
] as const;

type WasteReason = (typeof WASTE_REASONS)[number]["value"];

export default function WastePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}>
      <WastePageInner />
    </Suspense>
  );
}

function WastePageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const { data: ingredients = [] } = api.ingredients.getAll.useQuery();
  const { mutateAsync: logWaste, isPending } = api.inventory.logWaste.useMutation();

  const [ingredientId, setIngredientId] = useState(searchParams.get("ingredientId") ?? "");
  const [quantity,     setQuantity]     = useState("");
  const [reason,       setReason]       = useState<WasteReason>("other");
  const [notes,        setNotes]        = useState("");
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);
  const [reorderAlert, setReorderAlert] = useState(false);

  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ingredientId) { setError("Select an ingredient."); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError("Enter a valid quantity."); return; }

    try {
      const res = await logWaste({
        ingredientId,
        quantity: qty,
        unit: selectedIngredient?.unit ?? "g",
        reason,
        notes: notes || null,
      });
      setSuccess(true);
      setReorderAlert(!!res.reorderAlert);
      setTimeout(() => router.push("/inventory"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log waste.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">←</button>
        <h1 className="text-lg font-bold">Log Waste</h1>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5 lg:px-8">
        {success && (
          <div className="space-y-2">
            <div className="rounded-xl bg-emerald-900/40 border border-emerald-700 text-emerald-300 px-4 py-3 text-sm font-medium">
              Waste logged. Redirecting…
            </div>
            {reorderAlert && (
              <div className="rounded-xl bg-orange-900/40 border border-orange-700 text-orange-300 px-4 py-3 text-sm">
                Stock hit reorder point — a draft purchase order has been created.
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Ingredient */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ingredient *</label>
            <select
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">Select ingredient…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Quantity wasted {selectedIngredient && <span className="text-gray-600">({selectedIngredient.unit})</span>} *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder="0"
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Reason — large touch targets */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Reason *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {WASTE_REASONS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReason(value)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    reason === value
                      ? "bg-red-900/50 border-red-700 text-red-300"
                      : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                  }`}
                >
                  <span className="text-xl leading-none">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Details about what happened…"
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm resize-none focus:outline-none focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || success}
            className="w-full py-4 rounded-xl bg-red-700 text-white font-bold text-base hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Logging…" : "Log waste"}
          </button>
        </form>
      </div>
    </div>
  );
}
