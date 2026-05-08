"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { CakeForm, type CakeFormValues } from "../../CakeForm";

export default function EditPremadeCakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t      = useTranslations("premadeCakes");
  const router = useRouter();
  const utils  = api.useUtils();
  const [error, setError] = useState<string | null>(null);

  const { data: cake, isLoading } = api.premadeCakes.byId.useQuery(id);
  const updateMutation = api.premadeCakes.update.useMutation({
    onSuccess: async () => {
      await utils.premadeCakes.byId.invalidate(id);
      await utils.premadeCakes.list.invalidate();
      await utils.premadeCakes.calculateMargin.invalidate(id);
      router.push(`/premade-cakes/${id}`);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(values: CakeFormValues) {
    setError(null);
    updateMutation.mutate({
      id,
      cake: {
        name:         values.name.trim(),
        description:  values.description.trim() || null,
        basePrice:    values.basePrice.trim(),
        leadTimeDays: values.leadTimeDays,
        recipeId:     values.recipeId,
        allergens:    values.allergens.trim() || null,
        isActive:     values.isActive,
        displayOrder: values.displayOrder,
      },
      sizes: values.sizes
        .filter((s) => s.label.trim())
        .map((s) => ({ ...s, label: s.label.trim() })),
      flavourIds: values.flavourIds,
      addonIds:   values.addonIds,
    });
  }

  if (isLoading) return (
    <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 bg-rose-100 rounded w-1/3" />
      <div className="card p-6 h-96" />
    </div>
  );
  if (!cake) return (
    <div className="max-w-3xl mx-auto py-16 text-center">
      <p className="font-medium text-gray-400">{t("noCakesTitle")}</p>
      <Link href="/premade-cakes" className="text-sm text-brand-600 hover:text-brand-800 mt-4 inline-block">
        {t("back")}
      </Link>
    </div>
  );

  const initial: CakeFormValues = {
    name:         cake.name,
    description:  cake.description ?? "",
    basePrice:    cake.basePrice,
    leadTimeDays: cake.leadTimeDays,
    recipeId:     cake.recipeId,
    allergens:    cake.allergens ?? "",
    isActive:     cake.isActive,
    displayOrder: cake.displayOrder,
    sizes: cake.sizes.map((s) => ({
      label:        s.label,
      diameterCm:   s.diameterCm,
      heightCm:     s.heightCm,
      serves:       s.serves,
      displayOrder: s.displayOrder,
    })),
    flavourIds: cake.flavours.map((f) => f.flavour.id),
    addonIds:   cake.addons.map((a) => a.addon.id),
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">{cake.name}</h2>
        <Link href={`/premade-cakes/${id}`} className="btn-ghost text-sm">{t("back")}</Link>
      </div>

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      <CakeForm
        initial={initial}
        onSubmit={handleSubmit}
        submitLabel={t("saveCake")}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  );
}
