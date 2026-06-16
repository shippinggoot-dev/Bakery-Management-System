import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Social posts — platform-agnostic.
 *
 * The user composes a caption + image here and either keeps it as a draft,
 * plans it for a future date, or marks it posted once they've shared it on
 * whichever network they use. The app does not publish to any network
 * directly; it generates content and reminds the user to post it.
 *
 * Status lifecycle:
 *   draft   — composed but no plan date yet
 *   planned — scheduled_for is set; the daily reminder cron picks it up
 *   posted  — user clicked "I posted it"; posted_at recorded
 */
export const socialPosts = pgTable("social_posts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull(),
  imageUrl:     text("image_url"),
  caption:      text("caption"),
  /** null = no plan, just a saved idea; non-null = user intends to post then */
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  /** "draft" | "planned" | "posted" */
  status:       text("status").notNull().default("draft"),
  postedAt:     timestamp("posted_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_social_posts_owner").on(t.ownerId),
  // Partial index — only scans rows the daily reminder cron actually cares about
  index("idx_social_posts_planned_for").on(t.scheduledFor).where(sql`status = 'planned'`),
]);

export type SocialPost    = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
