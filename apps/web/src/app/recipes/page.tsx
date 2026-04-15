import Link from "next/link";
import { api } from "@/trpc/server";
import { PlusIcon } from "@/components/icons";
import { CategoryManager } from "./CategoryManager";

export const dynamic = "force-dynamic";

const categoryColour: Record<string, string> = {
  "Sponges":  "bg-amber-950/60 text-amber-300",
  "Fillings": "bg-blue-950/60 text-blue-300",
  "Frostings":"bg-pink-950/60 text-pink-300",
  "Mousse":   "bg-violet-950/60 text-violet-300",
  "Brownie":  "bg-orange-950/60 text-orange-300",
  "Cookies":  "bg-yellow-950/60 text-yellow-300",
  "Cupcakes": "bg-rose-950/60 text-rose-300",
  "Entremet": "bg-emerald-950/60 text-emerald-300",
};

export default async function RecipesPage() {
  let recipes: Awaited<ReturnType<typeof api.recipes.getAll>> = [];
  let categories: Awaited<ReturnType<typeof api.recipes.getCategories>> = [];

  try {
    [recipes, categories] = await Promise.all([
      api.recipes.getAll({ limit: 100, isActive: true }),
      api.recipes.getCategories(),
    ]);
  } catch (err) {
    console.error("[RecipesPage] Failed to load data:", err);
    return (
      <div className="max-w-5xl mx-auto py-16 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="font-semibold text-gray-400 text-lg">Could not load recipes</p>
        <p className="text-sm text-gray-600 mt-2">
          {err instanceof Error ? err.message : "An unexpected error occurred. Check server logs for details."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Recipes</h2>
          <p className="text-gray-500 mt-1">{recipes.length} active recipe{recipes.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/recipes/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          New Recipe
        </Link>
      </div>

      <CategoryManager initialCategories={categories} />

      {recipes.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">📖</p>
          <p className="font-medium text-gray-400">No recipes yet</p>
          <p className="text-sm mt-2 text-gray-600">
            Click <strong className="text-gray-400">New Recipe</strong> above to add your first one,
            or use the AI import to paste in a recipe from anywhere.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((recipe) => {
            const catName    = recipe.category?.name ?? "";
            const badgeClass = categoryColour[catName] ?? "bg-gray-800 text-gray-400";
            const totalTime  = (recipe.prepTimeMinutes ?? 0) + (recipe.bakeTimeMinutes ?? 0);

            return (
              <Link
                key={recipe.id}
                href={`/recipes/${recipe.id}`}
                className="card p-5 hover:border-gray-700 hover:bg-gray-800/50 transition-all flex flex-col gap-3"
              >
                {catName && (
                  <span className={`badge w-fit ${badgeClass}`}>{catName}</span>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-100 leading-snug">{recipe.name}</h3>
                  {recipe.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{recipe.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-600 border-t border-gray-800 pt-3">
                  <span>🎯 {recipe.yieldAmount} {recipe.yieldUnit}</span>
                  {totalTime > 0 && <span>⏱ {totalTime} min</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
