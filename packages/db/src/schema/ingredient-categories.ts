import { pgTable, text, uuid, index, unique } from "drizzle-orm/pg-core";

export const ingredientCategories = pgTable("ingredient_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
}, (t) => [
  index("idx_ingredient_categories_owner").on(t.ownerId),
  // Names are unique per tenant, not globally.
  unique("ingredient_categories_owner_name").on(t.ownerId, t.name),
]);

export type IngredientCategory = typeof ingredientCategories.$inferSelect;
export type NewIngredientCategory = typeof ingredientCategories.$inferInsert;
