import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";
import { customers } from "./customers";

/**
 * A recorded sale at the POS.
 * Links a monetary amount to a customer and records points awarded.
 * customerId is nullable — anonymous / walk-in sales.
 */
export const customerSales = pgTable("customer_sales", {
  id:             uuid("id").primaryKey().defaultRandom(),
  ownerId:        uuid("owner_id").notNull(),
  customerId:     uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  /** Monetary sale total as text for precision */
  amount:         text("amount").notNull(),
  currency:       text("currency").notNull().default("NOK"),
  /** Free-text description of what was sold */
  items:          text("items"),
  pointsAwarded:  integer("points_awarded").notNull().default(0),
  rewardRedeemedId: uuid("reward_redeemed_id"),
  notes:          text("notes"),
  soldAt:         timestamp("sold_at").notNull().defaultNow(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_customer_sales_customer_id").on(t.customerId),
  index("idx_customer_sales_owner_id").on(t.ownerId),
  index("idx_customer_sales_sold_at").on(t.soldAt),
]);

export type CustomerSale    = typeof customerSales.$inferSelect;
export type NewCustomerSale = typeof customerSales.$inferInsert;
