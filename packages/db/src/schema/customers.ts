import { pgTable, text, uuid, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const DIETARY_REQUIREMENTS = ["gluten_free", "vegan", "nut_free"] as const;
export const FAVOURITE_CATEGORIES  = ["bread", "pastry", "cakes"] as const;
export const CUSTOMER_TIERS        = ["bronze", "silver", "gold"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

/**
 * A customer registered at the bakery.
 * ownerId = the bakery owner's Supabase auth user id — not a login for the customer.
 */
export const customers = pgTable("customers", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  /** Human-readable loyalty card number, e.g. BAK-000042 */
  cardNumber:   text("card_number").notNull(),
  firstName:    text("first_name").notNull(),
  lastName:     text("last_name").notNull(),
  phone:        text("phone"),
  email:        text("email"),
  /** YYYY-MM-DD — used for birthday reward window */
  birthday:     text("birthday"),
  /** JSON-encoded string array: ["gluten_free", "vegan", "nut_free"] */
  dietaryRequirements: text("dietary_requirements"),
  favouriteCategory:   text("favourite_category"),
  loyaltyOptIn:        boolean("loyalty_opt_in").notNull().default(false),
  marketingOptIn:      boolean("marketing_opt_in").notNull().default(false),
  /** UTC timestamp when the customer gave consent */
  consentTimestamp:    timestamp("consent_timestamp"),
  /** Current redeemable point balance */
  points:              integer("points").notNull().default(0),
  /** All-time points earned (never decremented — used for tier calculation) */
  lifetimePoints:      integer("lifetime_points").notNull().default(0),
  /** All-time monetary spend (text for precision) */
  totalSpend:          text("total_spend").notNull().default("0"),
  tier:                text("tier").notNull().default("bronze"),
  lastVisitAt:         timestamp("last_visit_at"),
  notes:               text("notes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_customers_owner_id").on(t.ownerId),
  index("idx_customers_phone").on(t.phone),
  index("idx_customers_email").on(t.email),
  index("idx_customers_tier").on(t.tier),
  index("idx_customers_last_visit_at").on(t.lastVisitAt),
  uniqueIndex("idx_customers_card_number").on(t.cardNumber),
]);

export type Customer    = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
