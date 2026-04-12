import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { ingredients } from "./ingredients";
import { suppliers } from "./suppliers";

export const LOT_STATUSES = ["available", "quarantine", "consumed", "expired", "returned"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

/**
 * A received batch (lot) of a single ingredient.
 * Enables FIFO (First In, First Out) stock management and expiry tracking.
 * current_stock on the ingredients table reflects the SUM of available lot quantities.
 */
export const lots = pgTable("lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id")
    .references(() => suppliers.id, { onDelete: "set null" }),
  /** Supplier's batch/lot number for traceability */
  lotNumber: text("lot_number"),
  /** Quantity received (in the ingredient's canonical unit) */
  quantity: text("quantity").notNull(),
  unit: text("unit").notNull(),
  /** Expiry or best-before date — YYYY-MM-DD */
  expiryDate: text("expiry_date"),
  /** When this lot was received into inventory */
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  /** available | quarantine | consumed | expired | returned */
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_lots_ingredient_id").on(t.ingredientId),
  index("idx_lots_supplier_id").on(t.supplierId),
  index("idx_lots_status").on(t.status),
  index("idx_lots_expiry_date").on(t.expiryDate),
  index("idx_lots_received_at").on(t.receivedAt),
]);

export type Lot    = typeof lots.$inferSelect;
export type NewLot = typeof lots.$inferInsert;
