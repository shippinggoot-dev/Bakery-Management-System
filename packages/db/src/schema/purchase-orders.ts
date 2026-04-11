import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { ingredients } from "./ingredients";

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "restrict" }),
  orderNumber: text("order_number").unique(),
  /** draft → sent → confirmed → delivered | cancelled */
  status: text("status", {
    enum: ["draft", "sent", "confirmed", "delivered", "cancelled"],
  })
    .notNull()
    .default("draft"),
  orderedAt: timestamp("ordered_at"),
  expectedDeliveryAt: timestamp("expected_delivery_at"),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  quantity: text("quantity").notNull(),
  unit: text("unit").notNull(),
  unitPrice: text("unit_price"),
  totalPrice: text("total_price"),
  notes: text("notes"),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type NewPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;
