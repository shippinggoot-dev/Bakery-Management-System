import { pgTable, text, uuid, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { recipeCategories } from "./recipe-categories";
import { ingredients } from "./ingredients";

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => recipeCategories.id, {
    onDelete: "set null",
  }),
  /** How many units this recipe produces (stored as text to preserve decimals) */
  yieldAmount: text("yield_amount").notNull(),
  yieldUnit: text("yield_unit").notNull(),
  prepTimeMinutes: integer("prep_time_minutes"),
  bakeTimeMinutes: integer("bake_time_minutes"),
  instructions: text("instructions"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  /** Quantity as text to preserve decimal precision */
  quantity: text("quantity").notNull(),
  /** Unit used in this recipe (may differ from the ingredient's canonical unit) */
  unit: text("unit").notNull(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
