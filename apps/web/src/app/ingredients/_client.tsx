"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";
import type { AppRouter } from "@bakery/api";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type IngredientsData  = RouterOutputs["ingredients"]["getAll"];
type CategoriesData   = RouterOutputs["ingredients"]["getCategories"];
type AllergensData    = RouterOutputs["ingredients"]["getAllAllergens"];

const allergenColour: Record<string, string> = {
  Gluten:      "bg-yellow-950/60 text-yellow-300",
  Milk:        "bg-blue-950/60 text-blue-300",
  Eggs:        "bg-orange-950/60 text-orange-300",
  "Tree Nuts": "bg-emerald-950/60 text-emerald-300",
  Peanuts:     "bg-red-950/60 text-red-300",
  Soy:         "bg-purple-950/60 text-purple-300",
  Sesame:      "bg-stone-900 text-stone-300",
};

const COMMON_UNITS = ["g", "kg", "ml", "L", "piece", "tsp", "tbsp"];

function AddIngredientForm({
  onClose,
  initialCategories,
  initialAllergens,
}: {
  onClose: () => void;
  initialCategories: CategoriesData;
  initialAllergens: AllergensData;
}) {
  const t  = useTranslations("ingredients");
  const tc = useTranslations("common");
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const [categoryId, setCategoryId] = useState("");
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: categories = initialCategories } = api.ingredients.getCategories.useQuery(
    undefined,
    { initialData: initialCategories, initialDataUpdatedAt: Date.now() }
  );
  const { data: allAllergens = initialAllergens } = api.ingredients.getAllAllergens.useQuery(
    undefined,
    { initialData: initialAllergens, initialDataUpdatedAt: Date.now() }
  );

  const create = api.ingredients.create.useMutation({
    onSuccess: () => { utils.ingredients.getAll.invalidate(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function toggleAllergen(id: string) {
    setSelectedAllergens((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("nameLabel") + " required");
    setError(null);
    create.mutate({
      ingredient: {
        name: name.trim(),
        unit: unit.trim(),
        categoryId: categoryId || null,
        notes: notes.trim() || null,
      },
      allergenIds: selectedAllergens,
    });
  }

  return (
    <div className="card p-6 border-brand-500/30 bg-brand-500/5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{t("newIngredientTitle")}</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("nameLabel")}</label>
            <input className="form-input" placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="form-label">{t("unitLabel")}</label>
            <div className="flex gap-2">
              <input className="form-input" placeholder="g" value={unit} onChange={(e) => setUnit(e.target.value)} required />
              <div className="flex gap-1 flex-wrap">
                {COMMON_UNITS.map((u) => (
                  <button key={u} type="button" onClick={() => setUnit(u)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${unit === u ? "border-brand-500/50 text-brand-400 bg-brand-500/10" : "border-gray-700 text-gray-600 hover:text-gray-400"}`}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("categoryLabel")}</label>
            <select className="form-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("noCategory")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">{t("notesLabel")}</label>
            <input className="form-input" placeholder={t("notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {allAllergens.length > 0 && (
          <div>
            <label className="form-label">{t("allergens")}</label>
            <div className="flex flex-wrap gap-2">
              {allAllergens.map((a) => (
                <button key={a.id} type="button" onClick={() => toggleAllergen(a.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedAllergens.includes(a.id)
                      ? "border-brand-500/50 text-brand-400 bg-brand-500/10"
                      : "border-gray-700 text-gray-600 hover:text-gray-400"
                  }`}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={create.isPending}
            className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50">
            {create.isPending ? t("saving") : t("addIngredient")}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors">{tc("cancel")}</button>
        </div>
      </form>
    </div>
  );
}

export default function IngredientsClient({
  initialIngredients,
  initialCategories,
  initialAllergens,
}: {
  initialIngredients: IngredientsData;
  initialCategories: CategoriesData;
  initialAllergens: AllergensData;
}) {
  const t = useTranslations("ingredients");
  const [showAdd, setShowAdd] = useState(false);

  const { data: ingredients = [] } = api.ingredients.getAll.useQuery(
    { limit: 200 },
    { initialData: initialIngredients, initialDataUpdatedAt: Date.now() }
  );

  const grouped = ingredients.reduce<Record<string, typeof ingredients>>(
    (acc, ing) => {
      const cat = ing.category?.name ?? t("uncategorised");
      if (!acc[cat]) acc[cat] = [];
      acc[cat]!.push(ing);
      return acc;
    },
    {}
  );
  const categories = Object.keys(grouped).sort();

  const subtitle = t("subtitle")
    .replace("{count}", String(ingredients.length))
    .replace("{categories}", String(categories.length));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{subtitle}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          {t("newIngredient")}
        </button>
      </div>

      {showAdd && (
        <AddIngredientForm
          onClose={() => setShowAdd(false)}
          initialCategories={initialCategories}
          initialAllergens={initialAllergens}
        />
      )}

      {categories.map((cat) => (
        <div key={cat} className="card overflow-hidden">
          <div className="px-6 py-3 bg-gray-800/50 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400">{cat}</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="table-header px-6 py-3">{t("nameCol")}</th>
                <th className="table-header px-6 py-3">{t("unitCol")}</th>
                <th className="table-header px-6 py-3">{t("allergensCol")}</th>
                <th className="table-header px-6 py-3">{t("supplierPriceCol")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {grouped[cat]!.map((ing) => (
                <tr key={ing.id} className="hover:bg-gray-800/40">
                  <td className="px-6 py-3 font-medium text-gray-200">{ing.name}</td>
                  <td className="px-6 py-3 text-gray-500 text-sm">{ing.unit}</td>
                  <td className="px-6 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ing.allergens.length === 0 ? (
                        <span className="text-gray-700 text-sm">{t("noneAllergens")}</span>
                      ) : (
                        ing.allergens.map((ia) => {
                          const aName = ia.allergen?.name ?? "";
                          return (
                            <span key={aName} className={`badge ${allergenColour[aName] ?? "bg-gray-800 text-gray-400"}`}>{aName}</span>
                          );
                        })
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {ing.supplierPrices?.[0] ? (
                      <div>
                        <span className="text-brand-400 font-medium">{parseFloat(ing.supplierPrices[0].pricePerUnit).toFixed(2)} / {ing.supplierPrices[0].unit}</span>
                        <p className="text-xs text-gray-600 mt-0.5">{ing.supplierPrices[0].supplier?.name}</p>
                      </div>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  );
}
