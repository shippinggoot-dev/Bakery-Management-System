import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const instagramConnections = pgTable("instagram_connections", {
  id:             uuid("id").primaryKey().defaultRandom(),
  ownerId:        uuid("owner_id").notNull().unique(),
  igUserId:       text("ig_user_id").notNull(),
  igUsername:     text("ig_username"),
  pageId:         text("page_id"),
  pageName:       text("page_name"),
  /** Long-lived token (60-day lifespan, refreshed automatically). */
  accessToken:    text("access_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_instagram_connections_owner").on(t.ownerId),
]);

export type InstagramConnection    = typeof instagramConnections.$inferSelect;
export type NewInstagramConnection = typeof instagramConnections.$inferInsert;

export const instagramPosts = pgTable("instagram_posts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  igMediaId:    text("ig_media_id"),
  caption:      text("caption"),
  imageUrl:     text("image_url"),
  /** "posted" | "failed" */
  status:       text("status").notNull().default("posted"),
  errorMessage: text("error_message"),
  postedAt:     timestamp("posted_at"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_instagram_posts_owner").on(t.ownerId),
]);

export type InstagramPost    = typeof instagramPosts.$inferSelect;
export type NewInstagramPost = typeof instagramPosts.$inferInsert;

/**
 * Scheduled / draft Instagram posts. A row sits here in one of four states:
 *   - draft:     no scheduledFor; user is composing or holding for later.
 *   - scheduled: scheduledFor is set and in the future; cron picks it up.
 *   - published: cron successfully posted; igMediaId points to the Graph media.
 *   - failed:    retryCount exhausted; errorMessage explains why.
 *
 * Multi-platform-ready: `platforms` defaults to ["instagram"] but the cron worker
 * iterates the array, so adding facebook/tiktok later is additive, no schema change.
 */
export const instagramDrafts = pgTable("instagram_drafts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  imageUrl:     text("image_url"),
  caption:      text("caption"),
  /** null = no schedule, just a saved idea; non-null = queued for cron pickup */
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  /** "draft" | "scheduled" | "published" | "failed" */
  status:       text("status").notNull().default("draft"),
  /** Future multi-platform: ["instagram"] | ["instagram","facebook"] | ... */
  platforms:    jsonb("platforms").notNull().default(sql`'["instagram"]'::jsonb`),
  /** Set on successful publish; null otherwise */
  igMediaId:    text("ig_media_id"),
  publishedAt:  timestamp("published_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  retryCount:   integer("retry_count").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_instagram_drafts_owner").on(t.ownerId),
  // Partial index — only scans rows the cron worker actually cares about
  index("idx_instagram_drafts_due").on(t.scheduledFor).where(sql`status = 'scheduled'`),
]);

export type InstagramDraft    = typeof instagramDrafts.$inferSelect;
export type NewInstagramDraft = typeof instagramDrafts.$inferInsert;
