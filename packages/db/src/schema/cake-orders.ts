import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";

/**
 * Incoming customer orders for baked goods.
 * Used to aggregate ingredient requirements and auto-generate shopping lists.
 */
export const cakeOrders = pgTable("cake_orders", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  ownerId:             uuid("owner_id").notNull(),
  customerName:        text("customer_name"),
  customerEmail:       text("customer_email"),
  /** Nullable — Shopify orders may arrive before being linked to a recipe */
  recipeId:            uuid("recipe_id")
    .references(() => recipes.id, { onDelete: "restrict" }),
  /** How many of the recipe's yield unit are needed (e.g. 24 cookies, 2 cakes) */
  quantity:            text("quantity").notNull().default("1"),
  dueDate:             text("due_date"),
  status:              text("status", {
    enum: ["pending", "planned", "in_progress", "completed", "cancelled"],
  }).notNull().default("pending"),
  paymentStatus:       text("payment_status", {
    enum: ["pending", "paid", "unpaid", "refunded"],
  }).notNull().default("pending"),
  /** Shopify order ID — used for deduplication */
  shopifyOrderId:      text("shopify_order_id"),
  /** Shopify human-readable order name, e.g. "#1042" */
  shopifyOrderNumber:  text("shopify_order_number"),
  notes:               text("notes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_cake_orders_owner_id").on(t.ownerId),
  index("idx_cake_orders_due_date").on(t.dueDate),
  index("idx_cake_orders_status").on(t.status),
  index("idx_cake_orders_shopify_order_id").on(t.shopifyOrderId),
]);

export type CakeOrder    = typeof cakeOrders.$inferSelect;
export type NewCakeOrder = typeof cakeOrders.$inferInsert;
