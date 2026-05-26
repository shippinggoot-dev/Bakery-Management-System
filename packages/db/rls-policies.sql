-- =============================================================================
-- Row Level Security (RLS) Policies for Bakery Management System
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (supabase.com → your project →
-- SQL Editor → paste and click Run).
--
-- What this does:
--   1. Enables RLS on all user-owned tables — even a direct DB connection
--      cannot read another user's rows without their session token.
--   2. Adds "owner_access" policies so each user sees only their own data.
--   3. Adds cascade policies on child tables (recipe_ingredients etc.) so
--      those rows are also isolated via their parent's owner_id.
--
-- Safe to re-run: the IF NOT EXISTS guards prevent duplicate policy errors.
-- =============================================================================

-- ── Primary tables (have owner_id) ──────────────────────────────────────────

ALTER TABLE recipes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders  ENABLE ROW LEVEL SECURITY;

-- Each user can only read and write their own rows.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipes' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON recipes
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ingredients' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON ingredients
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='suppliers' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON suppliers
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shopping_lists' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON shopping_lists
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_orders' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON purchase_orders
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- ── Child tables (inherit access via parent's owner_id) ──────────────────────

ALTER TABLE recipe_ingredients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_prices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_ingredients' AND policyname='via_recipe') THEN
    CREATE POLICY via_recipe ON recipe_ingredients
      USING (EXISTS (
        SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ingredient_allergens' AND policyname='via_ingredient') THEN
    CREATE POLICY via_ingredient ON ingredient_allergens
      USING (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ingredient_suppliers' AND policyname='via_ingredient') THEN
    CREATE POLICY via_ingredient ON ingredient_suppliers
      USING (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='price_history' AND policyname='via_ingredient_supplier') THEN
    CREATE POLICY via_ingredient_supplier ON price_history
      USING (EXISTS (
        SELECT 1 FROM ingredient_suppliers ins
        JOIN ingredients i ON i.id = ins.ingredient_id
        WHERE ins.id = ingredient_supplier_id AND i.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM ingredient_suppliers ins
        JOIN ingredients i ON i.id = ins.ingredient_id
        WHERE ins.id = ingredient_supplier_id AND i.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lots' AND policyname='via_ingredient') THEN
    CREATE POLICY via_ingredient ON lots
      USING (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='supplier_prices' AND policyname='via_supplier') THEN
    CREATE POLICY via_supplier ON supplier_prices
      USING (EXISTS (
        SELECT 1 FROM suppliers s WHERE s.id = supplier_id AND s.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM suppliers s WHERE s.id = supplier_id AND s.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='purchase_order_items' AND policyname='via_purchase_order') THEN
    CREATE POLICY via_purchase_order ON purchase_order_items
      USING (EXISTS (
        SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_id AND po.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_id AND po.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shopping_list_items' AND policyname='via_shopping_list') THEN
    CREATE POLICY via_shopping_list ON shopping_list_items
      USING (EXISTS (
        SELECT 1 FROM shopping_lists sl WHERE sl.id = shopping_list_id AND sl.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM shopping_lists sl WHERE sl.id = shopping_list_id AND sl.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='price_alerts' AND policyname='via_ingredient') THEN
    CREATE POLICY via_ingredient ON price_alerts
      USING (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM ingredients i WHERE i.id = ingredient_id AND i.owner_id = auth.uid()
      ));
  END IF;
END $$;

-- ── Reference tables (shared — authenticated access) ────────────────────────
-- allergens, ingredient_categories, recipe_categories are shared lookup data
-- with no owner_id. RLS is enabled and any authenticated user may read/write.

ALTER TABLE allergens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_categories     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='allergens' AND policyname='authenticated_all') THEN
    CREATE POLICY authenticated_all ON allergens
      FOR ALL
      USING     (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ingredient_categories' AND policyname='authenticated_all') THEN
    CREATE POLICY authenticated_all ON ingredient_categories
      FOR ALL
      USING     (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipe_categories' AND policyname='authenticated_all') THEN
    CREATE POLICY authenticated_all ON recipe_categories
      FOR ALL
      USING     (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── Tables added after the initial RLS rollout ──────────────────────────────
-- These tables already had RLS enabled but were missing the policy. Without a
-- policy, an RLS-enabled table is unreadable via any auth-aware connection
-- (Supabase SDK / anon key) — the application reads them today only because
-- the direct postgres connection bypasses RLS. Add the standard policy so the
-- safety net applies to future SDK-based access too.

-- Direct owner_id tables — standard owner_access policy.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='custom_options' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON custom_options
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customer_sales' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON customer_sales
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customer_segments' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON customer_segments
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON customers
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='loyalty_tiers' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON loyalty_tiers
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='loyalty_transactions' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON loyalty_transactions
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='margin_settings' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON margin_settings
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON notifications
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='price_ingestion_sessions' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON price_ingestion_sessions
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='production_batches' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON production_batches
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rewards' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON rewards
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_movements' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON stock_movements
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='waste_logs' AND policyname='owner_access') THEN
    CREATE POLICY owner_access ON waste_logs
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- Join tables — access derived from the parent's owner_id.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customer_segment_members' AND policyname='via_segment') THEN
    CREATE POLICY via_segment ON customer_segment_members
      USING (EXISTS (
        SELECT 1 FROM customer_segments cs
        WHERE cs.id = segment_id AND cs.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM customer_segments cs
        WHERE cs.id = segment_id AND cs.owner_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='price_ingestion_items' AND policyname='via_session') THEN
    CREATE POLICY via_session ON price_ingestion_items
      USING (EXISTS (
        SELECT 1 FROM price_ingestion_sessions s
        WHERE s.id = session_id AND s.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM price_ingestion_sessions s
        WHERE s.id = session_id AND s.owner_id = auth.uid()
      ));
  END IF;
END $$;
