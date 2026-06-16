-- =============================================================================
-- Rebrand: Instagram-specific tables → platform-agnostic social posts
-- =============================================================================
-- Removes the direct Meta/Instagram publishing pipeline. The product now
-- helps the user generate content and reminds them to post it themselves,
-- regardless of which network they choose. Concretely this migration:
--
--   1. Renames instagram_drafts → social_posts and reshapes it:
--        - drops ig_media_id, error_message, retry_count, platforms
--        - renames published_at → posted_at
--        - status enum becomes: draft | planned | posted
--        - any stuck "publishing/scheduled/failed" rows get folded into
--          "planned" so the user can decide what to do with them
--   2. Drops instagram_connections (OAuth tokens, no longer used).
--   3. Drops instagram_posts (historical Meta publish log). The brand-voice
--      AI feature now learns from social_posts rows where status='posted',
--      which is "user marked it posted" rather than "Meta API confirmed it".
--
-- Run this ONCE in the Supabase SQL Editor.
-- DESTRUCTIVE: data in instagram_connections and instagram_posts is gone
-- after this runs. instagram_drafts rows are preserved (renamed + reshaped).
-- =============================================================================

-- ── 1. Rename instagram_drafts → social_posts ───────────────────────────────

ALTER TABLE IF EXISTS instagram_drafts RENAME TO social_posts;

-- Re-tag the indexes that were named after the old table
ALTER INDEX IF EXISTS idx_instagram_drafts_owner RENAME TO idx_social_posts_owner;
DROP INDEX IF EXISTS idx_instagram_drafts_due;

-- Re-shape: rename one column, drop the Meta-publish-only columns
ALTER TABLE social_posts RENAME COLUMN published_at TO posted_at;
ALTER TABLE social_posts DROP COLUMN IF EXISTS ig_media_id;
ALTER TABLE social_posts DROP COLUMN IF EXISTS error_message;
ALTER TABLE social_posts DROP COLUMN IF EXISTS retry_count;
ALTER TABLE social_posts DROP COLUMN IF EXISTS platforms;

-- Status enum is now: draft | planned | posted.
--   scheduled  → planned (user-intended date, no auto-publish)
--   publishing → planned (stuck mid-publish; treat as planned again)
--   failed     → planned (Meta-side failures no longer apply)
--   published  → posted
UPDATE social_posts SET status = 'planned' WHERE status IN ('scheduled','publishing','failed');
UPDATE social_posts SET status = 'posted'  WHERE status = 'published';

-- New partial index on scheduled_for for the daily reminder cron
CREATE INDEX IF NOT EXISTS idx_social_posts_planned_for
  ON social_posts(scheduled_for)
  WHERE status = 'planned';

-- ── 2. Drop instagram_connections ───────────────────────────────────────────
-- Stored Meta OAuth tokens. Nothing reads from here after this migration.

DROP TABLE IF EXISTS instagram_connections;

-- ── 3. Drop instagram_posts ─────────────────────────────────────────────────
-- Historical Meta publish log. Brand-voice analysis now uses social_posts
-- rows where status='posted'.

DROP TABLE IF EXISTS instagram_posts;

-- =============================================================================
-- Done. Verify with:
--   SELECT tablename FROM pg_tables WHERE schemaname='public'
--     AND tablename IN ('social_posts','instagram_drafts','instagram_connections','instagram_posts');
-- Should return exactly one row: social_posts.
--
--   SELECT status, COUNT(*) FROM social_posts GROUP BY status;
-- Should only show some combination of: draft, planned, posted.
-- =============================================================================
