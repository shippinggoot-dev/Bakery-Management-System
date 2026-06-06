import { pgTable, text, uuid, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { premadeCakes, flavours } from "./premade-cakes";

/**
 * Orderable variants of a premade cake. One row per Shopify variant the
 * bakery actually sells — i.e. the cartesian subset of size × flavour ×
 * occasion that's listed as a variant on the parent Shopify product.
 *
 * Each variant carries its own price (so a "40+ Bryllup" can be priced
 * higher than a "10+ Bursdag" of the same cake) and its own Shopify IDs
 * for two-way sync. The match key `shopifyMatchTitle` is what the bulk
 * import / webhook matcher uses to route incoming line items to the
 * right variant.
 *
 * Per the Phase 2 design doc (docs/phase2-variants.md §6), there is
 * intentionally no per-variant `recipeId` override — cost flows through
 * the parent `premade_cakes.recipeId`. Fondant / filling swaps are
 * handled via `cake_addons`, not via a separate recipe per variant.
 */
export const premadeCakeVariants = pgTable("premade_cake_variants", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  cakeId:                 uuid("cake_id").notNull()
                            .references(() => premadeCakes.id, { onDelete: "cascade" }),
  /** Display label, e.g. "Razzle Dazzle / 40+ / Bryllup". Auto-generated
   *  on import in flavour / size / occasion order (Shopify default). */
  label:                  text("label").notNull(),
  /** Per-variant axes — any NULL means the cake doesn't use that axis. */
  flavourId:              uuid("flavour_id")
                            .references(() => flavours.id, { onDelete: "set null" }),
  sizeLabel:              text("size_label"),
  serves:                 integer("serves"),
  occasion:               text("occasion"),
  /** Per-variant price in NOK as text (preserves decimal precision). */
  price:                  text("price").notNull(),
  /** Shopify two-way sync IDs for THIS variant. Null until pushed. */
  shopifyVariantId:       text("shopify_variant_id"),
  shopifyInventoryItemId: text("shopify_inventory_item_id"),
  /** Case-insensitive lookup key for the import matcher. Stored as the
   *  lowercased `"<line_item_title> — <variant_title>"` concatenation. */
  shopifyMatchTitle:      text("shopify_match_title"),
  isActive:               boolean("is_active").notNull().default(true),
  displayOrder:           integer("display_order").notNull().default(0),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
  updatedAt:              timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_premade_cake_variants_cake_id").on(t.cakeId),
  index("idx_premade_cake_variants_shopify_variant_id").on(t.shopifyVariantId),
  index("idx_premade_cake_variants_shopify_match_title").on(t.shopifyMatchTitle),
]);

export type PremadeCakeVariant    = typeof premadeCakeVariants.$inferSelect;
export type NewPremadeCakeVariant = typeof premadeCakeVariants.$inferInsert;
