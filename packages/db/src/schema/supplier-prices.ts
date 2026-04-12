import { pgTable, text, uuid, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { ingredients } from "./ingredients";

export const supplierPrices = pgTable("supplier_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  /** Price per unit stored as text to preserve decimal precision */
  pricePerUnit: text("price_per_unit").notNull(),
  unit: text("unit").notNull(),
  minOrderQty: text("min_order_qty"),
  leadTimeDays: integer("lead_time_days"),
  isPreferred: boolean("is_preferred").notNull().default(false),
  validFrom: text("valid_from"), // stored as YYYY-MM-DD
  validTo: text("valid_to"),     // stored as YYYY-MM-DD
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_supplier_prices_supplier_id").on(t.supplierId),
  index("idx_supplier_prices_ingredient_id").on(t.ingredientId),
  index("idx_supplier_prices_is_preferred").on(t.isPreferred),
]);

export type SupplierPrice = typeof supplierPrices.$inferSelect;
export type NewSupplierPrice = typeof supplierPrices.$inferInsert;
