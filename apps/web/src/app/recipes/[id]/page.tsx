import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/trpc/server";
import { DeleteRecipeButton } from "./delete-button";
import { SellingPricePanel } from "./SellingPricePanel";

export const dynamic = "force-dynamic";

const allergenColour: Record<string, string> = {
  Gluten:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  Milk:        "bg-blue-50 text-blue-700 border-blue-200",
  Eggs:        "bg-orange-50 text-orange-700 border-orange-200",
  "Tree Nuts": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Peanuts:     "bg-red-50 text-red-700 border-red-200",
  Soy:         "bg-purple-50 text-purple-700 border-purple-200",
  Sesame:      "bg-stone-50 text-stone-700 border-stone-200",
};

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, cost] = await Promise.all([
    api.recipes.getById(id),
    api.recipes.calculateCost(id),
  ]);

  if (!recipe) notFound();

  const totalTime = (recipe.prepTimeMinutes ?? 0) + (recipe.bakeTimeMinutes ?? 0);

  const allergenSet = new Set<string>();
  for (const ri of recipe.ingredients) {
    for (const ia of ri.ingredient.allergens ?? []) {
      allergenSet.add(ia.allergen?.name ?? "");
    }
  }
  const allergens = [...allergenSet].filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/recipes" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Recipes
        </Link>
        <DeleteRecipeButton id={id} name={recipe.name} />
      </div>

      {/* Header card */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            {recipe.category && (
              <span className="badge bg-amber-50 text-amber-700 border-amber-200 mb-2">
                {recipe.category.name}
              </span>
            )}
            <h2 className="page-title mt-1">{recipe.name}</h2>
            {recipe.description && (
              <p className="text-gray-500 mt-2">{recipe.description}</p>
            )}
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-rose-100">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Yield</p>
            <p className="font-semibold text-gray-800 mt-0.5">{recipe.yieldAmount} {recipe.yieldUnit}</p>
          </div>
          {recipe.prepTimeMinutes && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Prep time</p>
              <p className="font-semibold text-gray-800 mt-0.5">{recipe.prepTimeMinutes} min</p>
            </div>
          )}
          {recipe.bakeTimeMinutes && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Bake time</p>
              <p className="font-semibold text-gray-800 mt-0.5">{recipe.bakeTimeMinutes} min</p>
            </div>
          )}
          {totalTime > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total time</p>
              <p className="font-semibold text-gray-800 mt-0.5">{totalTime} min</p>
            </div>
          )}
        </div>

        {/* Allergens */}
        {allergens.length > 0 && (
          <div className="pt-2 border-t border-rose-100">
            <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Contains allergens</p>
            <div className="flex flex-wrap gap-1.5">
              {allergens.map((a) => (
                <span key={a} className={`badge ${allergenColour[a] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ingredients */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-rose-100 flex items-center justify-between">
          <h3 className="section-title">Ingredients</h3>
          {cost && (
            <span className="text-sm font-semibold text-brand-400">
              Est. cost: kr{cost.totalCost.toFixed(2)}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-rose-50 border-b border-rose-100">
              <th className="table-header px-6 py-3">Ingredient</th>
              <th className="table-header px-6 py-3 text-right">Quantity</th>
              {cost && <th className="table-header px-6 py-3 text-right">Cost</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-rose-50">
            {recipe.ingredients.map((ri, i) => {
              const lineItem = cost?.lineItems[i];
              return (
                <tr key={ri.id} className="hover:bg-rose-50/50">
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {ri.ingredient.name}
                    {ri.notes && (
                      <span className="ml-2 text-xs text-gray-600">({ri.notes})</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-500">
                    {ri.quantity} {ri.unit}
                  </td>
                  {cost && (
                    <td className="px-6 py-3 text-right text-gray-500 text-sm">
                      {lineItem?.hasPricing
                        ? `kr${lineItem.lineCost.toFixed(4)}`
                        : <span className="text-gray-400">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {cost && (
            <tfoot>
              <tr className="border-t border-rose-200 bg-rose-50">
                <td colSpan={2} className="px-6 py-3 font-semibold text-right text-gray-600">
                  Total ingredient cost
                </td>
                <td className="px-6 py-3 text-right font-bold text-brand-400">
                  kr{cost.totalCost.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      {/* Pricing & Margin */}
      {cost && (
        <SellingPricePanel
          recipeId={recipe.id}
          totalCost={cost.totalCost}
          yieldAmount={recipe.yieldAmount}
          initialPrice={recipe.sellingPrice ?? null}
        />
      )}

      {/* Instructions */}
      {recipe.instructions && (
        <div className="card p-6">
          <h3 className="section-title mb-4">Instructions</h3>
          <div className="text-gray-600 text-sm whitespace-pre-line leading-relaxed">
            {recipe.instructions}
          </div>
        </div>
      )}

      {/* Notes */}
      {recipe.notes && (
        <div className="card p-6 bg-amber-50 border-amber-200">
          <h3 className="text-sm font-semibold text-amber-700 mb-2">Baker's Notes</h3>
          <p className="text-sm text-amber-900/70">{recipe.notes}</p>
        </div>
      )}
    </div>
  );
}
