import { api } from "@/trpc/server";
import IngredientsClient from "./_client";

export default async function IngredientsPage() {
  // Fetch all three datasets in parallel so they don't block each other.
  const [initialIngredients, initialCategories, initialAllergens] = await Promise.all([
    api.ingredients.getAll({ limit: 200 }).catch(() => []),
    api.ingredients.getCategories().catch(() => []),
    api.ingredients.getAllAllergens().catch(() => []),
  ]);
  return (
    <IngredientsClient
      initialIngredients={initialIngredients}
      initialCategories={initialCategories}
      initialAllergens={initialAllergens}
    />
  );
}
