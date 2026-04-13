import { pgTable, text, uuid, timestamp, integer, index, primaryKey } from "drizzle-orm/pg-core";
import { customers } from "./customers";

/**
 * A named group of customers built from filter criteria.
 * criteria is a JSON object stored as text — evaluated server-side on demand.
 * Example: { "tier": "gold", "minPoints": 200, "maxDaysSinceVisit": 30 }
 */
export const customerSegments = pgTable("customer_segments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     uuid("owner_id").notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  /** JSON-encoded SegmentCriteria object */
  criteria:    text("criteria").notNull().default("{}"),
  memberCount: integer("member_count").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_customer_segments_owner_id").on(t.ownerId),
]);

export const customerSegmentMembers = pgTable("customer_segment_members", {
  segmentId:  uuid("segment_id").notNull().references(() => customerSegments.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  addedAt:    timestamp("added_at").notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.segmentId, t.customerId] }),
  index("idx_csm_segment_id").on(t.segmentId),
  index("idx_csm_customer_id").on(t.customerId),
]);

export type CustomerSegment    = typeof customerSegments.$inferSelect;
export type NewCustomerSegment = typeof customerSegments.$inferInsert;

export interface SegmentCriteria {
  tier?: string;
  minPoints?: number;
  maxDaysSinceVisit?: number;
  dietaryRequirement?: string;
  minLifetimeSpend?: number;
  hasActiveReward?: boolean;
}
