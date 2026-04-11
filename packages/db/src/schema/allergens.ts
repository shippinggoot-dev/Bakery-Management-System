import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const allergens = pgTable("allergens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Allergen = typeof allergens.$inferSelect;
export type NewAllergen = typeof allergens.$inferInsert;
