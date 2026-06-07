import { pgTable, text, uuid, timestamp, integer, boolean, index, primaryKey } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";

/**
 * Pre-priced premade cakes — the bakery's catalog of finished products with
 * fixed sale prices, distinct from `recipes` which derive cost from ingredients.
 */
export const premadeCakes = pgTable("premade_cakes", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  name:         text("name").notNull(),
  description:  text("description"),
  /** Sale price (NOK), stored as text to preserve decimal precision. */
  basePrice:    text("base_price").notNull(),
  /** Minimum days notice required when ordering. */
  leadTimeDays: integer("lead_time_days").notNull().default(0),
  /** Optional FK to a recipe — used to compute cost-of-goods-sold and margin. */
  recipeId:     uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  /** Free-text allergen summary, e.g. "Wheat, egg, milk, tree nuts". */
  allergens:    text("allergens"),
  isActive:     boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  /** Shopify product/variant/inventory IDs once this cake has been pushed to
   *  Shopify. Same shape as recipes.shopify*. Null = not yet synced. */
  shopifyProductId:       text("shopify_product_id"),
  shopifyVariantId:       text("shopify_variant_id"),
  shopifyInventoryItemId: text("shopify_inventory_item_id"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_premade_cakes_owner_active").on(t.ownerId, t.isActive),
  index("idx_premade_cakes_recipe_id").on(t.recipeId),
  index("idx_premade_cakes_shopify_product_id").on(t.shopifyProductId),
]);

/**
 * Shared catalog of flavour profiles, reused across cakes.
 */
export const flavours = pgTable("flavours", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  name:         text("name").notNull(),
  description:  text("description"),
  isActive:     boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_flavours_owner_active").on(t.ownerId, t.isActive),
]);

/**
 * M:N junction — which flavours each cake offers.
 */
export const premadeCakeFlavours = pgTable("premade_cake_flavours", {
  cakeId:    uuid("cake_id").notNull().references(() => premadeCakes.id, { onDelete: "cascade" }),
  flavourId: uuid("flavour_id").notNull().references(() => flavours.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.cakeId, t.flavourId] }),
  index("idx_premade_cake_flavours_flavour_id").on(t.flavourId),
]);

/**
 * Shared catalog of paid add-ons (e.g. gluten-free +200 kr).
 */
export const cakeAddons = pgTable("cake_addons", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  name:         text("name").notNull(),
  description:  text("description"),
  /** Price delta in NOK, stored as text. Positive number. */
  priceDelta:   text("price_delta").notNull().default("0"),
  isActive:     boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_cake_addons_owner_active").on(t.ownerId, t.isActive),
]);

/**
 * M:N junction — which add-ons each cake supports.
 */
export const premadeCakeAddons = pgTable("premade_cake_addons", {
  cakeId:  uuid("cake_id").notNull().references(() => premadeCakes.id, { onDelete: "cascade" }),
  addonId: uuid("addon_id").notNull().references(() => cakeAddons.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.cakeId, t.addonId] }),
  index("idx_premade_cake_addons_addon_id").on(t.addonId),
]);

export type PremadeCake         = typeof premadeCakes.$inferSelect;
export type NewPremadeCake      = typeof premadeCakes.$inferInsert;
export type Flavour             = typeof flavours.$inferSelect;
export type NewFlavour          = typeof flavours.$inferInsert;
export type CakeAddon           = typeof cakeAddons.$inferSelect;
export type NewCakeAddon        = typeof cakeAddons.$inferInsert;
