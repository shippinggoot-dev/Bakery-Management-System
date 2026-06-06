import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";
import { customers } from "./customers";
import { premadeCakeVariants } from "./premade-cake-variants";

/**
 * Incoming customer orders for baked goods.
 * Used to aggregate ingredient requirements and auto-generate shopping lists.
 */
export const cakeOrders = pgTable("cake_orders", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  ownerId:             uuid("owner_id").notNull(),
  /** Optional FK to the CRM customer record. Set when the order was placed
   *  through the planner with a known customer; null for one-off cake orders
   *  where the buyer chose not to register. Used to award loyalty points
   *  on completion. */
  customerId:          uuid("customer_id")
                        .references(() => customers.id, { onDelete: "set null" }),
  customerName:        text("customer_name"),
  customerEmail:       text("customer_email"),
  /** Nullable — Shopify orders may arrive before being linked to a recipe */
  recipeId:            uuid("recipe_id")
    .references(() => recipes.id, { onDelete: "restrict" }),
  /** Phase 2 variant linkage. Set instead of (or alongside) recipeId when
   *  the order's Shopify variant_title matched a premade_cake_variants
   *  row. Cost / production still flow through the variant's parent
   *  cake's recipe. ON DELETE SET NULL so deleting a variant doesn't
   *  blow up the order. */
  premadeCakeVariantId: uuid("premade_cake_variant_id")
    .references(() => premadeCakeVariants.id, { onDelete: "set null" }),
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
  /** The Shopify line-item title that produced this row. Set by the
   *  webhook + bulk import even when a recipe match is found, so the
   *  "Create recipe from this" planner action can find ALL pending
   *  orders that share the same Shopify product without parsing the
   *  free-text notes field. */
  shopifyLineItemTitle: text("shopify_line_item_title"),
  /** Original Shopify variant_title preserved verbatim. Lets the variant
   *  matcher build a `"<title> — <variant_title>"` lookup key and gives
   *  the planner UI something to display for orders not yet linked to a
   *  variant. Null for simple products with no variants. */
  shopifyVariantTitle:  text("shopify_variant_title"),
  /** Agreed sale price for this order (stored as text) */
  salePrice:           text("sale_price"),
  notes:               text("notes"),
  cakeStyle:           text("cake_style"),
  cakeFormat:          text("cake_format"),
  /** Comma-separated sponge flavours, e.g. "Chocolate,Vanilla" */
  spongeFlavours:      text("sponge_flavours"),
  /** Comma-separated frostings */
  frostings:           text("frostings"),
  /** Comma-separated fillings */
  fillings:            text("fillings"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_cake_orders_owner_id").on(t.ownerId),
  index("idx_cake_orders_due_date").on(t.dueDate),
  index("idx_cake_orders_status").on(t.status),
  index("idx_cake_orders_shopify_order_id").on(t.shopifyOrderId),
  index("idx_cake_orders_customer_id").on(t.customerId),
  index("idx_cake_orders_premade_cake_variant_id").on(t.premadeCakeVariantId),
]);

export type CakeOrder    = typeof cakeOrders.$inferSelect;
export type NewCakeOrder = typeof cakeOrders.$inferInsert;
