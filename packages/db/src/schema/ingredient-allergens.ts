import { pgTable, uuid, primaryKey } from "drizzle-orm/pg-core";
import { ingredients } from "./ingredients";
import { allergens } from "./allergens";

/** Junction table — many-to-many between ingredients and allergens */
export const ingredientAllergens = pgTable(
  "ingredient_allergens",
  {
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    allergenId: uuid("allergen_id")
      .notNull()
      .references(() => allergens.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.ingredientId, t.allergenId] }) })
);

export type IngredientAllergen = typeof ingredientAllergens.$inferSelect;
