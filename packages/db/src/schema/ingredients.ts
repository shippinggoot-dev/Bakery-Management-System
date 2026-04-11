import { pgTable, text, uuid, timestamp, integer } from "drizzle-orm/pg-core";
import { ingredientCategories } from "./ingredient-categories";

export const ingredients = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  /** Canonical unit for this ingredient (g, ml, piece, kg, l, tsp, tbsp…) */
  unit: text("unit").notNull(),
  categoryId: uuid("category_id").references(() => ingredientCategories.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  /** EAN barcode linking this ingredient to a Kassal.app grocery product */
  kassalappEan: text("kassalapp_ean"),
  /** Current cheapest price in NOK across local Fana/Bergen stores */
  currentPriceNok: text("current_price_nok"),
  /** The package size this price applies to (e.g. "500g", "1L") */
  currentPricePer: text("current_price_per"),
  /** Name of the store with the cheapest current price */
  cheapestStore: text("cheapest_store"),
  /** When prices were last checked against Kassal.app */
  lastPriceCheck: timestamp("last_price_check"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;
