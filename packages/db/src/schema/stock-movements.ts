import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { ingredients } from "./ingredients";
import { lots } from "./lots";

export const MOVEMENT_TYPES = [
  "receive",      // delivery received
  "produce",      // deducted for production batch
  "waste",        // logged as waste
  "adjust",       // manual stock correction
  "recount",      // physical stock count
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * Full audit trail of every stock change.
 * quantity_delta is positive for inflows, negative for outflows.
 */
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  lotId: uuid("lot_id").references(() => lots.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  /** Positive = stock in, Negative = stock out */
  quantityDelta: text("quantity_delta").notNull(),
  /** Stock level after this movement */
  stockAfter: text("stock_after").notNull(),
  unit: text("unit").notNull(),
  /** UUID of the source record (batch id, waste log id, etc.) */
  referenceId: uuid("reference_id"),
  /** "production_batch" | "waste_log" | "purchase_order" | "manual" */
  referenceType: text("reference_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_stock_movements_owner_id").on(t.ownerId),
  index("idx_stock_movements_ingredient_id").on(t.ingredientId),
  index("idx_stock_movements_type").on(t.type),
  index("idx_stock_movements_created_at").on(t.createdAt),
]);

export type StockMovement    = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
