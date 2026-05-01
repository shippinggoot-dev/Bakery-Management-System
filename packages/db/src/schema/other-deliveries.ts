import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const otherDeliveries = pgTable(
  "other_deliveries",
  (t) => ({
    id:         uuid("id").primaryKey().defaultRandom(),
    ownerId:    uuid("owner_id").notNull(),
    supplierId: uuid("supplier_id"),
    itemName:   text("item_name").notNull(),
    quantity:   text("quantity").notNull(),
    unit:       text("unit").notNull().default("pcs"),
    lotNumber:  text("lot_number"),
    notes:      text("notes"),
    createdAt:  timestamp("created_at").defaultNow().notNull(),
  }),
  (t) => [
    index("idx_other_deliveries_owner_id").on(t.ownerId),
  ]
);
