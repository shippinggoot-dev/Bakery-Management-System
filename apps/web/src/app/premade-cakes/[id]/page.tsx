"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { TrashIcon } from "@/components/icons";

function DetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-rose-100 rounded w-1/3" />
      <div className="card p-6 space-y-3">
        <div className="h-4 bg-rose-100 rounded w-1/2" />
        <div className="h-4 bg-rose-100 rounded w-1/3" />
        <div className="h-4 bg-rose-100 rounded w-2/3" />
      </div>
    </div>
  );
}

export default function PremadeCakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t      = useTranslations("premadeCakes");
  const router = useRouter();

  const utils = api.useUtils();
  const { data: cake, isLoading } = api.premadeCakes.byId.useQuery(id);
  const { data: margin } = api.premadeCakes.calculateMargin.useQuery(id, { enabled: !!cake?.recipeId });
  const deleteMutation = api.premadeCakes.delete.useMutation({
    onSuccess: () => {
      utils.premadeCakes.list.invalidate();
      router.push("/premade-cakes");
    },
  });

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    deleteMutation.mutate(id);
  }

  if (isLoading) return <div className="max-w-3xl mx-auto"><DetailSkeleton /></div>;
  if (!cake) return (
    <div className="max-w-3xl mx-auto py-16 text-center">
      <p className="text-4xl mb-3">🎂</p>
      <p className="font-medium text-gray-400">{t("noCakesTitle")}</p>
      <Link href="/premade-cakes" className="text-sm text-brand-600 hover:text-brand-800 mt-4 inline-block">
        {t("back")}
      </Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/premade-cakes" className="text-xs text-brand-500 hover:text-brand-700">← {t("back")}</Link>
          <div className="flex items-center gap-2 mt-1">
            <h2 className="page-title truncate">{cake.name}</h2>
            {!cake.isActive && (
              <span className="badge bg-gray-100 text-gray-500 border-gray-200">inactive</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/premade-cakes/${cake.id}/edit`} className="btn-ghost text-sm">{t("edit")}</Link>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
            title={t("deleteCake")}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Core info */}
      <div className="card p-6 space-y-4">
        {cake.description && <p className="text-gray-700">{cake.description}</p>}

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-rose-100">
          <div>
            <p className="text-xs text-gray-500">{t("basePrice")}</p>
            <p className="text-2xl font-bold text-brand-700">{cake.basePrice} kr</p>
          </div>
          {cake.leadTimeDays > 0 && (
            <div>
              <p className="text-xs text-gray-500">{t("leadTimeDays")}</p>
              <p className="text-lg font-semibold text-gray-800">{cake.leadTimeDays}</p>
            </div>
          )}
        </div>

        {cake.allergens && (
          <div>
            <p className="text-xs text-gray-500">{t("allergens")}</p>
            <p className="text-sm text-gray-700">{cake.allergens}</p>
          </div>
        )}
      </div>

      {/* Margin */}
      {cake.recipeId ? (
        margin ? (
          <div className="card p-6 space-y-3">
            <h3 className="section-title">{t("marginTitle")}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">{t("marginSalePrice")}</p>
                <p className="text-lg font-semibold text-gray-800">{margin.salePrice.toFixed(0)} kr</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("marginCogs")}</p>
                <p className="text-lg font-semibold text-gray-800">{margin.cogs.toFixed(0)} kr</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("marginPercent")}</p>
                <p className={`text-lg font-bold ${margin.marginPercent !== null && margin.marginPercent > 0 ? "text-green-600" : "text-red-600"}`}>
                  {margin.marginPercent === null ? "—" : `${margin.marginPercent}%`}
                </p>
              </div>
            </div>
            {!margin.pricedAll && (
              <p className="text-xs text-amber-600">⚠ {t("marginPartial")}</p>
            )}
          </div>
        ) : null
      ) : (
        <div className="card p-4 text-sm text-gray-500 italic">{t("marginNoRecipe")}</div>
      )}

      {/* Variants */}
      {cake.variants.length > 0 && (
        <div className="card p-6 space-y-3">
          <h3 className="section-title">{t("variantsTitle")}</h3>
          <ul className="divide-y divide-rose-100">
            {cake.variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{v.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[
                      v.sizeLabel,
                      v.occasion,
                      v.serves ? `${v.serves} ${t("variantServes").toLowerCase()}` : null,
                    ].filter(Boolean).join(" · ") || <>&nbsp;</>}
                  </p>
                </div>
                <span className="font-semibold text-brand-700 whitespace-nowrap">{v.price} kr</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Flavours */}
      {cake.flavours.length > 0 && (
        <div className="card p-6 space-y-3">
          <h3 className="section-title">{t("flavoursTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            {cake.flavours.map((cf) => (
              <span key={cf.flavour.id} className="badge bg-rose-50 text-rose-700 border-rose-200">
                {cf.flavour.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add-ons */}
      {cake.addons.length > 0 && (
        <div className="card p-6 space-y-3">
          <h3 className="section-title">{t("addonsTitle")}</h3>
          <ul className="divide-y divide-rose-100">
            {cake.addons.map((ca) => (
              <li key={ca.addon.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-800">{ca.addon.name}</span>
                  {ca.addon.description && <span className="text-xs text-gray-500 ml-2">{ca.addon.description}</span>}
                </div>
                <span className="font-semibold text-brand-700">+{ca.addon.priceDelta} kr</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
