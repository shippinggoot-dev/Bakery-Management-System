import { pgTable, text, uuid, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const NOTIFICATION_TYPES = [
  "price_change",
  "margin_breach",
  "ingestion_complete",
  "ingestion_failed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * In-app notification queue.
 * Created by the server (ingestion service, margin checker, price sync).
 * Dismissed by the user via the notification bell.
 */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  /** price_change | margin_breach | ingestion_complete | ingestion_failed */
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  /** JSON string with additional context (sessionId, ingredientId, etc.) */
  payload: text("payload"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_notifications_owner_id").on(t.ownerId),
  index("idx_notifications_read").on(t.read),
  index("idx_notifications_created_at").on(t.createdAt),
]);

export type Notification    = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
