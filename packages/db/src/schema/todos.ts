import { pgTable, text, uuid, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const TODO_PRIORITIES = ["low", "medium", "high"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const todos = pgTable("todos", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     uuid("owner_id").notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  completed:   boolean("completed").notNull().default(false),
  /** YYYY-MM-DD */
  dueDate:     text("due_date"),
  priority:    text("priority").notNull().default("medium"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_todos_owner_id").on(t.ownerId),
  index("idx_todos_completed").on(t.completed),
]);

export type Todo    = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
