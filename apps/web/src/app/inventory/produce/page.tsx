"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

type Deduction = {
  ingredientId: string;
  requested:    number;
  deducted:     number;
  insufficient: boolean;
};

type DeductionWithMeta = Deduction & {
  name: string;
  unit: string;
  currentStock: number;
};

/**
 * Inline mini-stocktake row. Lets the user immediately recount one
 * ingredient that the deduction flagged as insufficient — most "insufficient
 * stock" warnings turn out to be drift between the system and the shelf.
 */
function MiniStocktakeRow({
  d,
  onSaved,
}: {
  d: DeductionWithMeta;
  onSaved: () => void;
}) {
  const t = useTranslations("produce");
  const [counted, setCounted] = useState(String(d.currentStock));
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const adjust = api.inventory.adjustStock.useMutation();

  function parseCount(value: string) {
    return parseFloat(value.replace(",", "."));
  }

  async function handleSave() {
    const value = parseCount(counted);
    if (isNaN(value) || value < 0) {
      setError(t("invalidCount"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adjust.mutateAsync({
        ingredientId: d.ingredientId,
        newQuantity:  value,
        unit:         d.unit,
        notes:        "Stocktake (mini)",
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
        ✓ {t("countSaved").replace("{name}", d.name)}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white border border-amber-200 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">{d.name}</p>
        <p className="text-xs text-amber-700">
          {t("needed")} {d.requested.toFixed(2)} {d.unit}
        </p>
      </div>
      <p className="text-xs text-gray-500">{t("miniStocktakePrompt")}</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          className="form-input flex-1 text-sm"
          placeholder={t("countedPlaceholder")}
        />
        <span className="text-xs text-gray-500">{d.unit}</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
        >
          {saving ? t("saving") : t("saveCount")}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ProducePage() {
  const router = useRouter();
  const search = useSearchParams();
  const t  = useTranslations("produce");
  const tc = useTranslations("common");

  const { data: recipes = [] }     = api.recipes.getAll.useQuery();
  const { data: stockLevels = [] } = api.inventory.getStockLevels.useQuery();
  const { mutateAsync: recordProduction, isPending } = api.inventory.recordProduction.useMutation();
  const utils = api.useUtils();

  const [recipeId,    setRecipeId]    = useState("");
  const [scaleFactor, setScaleFactor] = useState("1");
  const [notes,       setNotes]       = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<{
    batchId: string;
    deductions: Deduction[];
    reorderAlerts: string[];
  } | null>(null);

  // Pre-select recipe from URL parameter (set by "Make this now" button)
  useEffect(() => {
    const fromUrl = search.get("recipeId");
    if (fromUrl && !recipeId) setRecipeId(fromUrl);
  }, [search, recipeId]);

  const selectedRecipe = recipes.find((r) => r.id === recipeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const scale = parseFloat(scaleFactor);
    if (!recipeId)            { setError(t("selectRecipe")); return; }
    if (!scale || scale <= 0) { setError(t("invalidScale"));  return; }
    try {
      const res = await recordProduction({ recipeId, scaleFactor: scale, notes: notes || null });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("recordFailed"));
    }
  }

  if (result) {
    // Decorate deductions with ingredient metadata for the mini-stocktake UI
    const insufficient: DeductionWithMeta[] = result.deductions
      .filter((d) => d.insufficient)
      .map((d) => {
        const lvl = stockLevels.find((s) => s.ingredientId === d.ingredientId);
        return {
          ...d,
          name:         lvl?.name         ?? d.ingredientId.slice(0, 8),
          unit:         lvl?.unit         ?? "",
          currentStock: lvl?.currentStock ?? 0,
        };
      });

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
          <h1 className="page-title">{t("batchRecorded")}</h1>
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm font-medium">
          {t("recordedBody")}
        </div>

        {insufficient.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-3">
            <div>
              <p className="font-semibold text-amber-700 text-sm">{t("insufficientHeader")}</p>
              <p className="text-amber-600 text-xs mt-0.5">{t("insufficientHint")}</p>
            </div>
            <div className="space-y-2">
              {insufficient.map((d) => (
                <MiniStocktakeRow
                  key={d.ingredientId}
                  d={d}
                  onSaved={() => utils.inventory.getStockLevels.invalidate()}
                />
              ))}
            </div>
          </div>
        )}

        {result.reorderAlerts.length > 0 && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-sm">
            <p className="font-semibold text-orange-700 mb-1">{t("draftPosCreated")}</p>
            <p className="text-orange-600 text-xs">
              {t("draftPosBody").replace("{count}", String(result.reorderAlerts.length))}
            </p>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 text-sm font-bold text-brand-400 uppercase tracking-wider">{t("stockDeductions")}</div>
          <div className="divide-y divide-rose-50">
            {result.deductions.map((d) => {
              const lvl = stockLevels.find((s) => s.ingredientId === d.ingredientId);
              return (
                <div key={d.ingredientId} className="px-4 py-2.5 flex justify-between items-center text-sm">
                  <span className="text-gray-800">{lvl?.name ?? d.ingredientId.slice(0, 8) + "…"}</span>
                  <span className={`font-mono font-semibold ${d.insufficient ? "text-amber-600" : "text-emerald-600"}`}>
                    -{d.deducted.toFixed(2)} / {d.requested.toFixed(2)} {lvl?.unit ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={() => router.push("/inventory")}
          className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 transition-colors">
          {t("backToInventory")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <h1 className="page-title">{t("title")}</h1>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">{t("recipeLabel")} *</label>
          <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} required className="form-input">
            <option value="">{t("selectRecipePlaceholder")}</option>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {selectedRecipe && (
          <div className="card px-4 py-3 bg-rose-50 text-sm text-brand-600">
            {t("yieldPerBatch")}: <span className="font-semibold text-brand-700">{selectedRecipe.yieldAmount} {selectedRecipe.yieldUnit}</span>
          </div>
        )}

        {/* Scale factor stepper */}
        <div>
          <label className="form-label">{t("batchesLabel")} *</label>
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
              {t("willProduce")} {(parseFloat(selectedRecipe.yieldAmount) * parseFloat(scaleFactor || "1")).toFixed(2)} {selectedRecipe.yieldUnit}
            </p>
          )}
        </div>

        <div>
          <label className="form-label">{t("notesLabel")}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder={t("notesPlaceholder")} className="form-input resize-none" />
        </div>

        <div className="card px-4 py-3 bg-rose-50 text-xs text-brand-500">
          {t("fefoExplanation")}
        </div>

        <button type="submit" disabled={isPending}
          className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-base hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {isPending ? t("recording") : t("recordBatch")}
        </button>
      </form>
    </div>
  );
}
