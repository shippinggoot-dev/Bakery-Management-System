import { pgTable, text, uuid, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Supabase auth.users(id) — owner of this supplier record */
  ownerId: uuid("owner_id"),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  /** Default lead time in days for orders from this supplier */
  leadTimeDays: integer("lead_time_days"),
  /** Payment terms e.g. "Net 30", "Cash on delivery", "15 days EOM" */
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  /** Kassal.app physical store ID — set for stores imported from Kassal.app */
  kassalappStoreId: integer("kassalapp_store_id").unique(),
  /** Store chain group code from Kassal.app e.g. MENY_NO, KIWI, REMA_1000 */
  kassalappGroup: text("kassalapp_group"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_suppliers_name").on(t.name),
  index("idx_suppliers_is_active").on(t.isActive),
]);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
