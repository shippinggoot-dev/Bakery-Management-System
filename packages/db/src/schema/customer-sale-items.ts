import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";
import { customerSales } from "./customer-sales";
import { recipes } from "./recipes";
import { premadeCakes } from "./premade-cakes";

/**
 * Line items on a POS sale.
 *
 * A sale row in customer_sales captures the total + customer + points. This
 * table captures *what* was sold, so the inventory side can react: each item
 * with a recipeId triggers a FEFO deduction at the matching scale, premade
 * cakes resolve through the cake's recipeId, and free-form items just record
 * revenue without touching stock.
 */
export const customerSaleItems = pgTable("customer_sale_items", {
  id:            uuid("id").primaryKey().defaultRandom(),
  saleId:        uuid("sale_id").notNull()
                  .references(() => customerSales.id, { onDelete: "cascade" }),

  /** Free-text label shown on the receipt — always present, even when linked. */
  description:   text("description").notNull(),

  /** If set, deducts ingredients via this recipe at the matching scale. */
  recipeId:      uuid("recipe_id")
                  .references(() => recipes.id, { onDelete: "set null" }),

  /** Optional link to a premade cake catalog entry; the cake's recipeId
   *  is what actually drives deduction. */
  premadeCakeId: uuid("premade_cake_id")
                  .references(() => premadeCakes.id, { onDelete: "set null" }),

  /** How many of this item were sold. Stored as text for fractional support. */
  quantity:      text("quantity").notNull().default("1"),

  /** Unit price as text for precision (matches customer_sales.amount). */
  unitPrice:     text("unit_price"),

  /** Computed line total (quantity × unitPrice) at sale time, stored to
   *  preserve historical accuracy if prices later change. */
  lineTotal:     text("line_total"),

  /** Sort order on the receipt. */
  sortOrder:     integer("sort_order").notNull().default(0),

  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_customer_sale_items_sale_id").on(t.saleId),
  index("idx_customer_sale_items_recipe_id").on(t.recipeId),
  index("idx_customer_sale_items_premade_cake_id").on(t.premadeCakeId),
]);

export type CustomerSaleItem    = typeof customerSaleItems.$inferSelect;
export type NewCustomerSaleItem = typeof customerSaleItems.$inferInsert;
