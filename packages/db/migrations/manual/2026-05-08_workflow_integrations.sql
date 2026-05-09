-- =====================================================================
-- Workflow integrations migration (Phase 1)
--
-- Run this AFTER 2026-05-08_catch_up_baseline.sql.
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- =====================================================================

-- 1) Link a scheduled production entry to the actual recorded batch.
--    Non-null means stock has been deducted; the UI uses this to lock the
--    status field so the same batch cannot be deducted twice.
ALTER TABLE production_schedules
  ADD COLUMN IF NOT EXISTS recorded_batch_id uuid
  REFERENCES production_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_schedules_recorded_batch_id
  ON production_schedules(recorded_batch_id);

-- 2) Per-user workflow preferences (UX toggles, not workspace data).
--    Keyed on the auth user id so settings survive across devices.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                   uuid        PRIMARY KEY,
  confirm_batch_completion  boolean     NOT NULL DEFAULT true,
  created_at                timestamp   NOT NULL DEFAULT now(),
  updated_at                timestamp   NOT NULL DEFAULT now()
);

-- Row-level security: each user can only read/write their own row.
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_preferences'
      AND policyname = 'user_preferences_self_select'
  ) THEN
    CREATE POLICY user_preferences_self_select
      ON user_preferences FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_preferences'
      AND policyname = 'user_preferences_self_insert'
  ) THEN
    CREATE POLICY user_preferences_self_insert
      ON user_preferences FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_preferences'
      AND policyname = 'user_preferences_self_update'
  ) THEN
    CREATE POLICY user_preferences_self_update
      ON user_preferences FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
