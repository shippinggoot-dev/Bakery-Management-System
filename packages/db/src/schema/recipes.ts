import { pgTable, text, uuid, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { recipeCategories } from "./recipe-categories";
import { ingredients } from "./ingredients";

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Supabase auth.users(id) — owner of this recipe */
  ownerId: uuid("owner_id"),
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
  /** Retail / selling price (stored as text to preserve decimals, e.g. "12.50") */
  sellingPrice: text("selling_price"),
  /** Comma-separated flavour tags, e.g. "Chocolate,Vanilla,Strawberry" */
  flavours: text("flavours"),
  /** Shopify product/variant/inventory IDs once this recipe has been pushed
   *  to Shopify as a product. Stored as text since Shopify uses 64-bit ints
   *  that can lose precision in JS. Null = not yet synced. */
  shopifyProductId:       text("shopify_product_id"),
  shopifyVariantId:       text("shopify_variant_id"),
  shopifyInventoryItemId: text("shopify_inventory_item_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_recipes_owner_active").on(t.ownerId, t.isActive),
  index("idx_recipes_category_id").on(t.categoryId),
  index("idx_recipes_is_active").on(t.isActive),
  index("idx_recipes_name").on(t.name),
  index("idx_recipes_shopify_product_id").on(t.shopifyProductId),
]);

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
  /** Whether this ingredient can be omitted without ruining the recipe */
  isOptional: boolean("is_optional").notNull().default(false),
  /** A suggested substitute if this ingredient is unavailable */
  substituteIngredientId: uuid("substitute_ingredient_id")
    .references(() => ingredients.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_recipe_ingredients_recipe_id").on(t.recipeId),
  index("idx_recipe_ingredients_ingredient_id").on(t.ingredientId),
]);

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
