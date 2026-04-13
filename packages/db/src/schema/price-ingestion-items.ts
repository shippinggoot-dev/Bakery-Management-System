import { pgTable, text, uuid, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { priceIngestionSessions } from "./price-ingestion-sessions";
import { ingredients } from "./ingredients";
import { suppliers } from "./suppliers";

/**
 * One row per line item extracted from a price ingestion session.
 * The user reviews these before they are applied to supplier_prices.
 */
export const priceIngestionItems = pgTable("price_ingestion_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => priceIngestionSessions.id, { onDelete: "cascade" }),
  /** Raw ingredient name as it appears in the source document */
  rawName: text("raw_name").notNull(),
  /** Raw price string from source (before unit normalisation) */
  rawPrice: text("raw_price"),
  /** Raw unit string from source */
  rawUnit: text("raw_unit"),
  /** Raw quantity/package-size string from source */
  rawQuantity: text("raw_quantity"),
  /** Best-matched ingredient from the user's ingredient list (null = unmatched) */
  ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
  /** Supplier this price came from */
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  /** Jaro-Winkler score 0–1 for the name match */
  matchScore: text("match_score"),
  /** Computed price per canonical ingredient unit */
  pricePerUnit: text("price_per_unit"),
  unit: text("unit"),
  /** Price has been committed to supplier_prices / price_history */
  applied: boolean("applied").notNull().default(false),
  /** User explicitly confirmed this match */
  confirmed: boolean("confirmed").notNull().default(false),
  /** User explicitly rejected this match */
  rejected: boolean("rejected").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_price_ingestion_items_session_id").on(t.sessionId),
  index("idx_price_ingestion_items_ingredient_id").on(t.ingredientId),
]);

export type PriceIngestionItem    = typeof priceIngestionItems.$inferSelect;
export type NewPriceIngestionItem = typeof priceIngestionItems.$inferInsert;
