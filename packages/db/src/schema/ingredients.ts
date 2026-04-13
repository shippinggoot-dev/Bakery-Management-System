import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";
import { ingredientCategories } from "./ingredient-categories";

export const ingredients = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Supabase auth.users(id) — owner of this ingredient */
  ownerId: uuid("owner_id"),
  name: text("name").notNull(),
  /** Canonical unit for this ingredient (g, ml, piece, kg, l, tsp, tbsp…) */
  unit: text("unit").notNull(),
  categoryId: uuid("category_id").references(() => ingredientCategories.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  /** Target stock level — how much to keep on hand at all times (in canonical unit) */
  parLevel: text("par_level"),
  /** Stock level at which a new order should be placed (in canonical unit) */
  reorderPoint: text("reorder_point"),
  /** Current physical stock on hand (in canonical unit) */
  currentStock: text("current_stock").default("0"),
  // ── Nutrition (per 100 g of this ingredient) ──────────────────────────────
  caloriesKcal:  text("calories_kcal"),
  proteinG:      text("protein_g"),
  fatTotalG:     text("fat_total_g"),
  fatSaturatedG: text("fat_saturated_g"),
  carbsTotalG:   text("carbs_total_g"),
  carbsSugarsG:  text("carbs_sugars_g"),
  fiberG:        text("fiber_g"),
  sodiumMg:      text("sodium_mg"),
  /** How many grams is 1 of this ingredient's canonical unit (for piece / non-mass units) */
  gramsPerUnit:  text("grams_per_unit"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_ingredients_category_id").on(t.categoryId),
  index("idx_ingredients_name").on(t.name),
]);

export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;
