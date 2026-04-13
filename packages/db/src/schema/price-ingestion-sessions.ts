import { pgTable, text, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";

export const INGESTION_SOURCES = ["invoice", "csv", "api"] as const;
export type IngestionSource = (typeof INGESTION_SOURCES)[number];

export const INGESTION_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

/**
 * One row per import attempt — tracks the full lifecycle of a price ingestion.
 * Items extracted from each session live in price_ingestion_items.
 */
export const priceIngestionSessions = pgTable("price_ingestion_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  /** invoice | csv | api */
  source: text("source").notNull(),
  /** pending | processing | completed | failed */
  status: text("status").notNull().default("pending"),
  /** Original filename for invoice/CSV uploads */
  fileName: text("file_name"),
  /** Total line items extracted from source */
  itemCount: integer("item_count").default(0),
  /** Items that were matched to a known ingredient */
  matchedCount: integer("matched_count").default(0),
  /** Items where price was committed to supplier_prices */
  appliedCount: integer("applied_count").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("idx_price_ingestion_sessions_owner_id").on(t.ownerId),
  index("idx_price_ingestion_sessions_status").on(t.status),
  index("idx_price_ingestion_sessions_started_at").on(t.startedAt),
]);

export type PriceIngestionSession    = typeof priceIngestionSessions.$inferSelect;
export type NewPriceIngestionSession = typeof priceIngestionSessions.$inferInsert;
