"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";
import { CategorySelect } from "@/components/CategorySelect";

function PreferredSupplierPicker({
  ingredientId,
  currentSupplierId,
  suppliers,
}: {
  ingredientId: string;
  currentSupplierId: string | null;
  suppliers: { id: string; name: string }[];
}) {
  const t = useTranslations("ingredients");
  const utils = api.useUtils();
  const setPreferred = api.ingredients.setPreferredSupplier.useMutation({
    onSuccess: () => utils.ingredients.getAll.invalidate(),
  });

  return (
    <select
      value={currentSupplierId ?? ""}
      onChange={(e) =>
        setPreferred.mutate({
          ingredientId,
          supplierId: e.target.value || null,
        })
      }
      disabled={setPreferred.isPending}
      className="text-xs border border-rose-200 rounded-lg px-2 py-1 bg-white text-gray-700 hover:border-brand-300 focus:outline-none focus:border-brand-400 disabled:opacity-50"
    >
      <option value="">{t("noPreferredSupplier")}</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

const allergenColour: Record<string, string> = {
  Gluten:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  Milk:        "bg-blue-50 text-blue-700 border-blue-200",
  Eggs:        "bg-orange-50 text-orange-700 border-orange-200",
  "Tree Nuts": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Peanuts:     "bg-red-50 text-red-700 border-red-200",
  Soy:         "bg-purple-50 text-purple-700 border-purple-200",
  Sesame:      "bg-stone-50 text-stone-700 border-stone-200",
};

const COMMON_UNITS = ["g", "kg", "ml", "L", "piece", "tsp", "tbsp"];

function AddIngredientForm({ onClose }: { onClose: () => void }) {
  const t  = useTranslations("ingredients");
  const tc = useTranslations("common");
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const [categoryId, setCategoryId] = useState("");
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = api.ingredients.getCategories.useQuery();
  const { data: allAllergens = [] } = api.ingredients.getAllAllergens.useQuery();
  const createCategory = api.ingredients.createCategory.useMutation();

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
                    className={`text-xs px-2 py-1 rounded border transition-colors ${unit === u ? "border-brand-500/50 text-brand-400 bg-brand-500/10" : "border-rose-200 text-gray-500 hover:text-gray-700"}`}>
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
            <CategorySelect
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCreate={(name) => createCategory.mutateAsync({ name }).then((c) => c!)}
              placeholder={t("noCategory")}
            />
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
                      : "border-rose-200 text-gray-500 hover:text-gray-700"
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

export default function IngredientsClient() {
  const t = useTranslations("ingredients");
  const [showAdd, setShowAdd] = useState(false);

  const { data: ingredients = [] }    = api.ingredients.getAll.useQuery({ limit: 200 });
  const { data: suppliersList = [] }  = api.suppliers.getAll.useQuery({ isActive: true, limit: 100 });

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
        />
      )}

      {categories.map((cat) => (
        <div key={cat} className="card overflow-hidden">
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-100">
            <h3 className="text-sm font-semibold text-gray-600">{cat}</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-rose-100">
                <th className="table-header px-6 py-3">{t("nameCol")}</th>
                <th className="table-header px-6 py-3">{t("unitCol")}</th>
                <th className="table-header px-6 py-3">{t("allergensCol")}</th>
                <th className="table-header px-6 py-3">{t("supplierPriceCol")}</th>
                <th className="table-header px-6 py-3">{t("preferredSupplierCol")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50">
              {grouped[cat]!.map((ing) => {
                const preferredSup = ing.ingredientSuppliers?.[0]?.supplier ?? null;
                return (
                <tr key={ing.id} className="hover:bg-rose-50/50">
                  <td className="px-6 py-3 font-medium text-gray-800">{ing.name}</td>
                  <td className="px-6 py-3 text-gray-500 text-sm">{ing.unit}</td>
                  <td className="px-6 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ing.allergens.length === 0 ? (
                        <span className="text-gray-700 text-sm">{t("noneAllergens")}</span>
                      ) : (
                        ing.allergens.map((ia) => {
                          const aName = ia.allergen?.name ?? "";
                          return (
                            <span key={aName} className={`badge ${allergenColour[aName] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>{aName}</span>
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
                  <td className="px-6 py-3">
                    <PreferredSupplierPicker
                      ingredientId={ing.id}
                      currentSupplierId={preferredSup?.id ?? null}
                      suppliers={suppliersList}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  );
}
