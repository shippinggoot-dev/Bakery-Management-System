"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { CakeForm, EMPTY_FORM, type CakeFormValues } from "../CakeForm";

export default function NewPremadeCakePage() {
  const t      = useTranslations("premadeCakes");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const createMutation = api.premadeCakes.create.useMutation({
    onSuccess: (cake) => {
      if (cake) router.push(`/premade-cakes/${cake.id}`);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(values: CakeFormValues) {
    setError(null);
    createMutation.mutate({
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
      flavourIds: values.flavourIds,
      addonIds:   values.addonIds,
      variants: values.variants
        .filter((v) => v.label.trim() && v.price.trim())
        .map((v, idx) => ({
          label:             v.label.trim(),
          sizeLabel:         v.sizeLabel.trim() || null,
          serves:            v.serves,
          occasion:          v.occasion.trim() || null,
          price:             v.price.trim(),
          recipeId:          v.recipeId,
          shopifyMatchTitle: v.shopifyMatchTitle.trim() || null,
          displayOrder:      idx,
        })),
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t("newCake")}</h2>
        <Link href="/premade-cakes" className="btn-ghost text-sm">{t("back")}</Link>
      </div>

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      <CakeForm
        initial={EMPTY_FORM}
        onSubmit={handleSubmit}
        submitLabel={t("saveCake")}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}
