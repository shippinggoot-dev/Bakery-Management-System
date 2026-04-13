import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";
import { customers } from "./customers";

export const TRANSACTION_TYPES = ["earn", "redeem", "expire", "bonus", "adjustment"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Immutable ledger of every points movement for a customer.
 * pointsDelta > 0 = points added, < 0 = points removed.
 */
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id:            uuid("id").primaryKey().defaultRandom(),
  ownerId:       uuid("owner_id").notNull(),
  customerId:    uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type:          text("type").notNull(),   // earn | redeem | expire | bonus | adjustment
  pointsDelta:   integer("points_delta").notNull(),
  balanceAfter:  integer("balance_after").notNull(),
  /** UUID of the triggering record (sale id, reward id, etc.) */
  referenceId:   uuid("reference_id"),
  referenceType: text("reference_type"),   // "sale" | "reward" | "manual"
  description:   text("description"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_loyalty_transactions_customer_id").on(t.customerId),
  index("idx_loyalty_transactions_owner_id").on(t.ownerId),
  index("idx_loyalty_transactions_type").on(t.type),
  index("idx_loyalty_transactions_created_at").on(t.createdAt),
]);

export type LoyaltyTransaction    = typeof loyaltyTransactions.$inferSelect;
export type NewLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;
