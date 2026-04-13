import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";

/**
 * A recorded production run — "we made 2 batches of Chocolate Sponge today."
 * Recording a batch automatically deducts stock from ingredient lots (FEFO order).
 */
export const productionBatches = pgTable("production_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "restrict" }),
  /** How many times the recipe was scaled (e.g. 2 = double batch) */
  scaleFactor: text("scale_factor").notNull().default("1"),
  /** Actual yield produced */
  yieldAmount: text("yield_amount").notNull(),
  yieldUnit: text("yield_unit").notNull(),
  producedAt: timestamp("produced_at").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_production_batches_owner_id").on(t.ownerId),
  index("idx_production_batches_recipe_id").on(t.recipeId),
  index("idx_production_batches_produced_at").on(t.producedAt),
]);

export type ProductionBatch    = typeof productionBatches.$inferSelect;
export type NewProductionBatch = typeof productionBatches.$inferInsert;
