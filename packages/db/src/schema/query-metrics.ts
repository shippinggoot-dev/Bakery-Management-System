import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";

/**
 * Captures slow or failed tRPC procedure calls so we can diagnose
 * recurring loading issues (e.g. recipe page hanging on Supabase
 * cold-start). Only entries above the latency threshold or with an
 * error are persisted — fast successes stay client-side.
 */
export const queryMetrics = pgTable("query_metrics", {
  id:           uuid("id").primaryKey().defaultRandom(),
  procedure:    text("procedure").notNull(),
  durationMs:   integer("duration_ms").notNull(),
  status:       text("status").notNull(),
  errorMessage: text("error_message"),
  userId:       uuid("user_id"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_query_metrics_created_at").on(t.createdAt),
  index("idx_query_metrics_procedure").on(t.procedure),
]);

export type QueryMetric    = typeof queryMetrics.$inferSelect;
export type NewQueryMetric = typeof queryMetrics.$inferInsert;
