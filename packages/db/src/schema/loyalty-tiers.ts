import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";

/**
 * Configurable loyalty tiers for a bakery owner.
 * Defaults (seeded in migration): Bronze / Silver / Gold.
 * minPoints uses lifetimePoints so customers never drop tiers.
 */
export const loyaltyTiers = pgTable("loyalty_tiers", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     uuid("owner_id").notNull(),
  name:        text("name").notNull(),        // "Bronze" | "Silver" | "Gold" | custom
  slug:        text("slug").notNull(),        // "bronze" | "silver" | "gold" | custom
  /** Lifetime points required to reach this tier */
  minPoints:   integer("min_points").notNull().default(0),
  /** Points multiplier — stored as text, e.g. "1.5" */
  multiplier:  text("multiplier").notNull().default("1.0"),
  /** Hex colour for UI badge */
  color:       text("color").notNull().default("#CD7F32"),
  /** JSON-encoded string array of perk descriptions */
  perks:       text("perks"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_loyalty_tiers_owner_id").on(t.ownerId),
]);

export type LoyaltyTier    = typeof loyaltyTiers.$inferSelect;
export type NewLoyaltyTier = typeof loyaltyTiers.$inferInsert;
