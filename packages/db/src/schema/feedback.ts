import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";

export const FEEDBACK_CATEGORIES = ["bug", "idea", "question", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ["new", "handled", "dismissed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * In-app feedback submitted by end users (bakery owners).
 * Global table — not multi-tenant. All feedback flows to the super admin
 * for triage in `/feedback`. Discord webhook fires on insert but only
 * receives a minimal payload (category + workspace email + admin link);
 * full content stays in this table and in Supabase Storage.
 */
export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Auth user id of the submitter. Nullable so a sign-out mid-submit doesn't break. */
  submittedBy: uuid("submitted_by"),
  /** Email of the submitter at submit time, denormalised so it survives account deletion. */
  submittedByEmail: text("submitted_by_email"),
  /** bug | idea | question | other */
  category: text("category").notNull(),
  message: text("message").notNull(),
  /** Page the user was on when they opened the form, e.g. "/recipes/abc". */
  pageUrl: text("page_url"),
  /** "en" | "nb" — locale at submit time. */
  language: text("language"),
  userAgent: text("user_agent"),
  /** Storage path inside the `feedback-screenshots` bucket. Null when no screenshot. */
  screenshotPath: text("screenshot_path"),
  /** Optional manual file upload (separate from auto-capture). */
  attachmentPath: text("attachment_path"),
  /** new | handled | dismissed */
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  handledAt: timestamp("handled_at"),
}, (t) => [
  index("idx_feedback_status").on(t.status),
  index("idx_feedback_created_at").on(t.createdAt),
]);

export type Feedback    = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
