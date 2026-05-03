"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";
import { CategoryManager } from "./CategoryManager";

const categoryColour: Record<string, string> = {
  "Sponges":  "bg-amber-50 text-amber-700 border-amber-200",
  "Fillings": "bg-blue-50 text-blue-700 border-blue-200",
  "Frostings":"bg-pink-50 text-pink-700 border-pink-200",
  "Mousse":   "bg-violet-50 text-violet-700 border-violet-200",
  "Brownie":  "bg-orange-50 text-orange-700 border-orange-200",
  "Cookies":  "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Cupcakes": "bg-rose-50 text-rose-700 border-rose-200",
  "Entremet": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function RecipesPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 bg-rose-100 rounded w-24" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="h-4 bg-rose-100 rounded w-20" />
            <div className="h-5 bg-rose-100 rounded w-3/4" />
            <div className="h-4 bg-rose-100 rounded w-1/2" />
            <div className="border-t border-rose-100 pt-3">
              <div className="h-3 bg-rose-100 rounded w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RecipesPage() {
  const t = useTranslations("recipes");

  const { data: recipes = [], isLoading, isError, error } = api.recipes.getAll.useQuery({ limit: 100, isActive: true });
  const { data: categories = [] } = api.recipes.getCategories.useQuery();

  const subtitleText = recipes.length === 1
    ? t("subtitle").replace("{count}", "1")
    : t("subtitlePlural").replace("{count}", String(recipes.length));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t("title")}</h2>
        <Link
          href="/recipes/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          {t("newRecipe")}
        </Link>
      </div>

      {isLoading && <RecipesPageSkeleton />}

      {isError && (
        <div className="py-16 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-semibold text-gray-400 text-lg">{t("errorTitle")}</p>
          <p className="text-sm text-gray-600 mt-2">
            {error instanceof Error ? error.message : t("errorHint")}
          </p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <p className="text-gray-500 -mt-2">{subtitleText}</p>

          <CategoryManager initialCategories={categories} />

          {recipes.length === 0 ? (
            <div className="card p-12 text-center text-gray-600">
              <p className="text-4xl mb-3">📖</p>
              <p className="font-medium text-gray-400">{t("noRecipesTitle")}</p>
              <p className="text-sm mt-2 text-gray-600">{t("noRecipesHint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.map((recipe) => {
                const catName    = recipe.category?.name ?? "";
                const badgeClass = categoryColour[catName] ?? "bg-gray-100 text-gray-500 border-gray-200";
                const totalTime  = (recipe.prepTimeMinutes ?? 0) + (recipe.bakeTimeMinutes ?? 0);

                return (
                  <Link
                    key={recipe.id}
                    href={`/recipes/${recipe.id}`}
                    className="card p-5 hover:border-brand-200 hover:bg-rose-50/50 transition-all flex flex-col gap-3"
                  >
                    {catName && (
                      <span className={`badge w-fit ${badgeClass}`}>{catName}</span>
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800 leading-snug">{recipe.name}</h3>
                      {recipe.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{recipe.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-600 border-t border-rose-100 pt-3">
                      <span>🎯 {recipe.yieldAmount} {recipe.yieldUnit}</span>
                      {totalTime > 0 && <span>⏱ {totalTime} min</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
