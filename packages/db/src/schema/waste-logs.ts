import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { ingredients } from "./ingredients";
import { lots } from "./lots";

export const WASTE_REASONS = [
  "expired",
  "damaged",
  "quality_issue",
  "spillage",
  "trimming",
  "overproduction",
  "other",
] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const wasteLogs = pgTable("waste_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  /** Specific lot that was wasted (optional — may be unknown) */
  lotId: uuid("lot_id").references(() => lots.id, { onDelete: "set null" }),
  /** Amount wasted, in the ingredient's canonical unit */
  quantity: text("quantity").notNull(),
  unit: text("unit").notNull(),
  reason: text("reason").notNull().default("other"),
  notes: text("notes"),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_waste_logs_owner_id").on(t.ownerId),
  index("idx_waste_logs_ingredient_id").on(t.ingredientId),
  index("idx_waste_logs_logged_at").on(t.loggedAt),
  index("idx_waste_logs_reason").on(t.reason),
]);

export type WasteLog    = typeof wasteLogs.$inferSelect;
export type NewWasteLog = typeof wasteLogs.$inferInsert;
