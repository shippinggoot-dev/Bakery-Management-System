import { pgTable, text, uuid, timestamp, date, numeric, index } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";
import { productionBatches } from "./production-batches";
import { cakeOrders } from "./cake-orders";

export const productionSchedules = pgTable("production_schedules", {
  id:            uuid("id").primaryKey().defaultRandom(),
  ownerId:       uuid("owner_id").notNull(),
  recipeId:      uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  /** Snapshot of recipe name in case the recipe is later deleted */
  recipeName:    text("recipe_name"),
  scheduledDate: date("scheduled_date").notNull(),
  /** morning | afternoon | evening */
  shift:         text("shift").notNull().default("morning"),
  /** Number of recipe batches to produce */
  batchCount:    numeric("batch_count").notNull().default("1"),
  notes:         text("notes"),
  /** planned | in_progress | done | cancelled */
  status:        text("status").notNull().default("planned"),
  assignedTo:    text("assigned_to"),
  /** Set when the schedule has been recorded as a real production batch.
   *  Non-null = stock has been deducted; status changes are locked unless
   *  explicitly unlocked via the preferences-aware unlock flow. */
  recordedBatchId: uuid("recorded_batch_id").references(() => productionBatches.id, { onDelete: "set null" }),
  /** If this schedule was auto-created from a customer cake order, the FK
   *  back to the originating cake_orders row. The UI uses this to show a
   *  badge linking back to the order. ON DELETE SET NULL so cancelling an
   *  order doesn't blow up the schedule. */
  cakeOrderId:    uuid("cake_order_id").references(() => cakeOrders.id, { onDelete: "set null" }),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_production_schedules_owner_date").on(t.ownerId, t.scheduledDate),
  index("idx_production_schedules_recorded_batch_id").on(t.recordedBatchId),
  index("idx_production_schedules_cake_order_id").on(t.cakeOrderId),
]);

export type ProductionSchedule    = typeof productionSchedules.$inferSelect;
export type NewProductionSchedule = typeof productionSchedules.$inferInsert;
