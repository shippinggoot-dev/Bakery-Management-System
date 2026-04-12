import { pgTable, text, uuid, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { ingredients } from "./ingredients";

/**
 * Canonical relationship between an ingredient and a supplier.
 * One ingredient can be sourced from many suppliers; each pairing gets a row here.
 * Pricing history is tracked in price_history (FK → this table).
 */
export const ingredientSuppliers = pgTable("ingredient_suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  /** Whether this is the default/preferred supplier for this ingredient */
  isPreferred: boolean("is_preferred").notNull().default(false),
  /** Supplier's own product code / SKU for this ingredient */
  sku: text("sku"),
  /** Minimum order quantity (in the ingredient's canonical unit) */
  moq: text("moq"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_ingredient_suppliers_ingredient_id").on(t.ingredientId),
  index("idx_ingredient_suppliers_supplier_id").on(t.supplierId),
  index("idx_ingredient_suppliers_is_preferred").on(t.isPreferred),
]);

export type IngredientSupplier    = typeof ingredientSuppliers.$inferSelect;
export type NewIngredientSupplier = typeof ingredientSuppliers.$inferInsert;
