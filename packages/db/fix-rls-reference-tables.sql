-- =============================================================================
-- Fix: Enable RLS on shared reference tables
-- =============================================================================
-- Supabase flagged allergens, ingredient_categories, and recipe_categories
-- as "publicly accessible" because RLS was not enabled on them.
--
-- These tables are shared across all users (no owner_id), so we allow any
-- authenticated user to read and write them. This resolves the critical
-- security warning while preserving all existing functionality.
--
-- Safe to re-run: IF NOT EXISTS guards prevent duplicate policy errors.
-- =============================================================================

ALTER TABLE allergens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_categories     ENABLE ROW LEVEL SECURITY;

-- allergens: authenticated users can read and manage allergen reference data
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='allergens' AND policyname='authenticated_all') THEN
    CREATE POLICY authenticated_all ON allergens
      FOR ALL
      USING     (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ingredient_categories: authenticated users can read and manage categories
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ingredient_categories' AND policyname='authenticated_all') THEN
    CREATE POLICY authenticated_all ON ingredient_categories
      FOR ALL
      USING     (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- recipe_categories: authenticated users can read and manage categories
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_categories' AND policyname='authenticated_all') THEN
    CREATE POLICY authenticated_all ON recipe_categories
      FOR ALL
      USING     (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
