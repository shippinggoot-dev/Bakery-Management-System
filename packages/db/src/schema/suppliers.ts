import { pgTable, text, uuid, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  /** Kassal.app physical store ID — set for stores imported from Kassal.app */
  kassalappStoreId: integer("kassalapp_store_id").unique(),
  /** Store chain group code from Kassal.app e.g. MENY_NO, KIWI, REMA_1000 */
  kassalappGroup: text("kassalapp_group"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
