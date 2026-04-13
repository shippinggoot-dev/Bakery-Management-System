import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";
import { customers } from "./customers";

export const REWARD_TYPES    = ["birthday", "milestone", "reengagement", "custom"] as const;
export const REWARD_STATUSES = ["pending", "notified", "redeemed", "expired"] as const;
export type RewardType   = (typeof REWARD_TYPES)[number];
export type RewardStatus = (typeof REWARD_STATUSES)[number];

/**
 * An earned or triggered reward for a customer.
 * birthday    — 7-day window around their birthday
 * milestone   — every 100 lifetime points earned
 * reengagement— no visit in 30 days
 * custom      — manually issued by owner
 */
export const rewards = pgTable("rewards", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  ownerId:             uuid("owner_id").notNull(),
  customerId:          uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type:                text("type").notNull(),
  description:         text("description").notNull(),
  /** Percentage discount, e.g. 10 = 10% off */
  discountPct:         integer("discount_pct"),
  freeItemDescription: text("free_item_description"),
  /** Points to deduct when redeeming (0 for free rewards) */
  pointsRequired:      integer("points_required").notNull().default(0),
  status:              text("status").notNull().default("pending"),
  validFrom:           timestamp("valid_from").notNull().defaultNow(),
  validUntil:          timestamp("valid_until").notNull(),
  redeemedAt:          timestamp("redeemed_at"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_rewards_customer_id").on(t.customerId),
  index("idx_rewards_owner_id").on(t.ownerId),
  index("idx_rewards_status").on(t.status),
  index("idx_rewards_valid_until").on(t.validUntil),
]);

export type Reward    = typeof rewards.$inferSelect;
export type NewReward = typeof rewards.$inferInsert;
