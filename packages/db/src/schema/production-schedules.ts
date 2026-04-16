import { pgTable, text, uuid, timestamp, date, numeric, index } from "drizzle-orm/pg-core";
import { recipes } from "./recipes";

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
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_production_schedules_owner_date").on(t.ownerId, t.scheduledDate),
]);

export type ProductionSchedule    = typeof productionSchedules.$inferSelect;
export type NewProductionSchedule = typeof productionSchedules.$inferInsert;
