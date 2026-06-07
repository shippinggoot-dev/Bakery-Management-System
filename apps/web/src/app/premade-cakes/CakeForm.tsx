"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { TrashIcon, PlusIcon } from "@/components/icons";

export type CakeFormValues = {
  name:         string;
  description:  string;
  basePrice:    string;
  leadTimeDays: number;
  recipeId:     string | null;
  allergens:    string;
  isActive:     boolean;
  displayOrder: number;
  sizes:        SizeRow[];
  flavourIds:   string[];
  addonIds:     string[];
  variants:     VariantRow[];
};

export type SizeRow = {
  label:        string;
  diameterCm:   number | null;
  heightCm:     number | null;
  serves:       number | null;
  displayOrder: number;
};

/** Form-side variant row. `id` present = existing variant (UPDATE on
 *  save); absent = new variant (INSERT). `shopifyVariantId` is shown
 *  as a "Linked to Shopify" badge but cannot be edited — that value
 *  comes from two-way Shopify sync. */
export type VariantRow = {
  id?:               string;
  label:             string;
  sizeLabel:         string;
  serves:            number | null;
  occasion:          string;
  price:             string;
  shopifyMatchTitle: string;
  shopifyVariantId?: string | null;
  displayOrder:      number;
};

export const EMPTY_FORM: CakeFormValues = {
  name:         "",
  description:  "",
  basePrice:    "",
  leadTimeDays: 0,
  recipeId:     null,
  allergens:    "",
  isActive:     true,
  displayOrder: 0,
  sizes:        [],
  flavourIds:   [],
  addonIds:     [],
  variants:     [],
};

export function CakeForm({ initial, onSubmit, submitLabel, isSubmitting }: {
  initial:      CakeFormValues;
  onSubmit:     (v: CakeFormValues) => void;
  submitLabel:  string;
  isSubmitting: boolean;
}) {
  const t = useTranslations("premadeCakes");

  const [values, setValues] = useState<CakeFormValues>(initial);

  const { data: recipes  = [] } = api.recipes.getAll.useQuery({ limit: 100, isActive: true });
  const { data: flavours = [] } = api.premadeCakes.flavours.list.useQuery();
  const { data: addons   = [] } = api.premadeCakes.addons.list.useQuery();

  function patch(p: Partial<CakeFormValues>) { setValues((v) => ({ ...v, ...p })); }

  function addSize() {
    patch({
      sizes: [
        ...values.sizes,
        { label: "", diameterCm: null, heightCm: null, serves: null, displayOrder: values.sizes.length },
      ],
    });
  }
  function patchSize(i: number, p: Partial<SizeRow>) {
    patch({ sizes: values.sizes.map((s, j) => (i === j ? { ...s, ...p } : s)) });
  }
  function removeSize(i: number) {
    patch({ sizes: values.sizes.filter((_, j) => j !== i) });
  }

  function addVariant() {
    patch({
      variants: [
        ...values.variants,
        {
          label:             "",
          sizeLabel:         "",
          serves:            null,
          occasion:          "",
          price:             "",
          shopifyMatchTitle: "",
          displayOrder:      values.variants.length,
        },
      ],
    });
  }
  function patchVariant(i: number, p: Partial<VariantRow>) {
    patch({ variants: values.variants.map((v, j) => (i === j ? { ...v, ...p } : v)) });
  }
  function removeVariant(i: number) {
    patch({ variants: values.variants.filter((_, j) => j !== i) });
  }

  function toggleFlavour(id: string) {
    patch({
      flavourIds: values.flavourIds.includes(id)
        ? values.flavourIds.filter((x) => x !== id)
        : [...values.flavourIds, id],
    });
  }
  function toggleAddon(id: string) {
    patch({
      addonIds: values.addonIds.includes(id)
        ? values.addonIds.filter((x) => x !== id)
        : [...values.addonIds, id],
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-6 space-y-4">
        <div>
          <label className="form-label">{t("name")}</label>
          <input
            className="form-input"
            value={values.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t("namePlaceholder")}
            required
            maxLength={255}
          />
        </div>

        <div>
          <label className="form-label">{t("description")}</label>
          <textarea
            className="form-input min-h-[80px]"
            value={values.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t("basePrice")}</label>
            <input
              className="form-input"
              value={values.basePrice}
              onChange={(e) => patch({ basePrice: e.target.value })}
              placeholder="1995"
              inputMode="decimal"
              required
            />
          </div>
          <div>
            <label className="form-label">{t("leadTimeDays")}</label>
            <input
              type="number"
              min={0}
              className="form-input"
              value={values.leadTimeDays}
              onChange={(e) => patch({ leadTimeDays: parseInt(e.target.value || "0", 10) })}
            />
            <p className="text-xs text-gray-500 mt-1">{t("leadTimeHint")}</p>
          </div>
        </div>

        <div>
          <label className="form-label">{t("linkRecipe")}</label>
          <select
            className="form-input"
            value={values.recipeId ?? ""}
            onChange={(e) => patch({ recipeId: e.target.value || null })}
          >
            <option value="">{t("linkRecipeNone")}</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t("linkRecipeHint")}</p>
        </div>

        <div>
          <label className="form-label">{t("allergens")}</label>
          <input
            className="form-input"
            value={values.allergens}
            onChange={(e) => patch({ allergens: e.target.value })}
            placeholder={t("allergensPlaceholder")}
          />
          <p className="text-xs text-gray-500 mt-1">{t("allergensHint")}</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => patch({ isActive: e.target.checked })}
              className="w-4 h-4 rounded border-2 border-brand-300 accent-brand-600"
            />
            <span className="text-sm text-gray-700">{t("isActive")}</span>
          </label>
        </div>
      </div>

      {/* Sizes */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="section-title">{t("sizesTitle")}</h3>
            <p className="text-sm text-gray-500 mt-1">{t("sizesHint")}</p>
          </div>
          <button
            type="button"
            onClick={addSize}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 text-sm font-semibold hover:bg-brand-100 transition-colors"
          >
            <PlusIcon /> {t("addSize")}
          </button>
        </div>

        {values.sizes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">— {t("addSize")} —</p>
        ) : (
          <div className="space-y-3">
            {values.sizes.map((size, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5">
                  <label className="form-label text-xs">{t("sizeLabel")}</label>
                  <input
                    className="form-input text-sm"
                    value={size.label}
                    onChange={(e) => patchSize(i, { label: e.target.value })}
                    placeholder={t("sizeLabelPlaceholder")}
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="form-label text-xs">{t("sizeDiameter")}</label>
                  <input
                    type="number"
                    min={1}
                    className="form-input text-sm"
                    value={size.diameterCm ?? ""}
                    onChange={(e) => patchSize(i, { diameterCm: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="form-label text-xs">{t("sizeHeight")}</label>
                  <input
                    type="number"
                    min={1}
                    className="form-input text-sm"
                    value={size.heightCm ?? ""}
                    onChange={(e) => patchSize(i, { heightCm: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="form-label text-xs">{t("sizeServes")}</label>
                  <input
                    type="number"
                    min={1}
                    className="form-input text-sm"
                    value={size.serves ?? ""}
                    onChange={(e) => patchSize(i, { serves: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSize(i)}
                  title={t("removeSize")}
                  className="col-span-1 h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variants */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="section-title">{t("variantsTitle")}</h3>
            <p className="text-sm text-gray-500 mt-1">{t("variantsHint")}</p>
          </div>
          <button
            type="button"
            onClick={addVariant}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 text-sm font-semibold hover:bg-brand-100 transition-colors"
          >
            <PlusIcon /> {t("addVariant")}
          </button>
        </div>

        {values.variants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">— {t("addVariant")} —</p>
        ) : (
          <div className="space-y-3">
            {values.variants.map((variant, i) => (
              <div key={variant.id ?? `new-${i}`} className="rounded-lg border border-rose-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {variant.shopifyVariantId && (
                      <span className="badge text-[10px] bg-rose-50 text-rose-700 border-rose-200 mb-1 inline-block">
                        {t("variantLinkedToShopify")}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    title={t("removeVariant")}
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div>
                  <label className="form-label text-xs">{t("variantLabel")}</label>
                  <input
                    className="form-input text-sm"
                    value={variant.label}
                    onChange={(e) => patchVariant(i, { label: e.target.value })}
                    placeholder={t("variantLabelPlaceholder")}
                    required
                    maxLength={255}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="form-label text-xs">{t("variantSize")}</label>
                    <input
                      className="form-input text-sm"
                      value={variant.sizeLabel}
                      onChange={(e) => patchVariant(i, { sizeLabel: e.target.value })}
                      placeholder={t("variantSizePlaceholder")}
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">{t("variantOccasion")}</label>
                    <input
                      className="form-input text-sm"
                      value={variant.occasion}
                      onChange={(e) => patchVariant(i, { occasion: e.target.value })}
                      placeholder={t("variantOccasionPlaceholder")}
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">{t("variantServes")}</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input text-sm"
                      value={variant.serves ?? ""}
                      onChange={(e) => patchVariant(i, { serves: e.target.value ? parseInt(e.target.value, 10) : null })}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label text-xs">{t("variantPrice")}</label>
                  <input
                    className="form-input text-sm"
                    inputMode="decimal"
                    value={variant.price}
                    onChange={(e) => patchVariant(i, { price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="form-label text-xs">{t("variantMatchTitle")}</label>
                  <input
                    className="form-input text-sm font-mono"
                    value={variant.shopifyMatchTitle}
                    onChange={(e) => patchVariant(i, { shopifyMatchTitle: e.target.value })}
                    placeholder={t("variantMatchTitlePlaceholder")}
                    maxLength={255}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">{t("variantMatchTitleHint")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flavours */}
      <div className="card p-6 space-y-3">
        <div>
          <h3 className="section-title">{t("flavoursTitle")}</h3>
          <p className="text-sm text-gray-500 mt-1">{t("flavoursHint")}</p>
        </div>
        {flavours.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noFlavoursYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {flavours.map((f) => {
              const active = values.flavourIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleFlavour(f.id)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    active
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-rose-100 bg-white text-gray-600 hover:border-brand-300"
                  }`}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add-ons */}
      <div className="card p-6 space-y-3">
        <div>
          <h3 className="section-title">{t("addonsTitle")}</h3>
          <p className="text-sm text-gray-500 mt-1">{t("addonsHint")}</p>
        </div>
        {addons.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noAddonsYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {addons.map((a) => {
              const active = values.addonIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAddon(a.id)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    active
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-rose-100 bg-white text-gray-600 hover:border-brand-300"
                  }`}
                >
                  {a.name} <span className="text-xs text-gray-400">+{a.priceDelta} kr</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary disabled:opacity-40"
        >
          {isSubmitting ? t("saving") : submitLabel}
        </button>
      </div>
    </form>
  );
}
