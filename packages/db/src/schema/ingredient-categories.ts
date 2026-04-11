import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const ingredientCategories = pgTable("ingredient_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export type IngredientCategory = typeof ingredientCategories.$inferSelect;
export type NewIngredientCategory = typeof ingredientCategories.$inferInsert;
