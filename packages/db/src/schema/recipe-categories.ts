import { pgTable, text, uuid, index, unique } from "drizzle-orm/pg-core";

export const recipeCategories = pgTable("recipe_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
}, (t) => [
  index("idx_recipe_categories_owner").on(t.ownerId),
  // Names are unique per tenant, not globally.
  unique("recipe_categories_owner_name").on(t.ownerId, t.name),
]);

export type RecipeCategory = typeof recipeCategories.$inferSelect;
export type NewRecipeCategory = typeof recipeCategories.$inferInsert;
