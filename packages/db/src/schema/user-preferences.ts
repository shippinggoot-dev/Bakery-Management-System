import { pgTable, uuid, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-user workflow preferences (UX toggles, not workspace data).
 * Keyed on the auth user id so it survives across sessions and devices.
 *
 * NOTE on roles: every preference here is currently per-individual. When a
 * proper workspace_members + role system lands, role-gated behaviours should
 * read from that table rather than overloading this one.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey(),

  /** When true, marking a scheduled batch "done" pops a confirmation modal
   *  showing the predicted ingredient deductions. When false, deduction
   *  fires silently with a toast. Default true (foolproof). */
  confirmBatchCompletion: boolean("confirm_batch_completion").notNull().default(true),

  /** When true, the Shopify activity tile occupies the 4th slot in the
   *  dashboard's Today row. When false, the Tomorrow preview tile takes
   *  that slot instead. Default true so users discover the integration. */
  dashboardShowShopifyTile: boolean("dashboard_show_shopify_tile").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserPreferences    = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
