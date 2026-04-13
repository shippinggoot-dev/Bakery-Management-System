import { pgTable, text, uuid, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * Per-user margin and alert configuration.
 * One row per user (owner_id has a UNIQUE constraint).
 */
export const marginSettings = pgTable("margin_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().unique(),
  /** Alert when recipe margin drops below this percentage (e.g. "20" = 20%) */
  minMarginPct: text("min_margin_pct").notNull().default("20"),
  /** Alert when any ingredient cost rises by more than this percentage */
  priceRiseThresholdPct: text("price_rise_threshold_pct").notNull().default("5"),
  /** Optional webhook URL to POST alerts to */
  webhookUrl: text("webhook_url"),
  /** Whether to dispatch webhook notifications */
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_margin_settings_owner_id").on(t.ownerId),
]);

export type MarginSettings    = typeof marginSettings.$inferSelect;
export type NewMarginSettings = typeof marginSettings.$inferInsert;
