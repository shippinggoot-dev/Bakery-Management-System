-- =============================================================================
-- 2026-06-02 — Close RLS gaps and tenancy escapes
-- =============================================================================
--
-- This migration closes the security findings from the 2026-06-02 audit. It is
-- idempotent AND tolerant of missing tables: every section guards on
-- `to_regclass()` so the migration runs cleanly whether or not the target
-- table exists yet in this particular environment.
--
-- WHY THIS EXISTS:
--   Commit 65f5f32 ("RLS policies for 15 tables missing them") was applied to
--   the production database via the Supabase SQL Editor. The canonical
--   migration files never reproduced that state — so fresh deploys had RLS
--   disabled on 12+ tables. This migration is the source-of-truth catch-up.
--
-- WHAT IT FIXES (audit references in brackets):
--   [C4]  Recipe & ingredient categories become per-tenant.
--   [C7]  Reference tables (allergens) — reads stay open to authenticated,
--         writes blocked at the SQL layer (managed via direct connection).
--   [C8]  Drops legacy USING-only policies that allowed cross-tenant INSERTs.
--   [C1/C9] Enables RLS + owner_access policies on tables that have none.
--   [C10] Locks down query_metrics — no SDK access at all.
--   [H1]  Adds owner_id → auth.users(id) FKs with ON DELETE CASCADE.
--   [H3]  Strengthens customer_sale_items WITH CHECK to validate the linked
--         recipe / premade_cake ownership.
--
-- HOW TO USE:
--   Paste the entire file into the Supabase SQL Editor and run. Re-running is
--   safe. Tables that don't exist in this environment are silently skipped.
-- =============================================================================


-- ───────────────────────────────────────────────────────────────────────────
-- Helper: enable RLS + add owner_access policy if the table exists
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.add_owner_access(p_table text, p_owner_col text DEFAULT 'owner_id')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'skipping %, does not exist', p_table;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = p_table AND policyname = 'owner_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY owner_access ON %I USING (auth.uid() = %I) WITH CHECK (auth.uid() = %I)',
      p_table, p_owner_col, p_owner_col
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.drop_policy_if_exists(p_table text, p_policy text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_policy, p_table);
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Per-tenant categories [C4]
-- ───────────────────────────────────────────────────────────────────────────
-- recipe_categories and ingredient_categories were globally writable. Make
-- them per-tenant: each bakery curates its own list. The backfill copies
-- every category that's referenced by a user's data into that user's tenant,
-- then re-points the references and deletes the orphan global rows.

DO $$ BEGIN
  IF to_regclass('public.recipe_categories') IS NULL THEN RETURN; END IF;

  ALTER TABLE recipe_categories ADD COLUMN IF NOT EXISTS owner_id uuid;

  -- Backfill: one copy per (user, category-name) the user references.
  INSERT INTO recipe_categories (owner_id, name, description)
  SELECT DISTINCT r.owner_id, rc.name, rc.description
  FROM recipes r
  JOIN recipe_categories rc ON r.category_id = rc.id
  WHERE rc.owner_id IS NULL AND r.owner_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- Re-point every recipe at its tenant's copy of the category.
  UPDATE recipes r
  SET category_id = (
    SELECT rc2.id FROM recipe_categories rc2
    WHERE rc2.owner_id = r.owner_id
      AND rc2.name = (SELECT name FROM recipe_categories WHERE id = r.category_id)
    LIMIT 1
  )
  WHERE r.category_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM recipe_categories WHERE id = r.category_id AND owner_id IS NULL
    );

  DELETE FROM recipe_categories WHERE owner_id IS NULL;

  ALTER TABLE recipe_categories ALTER COLUMN owner_id SET NOT NULL;

  -- Drop the global UNIQUE on name (categories now unique per tenant only).
  ALTER TABLE recipe_categories DROP CONSTRAINT IF EXISTS recipe_categories_name_key;
  ALTER TABLE recipe_categories DROP CONSTRAINT IF EXISTS recipe_categories_owner_name;
  ALTER TABLE recipe_categories ADD CONSTRAINT recipe_categories_owner_name UNIQUE (owner_id, name);

  DROP INDEX IF EXISTS idx_recipe_categories_owner;
  CREATE INDEX idx_recipe_categories_owner ON recipe_categories(owner_id);
END $$;

DO $$ BEGIN
  IF to_regclass('public.ingredient_categories') IS NULL THEN RETURN; END IF;

  ALTER TABLE ingredient_categories ADD COLUMN IF NOT EXISTS owner_id uuid;

  INSERT INTO ingredient_categories (owner_id, name, description)
  SELECT DISTINCT i.owner_id, ic.name, ic.description
  FROM ingredients i
  JOIN ingredient_categories ic ON i.category_id = ic.id
  WHERE ic.owner_id IS NULL AND i.owner_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  UPDATE ingredients i
  SET category_id = (
    SELECT ic2.id FROM ingredient_categories ic2
    WHERE ic2.owner_id = i.owner_id
      AND ic2.name = (SELECT name FROM ingredient_categories WHERE id = i.category_id)
    LIMIT 1
  )
  WHERE i.category_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ingredient_categories WHERE id = i.category_id AND owner_id IS NULL
    );

  DELETE FROM ingredient_categories WHERE owner_id IS NULL;

  ALTER TABLE ingredient_categories ALTER COLUMN owner_id SET NOT NULL;

  ALTER TABLE ingredient_categories DROP CONSTRAINT IF EXISTS ingredient_categories_name_key;
  ALTER TABLE ingredient_categories DROP CONSTRAINT IF EXISTS ingredient_categories_owner_name;
  ALTER TABLE ingredient_categories ADD CONSTRAINT ingredient_categories_owner_name UNIQUE (owner_id, name);

  DROP INDEX IF EXISTS idx_ingredient_categories_owner;
  CREATE INDEX idx_ingredient_categories_owner ON ingredient_categories(owner_id);
END $$;

-- Replace the old "any authenticated user" policy with strict per-tenant.
SELECT pg_temp.drop_policy_if_exists('recipe_categories',     'authenticated_all');
SELECT pg_temp.drop_policy_if_exists('ingredient_categories', 'authenticated_all');
SELECT pg_temp.add_owner_access('recipe_categories');
SELECT pg_temp.add_owner_access('ingredient_categories');


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Allergens: read for all, no writes via the SDK [C7]
-- ───────────────────────────────────────────────────────────────────────────
-- Allergens are a small fixed reference set (Norwegian/EU mandatory allergens).
-- Allowing any authenticated user to DELETE them lets one tenant wipe every
-- other tenant's allergen labels. Reads stay open; writes go through the
-- direct postgres connection (Drizzle uses it, RLS is bypassed).

DO $$ BEGIN
  IF to_regclass('public.allergens') IS NULL THEN RETURN; END IF;
  ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS authenticated_all ON allergens;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='allergens' AND policyname='read_authenticated') THEN
    CREATE POLICY read_authenticated ON allergens
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Drop legacy USING-only policies [C8]
-- ───────────────────────────────────────────────────────────────────────────
-- The original migrate-*.sql files created policies with `USING` only. In
-- Postgres a missing `WITH CHECK` defaults to `WITH CHECK (true)` — i.e. no
-- validation on INSERT/UPDATE. The rls-policies.sql file added stricter
-- `owner_access` policies alongside, but Postgres combines permissive policies
-- with OR, so the weaker one keeps the door open: a malicious tenant can
-- INSERT rows with owner_id set to a victim, polluting their CRM/POS ledger.

SELECT pg_temp.drop_policy_if_exists('customers',                'customers_owner');
SELECT pg_temp.drop_policy_if_exists('loyalty_tiers',            'loyalty_tiers_owner');
SELECT pg_temp.drop_policy_if_exists('loyalty_transactions',     'loyalty_transactions_owner');
SELECT pg_temp.drop_policy_if_exists('rewards',                  'rewards_owner');
SELECT pg_temp.drop_policy_if_exists('customer_segments',        'customer_segments_owner');
SELECT pg_temp.drop_policy_if_exists('customer_segment_members', 'csm_owner');
SELECT pg_temp.drop_policy_if_exists('customer_sales',           'customer_sales_owner');
SELECT pg_temp.drop_policy_if_exists('lots',                     'lots_owner');
SELECT pg_temp.drop_policy_if_exists('production_batches',       'production_batches_owner');
SELECT pg_temp.drop_policy_if_exists('waste_logs',               'waste_logs_owner');
SELECT pg_temp.drop_policy_if_exists('stock_movements',          'stock_movements_owner');


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Enable RLS + owner_access on tables that need it [C1/C9]
-- ───────────────────────────────────────────────────────────────────────────
-- Tables created in 2026-05-08_catch_up_baseline.sql and later that never had
-- RLS turned on. A fresh deploy without these enabled means anyone holding
-- the Supabase anon key (which ships in every page) can read across tenants.

SELECT pg_temp.add_owner_access('premade_cakes');
SELECT pg_temp.add_owner_access('other_deliveries');
SELECT pg_temp.add_owner_access('instagram_connections');
SELECT pg_temp.add_owner_access('instagram_posts');
SELECT pg_temp.add_owner_access('instagram_drafts');
SELECT pg_temp.add_owner_access('cake_orders');
SELECT pg_temp.add_owner_access('production_schedules');
SELECT pg_temp.add_owner_access('shopify_settings');
SELECT pg_temp.add_owner_access('email_settings');
SELECT pg_temp.add_owner_access('todos');
SELECT pg_temp.add_owner_access('ai_usage');
SELECT pg_temp.add_owner_access('brand_voice');
SELECT pg_temp.add_owner_access('subscriptions');
SELECT pg_temp.add_owner_access('custom_options');

-- user_preferences keys on user_id, not owner_id.
SELECT pg_temp.add_owner_access('user_preferences', 'user_id');

-- Premade-cake junction tables — access derived from the parent cake's owner.
DO $$ BEGIN
  IF to_regclass('public.premade_cake_sizes') IS NOT NULL THEN
    ALTER TABLE premade_cake_sizes ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='premade_cake_sizes' AND policyname='via_cake') THEN
      CREATE POLICY via_cake ON premade_cake_sizes
        USING (EXISTS (SELECT 1 FROM premade_cakes pc WHERE pc.id = cake_id AND pc.owner_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM premade_cakes pc WHERE pc.id = cake_id AND pc.owner_id = auth.uid()));
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.premade_cake_flavours') IS NOT NULL THEN
    ALTER TABLE premade_cake_flavours ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='premade_cake_flavours' AND policyname='via_cake') THEN
      CREATE POLICY via_cake ON premade_cake_flavours
        USING (EXISTS (SELECT 1 FROM premade_cakes pc WHERE pc.id = cake_id AND pc.owner_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM premade_cakes pc WHERE pc.id = cake_id AND pc.owner_id = auth.uid()));
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.premade_cake_addons') IS NOT NULL THEN
    ALTER TABLE premade_cake_addons ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='premade_cake_addons' AND policyname='via_cake') THEN
      CREATE POLICY via_cake ON premade_cake_addons
        USING (EXISTS (SELECT 1 FROM premade_cakes pc WHERE pc.id = cake_id AND pc.owner_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM premade_cakes pc WHERE pc.id = cake_id AND pc.owner_id = auth.uid()));
    END IF;
  END IF;
END $$;

-- Flavours and cake_addons ARE per-tenant (each bakery curates its own
-- list — they have owner_id columns). Earlier rev of this migration treated
-- them as shared lookups; drop that policy if present and apply owner_access.
SELECT pg_temp.drop_policy_if_exists('flavours',    'read_authenticated');
SELECT pg_temp.drop_policy_if_exists('cake_addons', 'read_authenticated');
SELECT pg_temp.add_owner_access('flavours');
SELECT pg_temp.add_owner_access('cake_addons');


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Lock down query_metrics [C10]
-- ───────────────────────────────────────────────────────────────────────────
-- Diagnostics table. Anyone with the anon key could read the full log of
-- slow procedures + user_ids — useful reconnaissance. The server writes
-- to it via the direct postgres connection (which bypasses RLS), so a
-- USING (false) policy denies ALL SDK access while keeping app writes alive.

DO $$ BEGIN
  IF to_regclass('public.query_metrics') IS NULL THEN RETURN; END IF;
  ALTER TABLE query_metrics ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS owner_access ON query_metrics;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='query_metrics' AND policyname='deny_sdk') THEN
    CREATE POLICY deny_sdk ON query_metrics
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Strengthen customer_sale_items WITH CHECK [H3]
-- ───────────────────────────────────────────────────────────────────────────
-- The existing policy gates on customer_sales.owner_id but doesn't verify
-- recipe_id / premade_cake_id ownership. An attacker can insert a line
-- item on their own sale pointing at victim B's recipe — the stock-deduction
-- trigger then deducts from B's inventory.
--
-- Skipped if customer_sale_items hasn't been created yet on this environment.

DO $$ BEGIN
  IF to_regclass('public.customer_sale_items') IS NULL THEN
    RAISE NOTICE 'customer_sale_items does not exist — skipping policy upgrade';
    RETURN;
  END IF;
  ALTER TABLE customer_sale_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS owner_access      ON customer_sale_items;
  DROP POLICY IF EXISTS via_sale          ON customer_sale_items;
  DROP POLICY IF EXISTS via_sale_with_fks ON customer_sale_items;
  CREATE POLICY via_sale_with_fks ON customer_sale_items
    USING (EXISTS (
      SELECT 1 FROM customer_sales cs WHERE cs.id = sale_id AND cs.owner_id = auth.uid()
    ))
    WITH CHECK (
      EXISTS (SELECT 1 FROM customer_sales cs WHERE cs.id = sale_id AND cs.owner_id = auth.uid())
      AND (
        recipe_id IS NULL OR EXISTS (
          SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.owner_id = auth.uid()
        )
      )
      AND (
        premade_cake_id IS NULL OR EXISTS (
          SELECT 1 FROM premade_cakes p WHERE p.id = premade_cake_id AND p.owner_id = auth.uid()
        )
      )
    );
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 7 — owner_id → auth.users FKs with ON DELETE CASCADE [H1]
-- ───────────────────────────────────────────────────────────────────────────
-- Without FKs, deleting a user via Supabase Auth orphans their PII, recipes,
-- and encrypted tokens forever (GDPR right-to-erasure cannot be satisfied).
-- Bugs that write the wrong UUID also go undetected at the database layer.
--
-- For each owner_id column, first delete orphan rows (rows whose owner_id has
-- no matching auth.users entry) so the FK can be added safely, then add it.

DO $$
DECLARE
  tbl text;
  fk_name text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'recipes', 'ingredients', 'suppliers', 'shopping_lists', 'purchase_orders',
    'price_ingestion_sessions', 'margin_settings', 'notifications',
    'production_batches', 'waste_logs', 'stock_movements',
    'customers', 'loyalty_tiers', 'loyalty_transactions', 'rewards',
    'customer_segments', 'customer_sales',
    'shopify_settings', 'todos', 'cake_orders', 'email_settings',
    'production_schedules', 'other_deliveries',
    'instagram_connections', 'instagram_posts', 'instagram_drafts',
    'custom_options', 'premade_cakes',
    'ai_usage', 'brand_voice', 'subscriptions',
    'recipe_categories', 'ingredient_categories',
    'flavours', 'cake_addons'
  ]) LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    fk_name := tbl || '_owner_id_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = fk_name
    ) THEN
      EXECUTE format(
        'DELETE FROM %I WHERE owner_id NOT IN (SELECT id FROM auth.users)',
        tbl
      );
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE',
        tbl, fk_name
      );
    END IF;
  END LOOP;
END $$;

-- user_preferences keys on user_id; handle it separately.
DO $$ BEGIN
  IF to_regclass('public.user_preferences') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_user_id_fkey') THEN
    DELETE FROM user_preferences WHERE user_id NOT IN (SELECT id FROM auth.users);
    ALTER TABLE user_preferences
      ADD CONSTRAINT user_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- query_metrics.user_id is nullable (server may log anonymous-context errors).
-- Use SET NULL so the metric survives the user's deletion.
DO $$ BEGIN
  IF to_regclass('public.query_metrics') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'query_metrics_user_id_fkey') THEN
    UPDATE query_metrics SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM auth.users);
    ALTER TABLE query_metrics
      ADD CONSTRAINT query_metrics_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- End of migration. Verify with:
--
--   SELECT tablename FROM pg_tables WHERE schemaname='public'
--     AND tablename NOT IN (SELECT tablename FROM pg_policies WHERE schemaname='public')
--   ORDER BY tablename;
--
-- Any rows returned are tables with RLS-but-no-policy (a closed door) OR
-- no-RLS-no-policy (open). Cross-check against the lookup tables above
-- (recipe_ingredients etc. inherit policies from parents and are fine).
-- =============================================================================
