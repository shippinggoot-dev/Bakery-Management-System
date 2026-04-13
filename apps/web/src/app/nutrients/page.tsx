"use client";

import { useState, useRef } from "react";
import { api } from "@/trpc/react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function scale(value: number, totalGrams: number, servingGrams: number) {
  if (totalGrams <= 0) return 0;
  return (value / totalGrams) * servingGrams;
}

// ── Nutrition edit form (inline, per ingredient) ──────────────────────────────

interface NutritionFields {
  caloriesKcal: string;
  proteinG: string;
  fatTotalG: string;
  fatSaturatedG: string;
  carbsTotalG: string;
  carbsSugarsG: string;
  fiberG: string;
  sodiumMg: string;
  gramsPerUnit: string;
}

function IngredientNutritionEdit({
  ingredient,
  onSaved,
}: {
  ingredient: {
    ingredientId: string;
    ingredientName: string;
    ingredientUnit: string;
    gramsPerUnit: string | null;
    hasNutrition: boolean;
  };
  onSaved: () => void;
}) {
  const utils = api.useUtils();
  const [fields, setFields] = useState<NutritionFields>({
    caloriesKcal:  "",
    proteinG:      "",
    fatTotalG:     "",
    fatSaturatedG: "",
    carbsTotalG:   "",
    carbsSugarsG:  "",
    fiberG:        "",
    sodiumMg:      "",
    gramsPerUnit:  ingredient.gramsPerUnit ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = api.ingredients.update.useMutation({
    onSuccess: async () => {
      await utils.recipes.calculateNutrition.invalidate();
      setSaving(false);
      onSaved();
    },
    onError: (e) => { setError(e.message); setSaving(false); },
  });

  function set(k: keyof NutritionFields, v: string) {
    setFields((prev) => ({ ...prev, [k]: v }));
  }

  function handleSave() {
    setSaving(true);
    setError(null);
    update.mutate({
      id: ingredient.ingredientId,
      data: {
        caloriesKcal:  fields.caloriesKcal  || null,
        proteinG:      fields.proteinG      || null,
        fatTotalG:     fields.fatTotalG     || null,
        fatSaturatedG: fields.fatSaturatedG || null,
        carbsTotalG:   fields.carbsTotalG   || null,
        carbsSugarsG:  fields.carbsSugarsG  || null,
        fiberG:        fields.fiberG        || null,
        sodiumMg:      fields.sodiumMg      || null,
        gramsPerUnit:  fields.gramsPerUnit  || null,
      },
    });
  }

  const isNonGram = !["g", "gram", "grams", "kg", "ml", "milliliter", "millilitre", "l", "liter", "litre", "tsp", "tbsp", "cup", "oz", "lb"]
    .includes(ingredient.ingredientUnit.toLowerCase());

  return (
    <div className="bg-brand-50 rounded-xl border border-brand-200 p-4 mt-2 space-y-3">
      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider">
        {ingredient.ingredientName} — nutrition per 100 g
      </p>

      {isNonGram && (
        <div>
          <label className="form-label">Grams per {ingredient.ingredientUnit} (for weight conversion)</label>
          <input
            className="form-input w-40 text-sm"
            placeholder="e.g. 52"
            value={fields.gramsPerUnit}
            onChange={(e) => set("gramsPerUnit", e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            ["caloriesKcal",  "Calories (kcal)"],
            ["proteinG",      "Protein (g)"],
            ["fatTotalG",     "Fat (g)"],
            ["fatSaturatedG", "Saturates (g)"],
            ["carbsTotalG",   "Carbs (g)"],
            ["carbsSugarsG",  "Sugars (g)"],
            ["fiberG",        "Fibre (g)"],
            ["sodiumMg",      "Sodium (mg)"],
          ] as [keyof NutritionFields, string][]
        ).map(([key, label]) => (
          <div key={key}>
            <label className="form-label">{label}</label>
            <input
              className="form-input text-sm"
              placeholder="0"
              value={fields[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save nutrition data"}
      </button>
    </div>
  );
}

// ── Food label ────────────────────────────────────────────────────────────────

interface NutritionTotals {
  calories: number;
  protein: number;
  fatTotal: number;
  fatSaturated: number;
  carbsTotal: number;
  carbsSugars: number;
  fiber: number;
  sodium: number;
  salt: number;
}

function FoodLabel({
  totals,
  totalGrams,
  servingGrams,
  servingLabel,
}: {
  totals: NutritionTotals;
  totalGrams: number;
  servingGrams: number;
  servingLabel: string;
}) {
  const per100 = totalGrams > 0
    ? {
        calories:     scale(totals.calories,     totalGrams, 100),
        protein:      scale(totals.protein,      totalGrams, 100),
        fatTotal:     scale(totals.fatTotal,      totalGrams, 100),
        fatSaturated: scale(totals.fatSaturated,  totalGrams, 100),
        carbsTotal:   scale(totals.carbsTotal,    totalGrams, 100),
        carbsSugars:  scale(totals.carbsSugars,   totalGrams, 100),
        fiber:        scale(totals.fiber,         totalGrams, 100),
        salt:         scale(totals.salt,          totalGrams, 100),
      }
    : null;

  const perServing = servingGrams > 0 && totalGrams > 0
    ? {
        calories:     scale(totals.calories,     totalGrams, servingGrams),
        protein:      scale(totals.protein,      totalGrams, servingGrams),
        fatTotal:     scale(totals.fatTotal,      totalGrams, servingGrams),
        fatSaturated: scale(totals.fatSaturated,  totalGrams, servingGrams),
        carbsTotal:   scale(totals.carbsTotal,    totalGrams, servingGrams),
        carbsSugars:  scale(totals.carbsSugars,   totalGrams, servingGrams),
        fiber:        scale(totals.fiber,         totalGrams, servingGrams),
        salt:         scale(totals.salt,          totalGrams, servingGrams),
      }
    : null;

  type LabelKey = "calories" | "fatTotal" | "fatSaturated" | "carbsTotal" | "carbsSugars" | "fiber" | "protein" | "salt";
  const rows: Array<{ label: string; indent?: boolean; unit: string; key: LabelKey }> = [
    { label: "Energy",                    unit: "kcal", key: "calories"     },
    { label: "Fat",                        unit: "g",    key: "fatTotal"     },
    { label: "of which saturates",  indent: true, unit: "g", key: "fatSaturated" },
    { label: "Carbohydrates",              unit: "g",    key: "carbsTotal"   },
    { label: "of which sugars",     indent: true, unit: "g", key: "carbsSugars"  },
    { label: "Fibre",                      unit: "g",    key: "fiber"        },
    { label: "Protein",                    unit: "g",    key: "protein"      },
    { label: "Salt",                       unit: "g",    key: "salt"         },
  ];

  return (
    <div className="border-2 border-gray-900 font-mono text-sm w-full max-w-md">
      {/* Header */}
      <div className="bg-gray-900 text-white px-3 py-2">
        <p className="text-xl font-black tracking-tight">Nutrition Facts</p>
      </div>

      {/* Column headers */}
      <div className="flex border-b-4 border-gray-900 px-3 py-1.5 bg-white">
        <div className="flex-1" />
        <div className="w-28 text-center text-[10px] font-bold text-gray-600 uppercase">Per 100 g</div>
        {perServing && (
          <div className="w-28 text-center text-[10px] font-bold text-gray-600 uppercase">{servingLabel}</div>
        )}
      </div>

      {/* Rows */}
      <div className="bg-white divide-y divide-gray-200">
        {rows.map(({ label, indent, unit, key }) => (
          <div key={key} className="flex items-center px-3 py-1">
            <span className={`flex-1 text-xs ${indent ? "pl-4 text-gray-500" : "font-semibold text-gray-900"}`}>
              {label}
            </span>
            <span className="w-28 text-right text-xs text-gray-800">
              {per100 ? `${fmt(per100[key], unit === "kcal" ? 0 : 1)} ${unit}` : "—"}
            </span>
            {perServing && (
              <span className="w-28 text-right text-xs text-gray-800">
                {`${fmt(perServing[key], unit === "kcal" ? 0 : 1)} ${unit}`}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t-4 border-gray-900 px-3 py-1 bg-white">
        <p className="text-[9px] text-gray-500">Values are approximate. Sodium × 2.54 = salt equivalent.</p>
      </div>
    </div>
  );
}

// ── Copy helper ───────────────────────────────────────────────────────────────

function buildCopyText(
  recipeName: string,
  totals: NutritionTotals,
  totalGrams: number,
  servingGrams: number,
  servingLabel: string,
) {
  function row(label: string, per100: number, serving: number | null, unit: string) {
    const s = serving !== null ? `  |  ${fmt(serving, unit === "kcal" ? 0 : 1)} ${unit}` : "";
    return `${label.padEnd(24)}${fmt(per100, unit === "kcal" ? 0 : 1)} ${unit}${s}`;
  }

  const p100 = (key: keyof NutritionTotals) =>
    totalGrams > 0 ? scale(totals[key] as number, totalGrams, 100) : 0;
  const pSrv = (key: keyof NutritionTotals) =>
    servingGrams > 0 && totalGrams > 0 ? scale(totals[key] as number, totalGrams, servingGrams) : null;

  const header = servingGrams > 0 && totalGrams > 0
    ? `${"".padEnd(24)}Per 100 g  |  ${servingLabel}`
    : `${"".padEnd(24)}Per 100 g`;

  return [
    `NUTRITIONAL VALUES — ${recipeName.toUpperCase()}`,
    "",
    header,
    "─".repeat(54),
    row("Energy",               p100("calories"),     pSrv("calories"),     "kcal"),
    row("Fat",                  p100("fatTotal"),      pSrv("fatTotal"),     "g"),
    row("  of which saturates", p100("fatSaturated"),  pSrv("fatSaturated"), "g"),
    row("Carbohydrates",        p100("carbsTotal"),    pSrv("carbsTotal"),   "g"),
    row("  of which sugars",    p100("carbsSugars"),   pSrv("carbsSugars"),  "g"),
    row("Fibre",                p100("fiber"),         pSrv("fiber"),        "g"),
    row("Protein",              p100("protein"),       pSrv("protein"),      "g"),
    row("Salt",                 p100("salt"),          pSrv("salt"),         "g"),
    "─".repeat(54),
  ].join("\n");
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NutrientsPage() {
  const [recipeId, setRecipeId]           = useState<string>("");
  const [servingMode, setServingMode]     = useState<"100g" | "whole" | "custom">("100g");
  const [customGrams, setCustomGrams]     = useState("100");
  const [expandedIng, setExpandedIng]     = useState<string | null>(null);
  const [copied, setCopied]               = useState(false);
  const copyRef                           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: recipes = [] } = api.recipes.getAll.useQuery({ limit: 100 });
  const { data: nutrition, isLoading: loadingNutrition } = api.recipes.calculateNutrition.useQuery(
    recipeId,
    { enabled: !!recipeId }
  );

  // Determine serving size in grams
  const servingGrams = (() => {
    if (!nutrition?.totalGrams) return 0;
    if (servingMode === "100g") return 100;
    if (servingMode === "whole") return nutrition.totalGrams;
    const g = parseFloat(customGrams);
    return isNaN(g) || g <= 0 ? 0 : g;
  })();

  const servingLabel = (() => {
    if (servingMode === "100g") return "Per 100 g";
    if (servingMode === "whole") return `Whole recipe (${fmt(nutrition?.totalGrams ?? 0, 0)} g)`;
    return `Per ${customGrams} g`;
  })();

  function handleCopy() {
    if (!nutrition) return;
    const text = buildCopyText(
      nutrition.recipeName,
      nutrition.totals,
      nutrition.totalGrams ?? 0,
      servingGrams,
      servingLabel,
    );
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copyRef.current) clearTimeout(copyRef.current);
      copyRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  const missingIngredients = nutrition?.lineItems.filter((l) => !l.hasNutrition || l.grams === null) ?? [];
  const coveragePct = nutrition
    ? Math.round((nutrition.coverage.withNutrition / (nutrition.coverage.total || 1)) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="page-title">Nutrients</h2>
        <p className="text-gray-500 mt-1 text-sm">Select a recipe to generate a copy-ready nutrition label.</p>
      </div>

      {/* Recipe picker */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="form-label">Recipe</label>
          <select
            className="form-input max-w-sm"
            value={recipeId}
            onChange={(e) => { setRecipeId(e.target.value); setExpandedIng(null); }}
          >
            <option value="">— Select a recipe —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Serving size selector */}
        {nutrition && nutrition.totalGrams && (
          <div className="space-y-2">
            <label className="form-label">Show values per</label>
            <div className="flex flex-wrap gap-2">
              {(["100g", "whole", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setServingMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    servingMode === mode
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-brand-600 border-brand-200 hover:border-brand-400"
                  }`}
                >
                  {mode === "100g" ? "Per 100 g" : mode === "whole" ? "Whole recipe" : "Custom"}
                </button>
              ))}
            </div>
            {servingMode === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  className="form-input w-28 text-sm"
                  type="number"
                  min="1"
                  placeholder="grams"
                  value={customGrams}
                  onChange={(e) => setCustomGrams(e.target.value)}
                />
                <span className="text-sm text-gray-500">grams per serving</span>
              </div>
            )}
          </div>
        )}
      </div>

      {loadingNutrition && (
        <div className="card p-8 text-center text-gray-400">Calculating…</div>
      )}

      {nutrition && (
        <>
          {/* Coverage warning */}
          {missingIngredients.length > 0 && (
            <div className="card p-4 border-amber-200 bg-amber-50 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-lg mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">
                    {coveragePct}% of ingredients have nutrition data
                    ({nutrition.coverage.withNutrition} / {nutrition.coverage.total})
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Add data for the missing ingredients below to get accurate values.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                {missingIngredients.map((li) => (
                  <div key={li.ingredientId}>
                    <button
                      onClick={() => setExpandedIng(expandedIng === li.ingredientId ? null : li.ingredientId)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-amber-200 hover:border-amber-400 transition-colors text-sm"
                    >
                      <span className="font-medium text-gray-800">
                        {li.ingredientName}
                        {li.grams === null && (
                          <span className="ml-2 text-xs text-amber-600 font-normal">
                            (also needs grams-per-{li.ingredientUnit})
                          </span>
                        )}
                      </span>
                      <span className="text-gray-400 text-xs">{expandedIng === li.ingredientId ? "▲ close" : "▼ add data"}</span>
                    </button>

                    {expandedIng === li.ingredientId && (
                      <IngredientNutritionEdit
                        ingredient={li}
                        onSaved={() => setExpandedIng(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Label + copy */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Food label */}
            <div>
              <p className="form-label mb-3">Nutrition label</p>
              {nutrition.totalGrams ? (
                <FoodLabel
                  totals={nutrition.totals}
                  totalGrams={nutrition.totalGrams}
                  servingGrams={servingMode === "100g" ? 0 : servingGrams}
                  servingLabel={servingLabel}
                />
              ) : (
                <div className="card p-6 text-center text-gray-400 text-sm">
                  Unable to calculate — ingredient weights unknown.
                  <br />Add grams-per-unit for all ingredients.
                </div>
              )}
            </div>

            {/* Copy panel */}
            <div className="space-y-4">
              <div>
                <p className="form-label mb-3">Copy to clipboard</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-700 font-mono whitespace-pre overflow-x-auto leading-relaxed">
                  {nutrition.totalGrams
                    ? buildCopyText(
                        nutrition.recipeName,
                        nutrition.totals,
                        nutrition.totalGrams,
                        servingMode === "100g" ? 0 : servingGrams,
                        servingLabel,
                      )
                    : "— weights not available —"}
                </pre>
                <button
                  onClick={handleCopy}
                  disabled={!nutrition.totalGrams}
                  className="mt-3 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
                >
                  {copied ? "Copied!" : "Copy label text"}
                </button>
              </div>

              {/* Recipe yield info */}
              <div className="card p-4 text-sm text-gray-600 space-y-1">
                <p className="font-semibold text-gray-800">Recipe info</p>
                <p>Yield: {nutrition.yieldAmount} {nutrition.yieldUnit}</p>
                {nutrition.totalGrams && (
                  <p>Total weight: ~{fmt(nutrition.totalGrams, 0)} g</p>
                )}
                <p>Ingredients with data: {nutrition.coverage.withNutrition} / {nutrition.coverage.total}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {!recipeId && (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Select a recipe above to generate a nutrition label.
        </div>
      )}
    </div>
  );
}
