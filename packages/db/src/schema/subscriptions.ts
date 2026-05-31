import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Per-user subscription state. Drives AI quota tiers.
 *
 * The Stripe-related columns (stripeCustomerId, stripeSubscriptionId,
 * currentPeriodEnd, cancelAtPeriodEnd) are intentionally left nullable and
 * unused in v1. The "Upgrade" CTA today returns a mailto: link and manual
 * tier bumps happen via direct UPDATE. When Stripe Checkout is wired up
 * later, the webhook handler populates these columns — no schema change
 * required at that point, only new code.
 *
 * Tier semantics (defined in code, not DB):
 *   - free: 10 captions + 1 weekly plan + 1 brand voice update per month
 *   - pro:  (placeholder, not yet sellable) higher quotas
 *
 * Rows are created lazily — when a user first triggers an AI feature, the
 * quota check creates a default "free" row if none exists.
 */
export const subscriptions = pgTable("subscriptions", {
  ownerId:               uuid("owner_id").primaryKey(),
  /** "free" | "pro" — string rather than enum so adding tiers doesn't need a migration */
  tier:                  text("tier").notNull().default("free"),

  // ─── Stripe road-ahead (all nullable, unused until Stripe is wired) ────────
  stripeCustomerId:      text("stripe_customer_id"),
  stripeSubscriptionId:  text("stripe_subscription_id"),
  /** End of the current paid period; null for free tier (uses calendar month) */
  currentPeriodEnd:      timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd:     boolean("cancel_at_period_end").notNull().default(false),

  createdAt:             timestamp("created_at").notNull().defaultNow(),
  updatedAt:             timestamp("updated_at").notNull().defaultNow(),
});

export type Subscription    = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
