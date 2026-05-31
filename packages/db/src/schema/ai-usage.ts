import { pgTable, uuid, text, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";

/**
 * Per-call log of every Claude API request the platform makes on a user's behalf.
 * Two purposes:
 *   1. Quota enforcement — count rows per owner in the current calendar month to
 *      decide whether the next AI call is allowed.
 *   2. Cost visibility — sum costCents to know what each user (and the platform
 *      in total) is spending.
 *
 * Never deleted on a regular cadence — historical usage informs pricing decisions.
 * A retention/cleanup policy can be added later if the table grows beyond useful.
 */
export const aiUsage = pgTable("ai_usage", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  /** "caption" | "weekly_plan" | "brand_voice" */
  feature:      text("feature").notNull(),
  inputTokens:  integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  /** Stored as a fractional cent for precision — Anthropic prices are sub-cent per call */
  costCents:    numeric("cost_cents", { precision: 10, scale: 4 }).notNull(),
  /** "ok" | "error" — failed calls still consume quota to prevent retry abuse */
  outcome:      text("outcome").notNull().default("ok"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Composite index supports the "usage this month" quota query
  index("idx_ai_usage_owner_created").on(t.ownerId, t.createdAt),
]);

export type AiUsage    = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
