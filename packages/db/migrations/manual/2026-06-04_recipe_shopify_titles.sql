-- =============================================================================
-- 2026-06-04 — recipe.shopify_titles + cake_orders.shopify_line_item_title
-- =============================================================================
--
-- Phase 1 of the "create recipe from unlinked Shopify order" feature.
--
-- Two additive columns. Both safe to re-run.
--
--   1. recipes.shopify_titles text[]
--      Each recipe can register one or more Shopify line-item titles it
--      should respond to (case-insensitive). The matcher in
--      packages/api/src/lib/shopify-order-mapping.ts checks both
--      recipe.name and any value in this array. Lets a single recipe
--      catch all variants of a Shopify product without name collisions.
--
--   2. cake_orders.shopify_line_item_title text
--      The original Shopify product title that produced this order row.
--      Populated by both the webhook and the bulk import (whether or
--      not the recipe match succeeded). Used by the planner's
--      "Create recipe from this" action to find every pending unlinked
--      order sharing the same Shopify title and bulk-link them when
--      the new recipe is saved.
-- =============================================================================

DO $$ BEGIN
  IF to_regclass('public.recipes') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'recipes'
      AND column_name  = 'shopify_titles'
  ) THEN
    ALTER TABLE recipes ADD COLUMN shopify_titles text[];
  END IF;
END $$;

-- Helpful for the matcher's reverse lookup. GIN supports array containment
-- (`shopify_titles @> ARRAY['x']`) and overlap (`&&`), which is what the
-- mapper uses to find all candidates for a Shopify line item title.
DO $$ BEGIN
  IF to_regclass('public.recipes') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'recipes'
      AND indexname  = 'idx_recipes_shopify_titles'
  ) THEN
    CREATE INDEX idx_recipes_shopify_titles ON recipes USING gin (shopify_titles);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.cake_orders') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'cake_orders'
      AND column_name  = 'shopify_line_item_title'
  ) THEN
    ALTER TABLE cake_orders ADD COLUMN shopify_line_item_title text;
  END IF;
END $$;

-- Filter index for the "find pending orders for this Shopify title" query.
-- Partial: only rows where the column is set (i.e. Shopify-origin orders).
DO $$ BEGIN
  IF to_regclass('public.cake_orders') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'cake_orders'
      AND indexname  = 'idx_cake_orders_shopify_line_item_title'
  ) THEN
    CREATE INDEX idx_cake_orders_shopify_line_item_title
      ON cake_orders (shopify_line_item_title)
      WHERE shopify_line_item_title IS NOT NULL;
  END IF;
END $$;
