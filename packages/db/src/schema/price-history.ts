import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { ingredientSuppliers } from "./ingredient-suppliers";

/** Where the price data came from */
export const PRICE_SOURCES = ["manual", "csv", "api"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

/**
 * Full price history for each ingredient–supplier pair.
 * Each row is a snapshot of the price at a point in time.
 * The most recent row for a given ingredient_supplier_id is the current price.
 */
export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientSupplierId: uuid("ingredient_supplier_id")
    .notNull()
    .references(() => ingredientSuppliers.id, { onDelete: "cascade" }),
  /** Price per canonical unit stored as text to preserve decimal precision */
  pricePerUnit: text("price_per_unit").notNull(),
  /** ISO 4217 currency code */
  currency: text("currency").notNull().default("NOK"),
  /** When this price was observed / recorded */
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  /** How this price entry was created */
  source: text("source").notNull().default("manual"),  // manual | csv | api
  notes: text("notes"),
}, (t) => [
  index("idx_price_history_ingredient_supplier_id").on(t.ingredientSupplierId),
  index("idx_price_history_recorded_at").on(t.recordedAt),
  index("idx_price_history_source").on(t.source),
]);

export type PriceHistory    = typeof priceHistory.$inferSelect;
export type NewPriceHistory = typeof priceHistory.$inferInsert;
