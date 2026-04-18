"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";

const WASTE_REASONS = [
  { value: "expired",        label: "Expired",       icon: "📅" },
  { value: "damaged",        label: "Damaged",        icon: "💥" },
  { value: "quality_issue",  label: "Quality issue",  icon: "⚠️" },
  { value: "spillage",       label: "Spillage",       icon: "💧" },
  { value: "trimming",       label: "Trimming",       icon: "✂️" },
  { value: "overproduction", label: "Overproduction", icon: "📦" },
  { value: "other",          label: "Other",          icon: "❓" },
] as const;

type WasteReason = (typeof WASTE_REASONS)[number]["value"];

export default function WastePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-brand-300">Loading…</div>}>
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
      const res = await logWaste({ ingredientId, quantity: qty, unit: selectedIngredient?.unit ?? "g", reason, notes: notes || null });
      setSuccess(true);
      setReorderAlert(!!res.reorderAlert);
      setTimeout(() => router.push("/inventory"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log waste.");
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <h1 className="page-title">Log Waste</h1>
      </div>

      {success && (
        <div className="space-y-2">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm font-medium">
            Waste logged. Redirecting…
          </div>
          {reorderAlert && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 text-sm">
              Stock hit reorder point — a draft purchase order has been created.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="form-label">Ingredient *</label>
          <select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} required className="form-input">
            <option value="">Select ingredient…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select>
        </div>

        <div>
          <label className="form-label">
            Quantity wasted {selectedIngredient && <span className="text-brand-300 normal-case font-normal">({selectedIngredient.unit})</span>} *
          </label>
          <input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            required placeholder="0" className="form-input" />
        </div>

        <div>
          <label className="form-label">Reason *</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 mt-1">
            {WASTE_REASONS.map(({ value, label, icon }) => (
              <button key={value} type="button" onClick={() => setReason(value)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-colors ${
                  reason === value
                    ? "bg-red-50 border-red-300 text-red-700"
                    : "bg-white border-rose-200 text-gray-500 hover:border-rose-300 hover:text-gray-700"
                }`}>
                <span className="text-xl leading-none">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Details about what happened…" className="form-input resize-none" />
        </div>

        <button type="submit" disabled={isPending || success}
          className="w-full py-3 rounded-xl bg-red-600 text-white font-bold text-base hover:bg-red-700 disabled:opacity-50 transition-colors">
          {isPending ? "Logging…" : "Log waste"}
        </button>
      </form>
    </div>
  );
}
