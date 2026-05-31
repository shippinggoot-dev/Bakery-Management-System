import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Per-bakery brand voice profile, derived by Claude from the user's past captions.
 * Used as cached system prompt context for caption + weekly plan generation so
 * AI output sounds like the bakery, not like generic marketing copy.
 *
 * Cross-platform on purpose — even though only Instagram captions inform it
 * today, the voice itself applies to any future social platform (FB, TikTok).
 * One row per owner; regenerated when the user clicks "Refresh brand voice".
 */
export const brandVoice = pgTable("brand_voice", {
  ownerId:          uuid("owner_id").primaryKey(),
  /** 2-3 paragraph description of the bakery's voice (tone, vocabulary, register) */
  voiceDescription: text("voice_description"),
  /** 3-5 representative captions Claude picked out as exemplars */
  exampleCaptions:  jsonb("example_captions"),
  /** When Claude last analyzed captions (separate from updatedAt for visibility) */
  generatedAt:      timestamp("generated_at", { withTimezone: true }),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrandVoice    = typeof brandVoice.$inferSelect;
export type NewBrandVoice = typeof brandVoice.$inferInsert;
