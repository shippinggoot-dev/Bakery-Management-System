import { pgTable, text, uuid, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const customOptions = pgTable("custom_options", {
  id:         uuid("id").primaryKey().defaultRandom(),
  ownerId:    uuid("owner_id").notNull(),
  fieldKey:   text("field_key").notNull(),
  value:      text("value").notNull(),
  useCount:   integer("use_count").notNull().default(1),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_custom_options_owner_field").on(t.ownerId, t.fieldKey),
  uniqueIndex("uq_custom_options").on(t.ownerId, t.fieldKey, t.value),
]);

export type CustomOption = typeof customOptions.$inferSelect;
