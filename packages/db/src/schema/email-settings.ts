import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Per-user email sending configuration.
 * Users can supply their own Resend API key and sending address,
 * or leave the key blank to use the platform default (if configured).
 */
export const emailSettings = pgTable("email_settings", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull().unique(),
  fromName:     text("from_name"),
  fromEmail:    text("from_email"),
  /** Resend API key — stored server-side, never returned to the client in full */
  resendApiKey: text("resend_api_key"),
  /** Whether to auto-send order confirmation emails via the webhook */
  sendConfirmations: boolean("send_confirmations").notNull().default(false),
  /** Whether to auto-send status update emails when an order status changes */
  sendStatusUpdates: boolean("send_status_updates").notNull().default(false),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

export type EmailSettings    = typeof emailSettings.$inferSelect;
export type NewEmailSettings = typeof emailSettings.$inferInsert;
