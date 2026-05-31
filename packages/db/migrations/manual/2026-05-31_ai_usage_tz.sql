-- =============================================================================
-- Convert timezone-naive columns on social-planner tables to timestamptz
-- =============================================================================
-- The original 2026-05-27 migration created several timestamp columns without
-- timezone, while application code writes UTC instants via `new Date()` and
-- quota math reads UTC. On a Norwegian server (CET / CEST) the implicit
-- conversion shifts month boundaries by 1-2 hours, so users get an extra
-- hour of quota at month rollover and lose an hour at month start.
--
-- This migration converts every affected column to `timestamptz`, treating
-- the existing stored values as having been written in UTC (which matches
-- what the code actually intended).
--
-- Run this ONCE in the Supabase SQL Editor.
-- Safe to re-run: ALTER ... TYPE is a no-op if the column is already
-- timestamptz, but psql will still emit a notice — that's fine.
-- =============================================================================

-- ── ai_usage ────────────────────────────────────────────────────────────────
-- Primary fix: quota windows depend on this column.
ALTER TABLE ai_usage
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

-- ── instagram_drafts ────────────────────────────────────────────────────────
-- updated_at is critical: the cron sweeper uses it to detect orphaned
-- "publishing" rows via `updated_at < now() - interval '5 minutes'`.
ALTER TABLE instagram_drafts
  ALTER COLUMN published_at TYPE timestamptz USING published_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at   TYPE timestamptz USING created_at   AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at   TYPE timestamptz USING updated_at   AT TIME ZONE 'UTC';

-- ── brand_voice ─────────────────────────────────────────────────────────────
ALTER TABLE brand_voice
  ALTER COLUMN generated_at TYPE timestamptz USING generated_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at   TYPE timestamptz USING updated_at   AT TIME ZONE 'UTC';

-- ── subscriptions ───────────────────────────────────────────────────────────
-- current_period_end was already timestamptz in the original migration; left untouched.
ALTER TABLE subscriptions
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- =============================================================================
-- Verify with:
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name IN ('ai_usage','instagram_drafts','brand_voice','subscriptions')
--     AND column_name LIKE '%_at%' OR column_name = 'generated_at';
-- Every row's data_type should read 'timestamp with time zone'.
-- =============================================================================
