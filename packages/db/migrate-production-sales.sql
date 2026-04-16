-- ============================================================
-- Migration: production schedules, selling_price, sale_price
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add selling_price to recipes
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS selling_price text;

-- 2. Add sale_price to cake_orders
ALTER TABLE cake_orders ADD COLUMN IF NOT EXISTS sale_price text;

-- 3. Production schedules table
CREATE TABLE IF NOT EXISTS production_schedules (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid    NOT NULL,
  recipe_id    uuid    REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_name  text,
  scheduled_date date  NOT NULL,
  shift        text    NOT NULL DEFAULT 'morning',  -- morning | afternoon | evening
  batch_count  numeric NOT NULL DEFAULT 1,
  notes        text,
  status       text    NOT NULL DEFAULT 'planned',  -- planned | in_progress | done | cancelled
  assigned_to  text,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_schedules_owner_date
  ON production_schedules (owner_id, scheduled_date);

-- 4. RLS on production_schedules
ALTER TABLE production_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'production_schedules' AND policyname = 'owner_all'
  ) THEN
    CREATE POLICY owner_all ON production_schedules
      FOR ALL USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;
