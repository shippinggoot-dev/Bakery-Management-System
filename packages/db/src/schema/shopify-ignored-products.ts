import { pgTable, text, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";

/**
 * Per-workspace list of Shopify line-item titles to permanently skip
 * during webhook + bulk import.
 *
 * Use cases: gift cards, deposits, merchandise, event tickets, anything
 * Shopify sells that doesn't belong in the bakery's fulfillment queue.
 *
 * The owner can remove entries from this list at any time — future
 * imports will pick the product back up.
 */
export const shopifyIgnoredProducts = pgTable("shopify_ignored_products", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  /** Match is on this exact string (case-insensitive). Compared against
   *  Shopify line_item.title in the mapper. */
  shopifyTitle: text("shopify_title").notNull(),
  /** Optional free-text — why this product was blocked. Shown in the
   *  Settings UI so the owner can remember why. */
  reason:       text("reason"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_shopify_ignored_owner").on(t.ownerId),
  unique("shopify_ignored_owner_title").on(t.ownerId, t.shopifyTitle),
]);

export type ShopifyIgnoredProduct    = typeof shopifyIgnoredProducts.$inferSelect;
export type NewShopifyIgnoredProduct = typeof shopifyIgnoredProducts.$inferInsert;
