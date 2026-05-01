import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

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
