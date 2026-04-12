import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { ingredients } from "./ingredients";

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Supabase auth.users(id) — owner of this shopping list */
  ownerId: uuid("owner_id"),
  name: text("name").notNull(),
  description: text("description"),
  /** draft → in_progress → completed */
  status: text("status", {
    enum: ["draft", "in_progress", "completed"],
  })
    .notNull()
    .default("draft"),
  dueDate: text("due_date"), // stored as YYYY-MM-DD
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  shoppingListId: uuid("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  quantityNeeded: text("quantity_needed").notNull(),
  unit: text("unit").notNull(),
  quantityOnHand: text("quantity_on_hand").notNull().default("0"),
  quantityToPurchase: text("quantity_to_purchase").notNull().default("0"),
  isPurchased: boolean("is_purchased").notNull().default(false),
  notes: text("notes"),
});

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type NewShoppingList = typeof shoppingLists.$inferInsert;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type NewShoppingListItem = typeof shoppingListItems.$inferInsert;
