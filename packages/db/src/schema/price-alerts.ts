import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { ingredients } from "./ingredients";

export const priceAlerts = pgTable("price_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  /** Denormalised so alerts survive ingredient renames */
  ingredientName: text("ingredient_name").notNull(),
  oldPriceNok: text("old_price_nok").notNull(),
  newPriceNok: text("new_price_nok").notNull(),
  oldStore: text("old_store"),
  newStore: text("new_store").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  dismissedAt: timestamp("dismissed_at"),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type NewPriceAlert = typeof priceAlerts.$inferInsert;
