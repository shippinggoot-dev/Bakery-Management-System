-- =============================================================================
-- Anonymous user data cleanup
-- =============================================================================
-- Run this weekly in the Supabase SQL Editor (or schedule it via pg_cron).
-- Deletes all data owned by anonymous users whose session is older than 7 days.
-- Anonymous users are identified by auth.users.is_anonymous = true.
--
-- Order matters: delete child rows before parent rows to respect foreign keys.
-- =============================================================================

DO $$
DECLARE
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '7 days';
BEGIN

  -- Collect anonymous user IDs older than the cutoff
  CREATE TEMP TABLE IF NOT EXISTS _anon_ids AS
    SELECT id FROM auth.users
    WHERE is_anonymous = true AND created_at < cutoff;

  -- ── Child tables ────────────────────────────────────────────────────────────

  DELETE FROM recipe_ingredients
    WHERE recipe_id IN (SELECT id FROM recipes WHERE owner_id IN (SELECT id FROM _anon_ids));

  DELETE FROM shopping_list_items
    WHERE shopping_list_id IN (SELECT id FROM shopping_lists WHERE owner_id IN (SELECT id FROM _anon_ids));

  DELETE FROM purchase_order_items
    WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE owner_id IN (SELECT id FROM _anon_ids));

  DELETE FROM ingredient_allergens
    WHERE ingredient_id IN (SELECT id FROM ingredients WHERE owner_id IN (SELECT id FROM _anon_ids));

  DELETE FROM ingredient_suppliers
    WHERE ingredient_id IN (SELECT id FROM ingredients WHERE owner_id IN (SELECT id FROM _anon_ids));

  DELETE FROM price_alerts
    WHERE ingredient_id IN (SELECT id FROM ingredients WHERE owner_id IN (SELECT id FROM _anon_ids));

  DELETE FROM price_history
    WHERE ingredient_supplier_id IN (
      SELECT ins.id FROM ingredient_suppliers ins
      JOIN ingredients i ON i.id = ins.ingredient_id
      WHERE i.owner_id IN (SELECT id FROM _anon_ids)
    );

  DELETE FROM lots
    WHERE ingredient_id IN (SELECT id FROM ingredients WHERE owner_id IN (SELECT id FROM _anon_ids));

  -- ── Price ingestion module ──────────────────────────────────────────────────
  -- Items cascade-delete when session is deleted, so only sessions need explicit deletion.

  DELETE FROM price_ingestion_sessions WHERE owner_id IN (SELECT id FROM _anon_ids);
  DELETE FROM margin_settings          WHERE owner_id IN (SELECT id FROM _anon_ids);
  DELETE FROM notifications            WHERE owner_id IN (SELECT id FROM _anon_ids);

  -- ── Parent tables ───────────────────────────────────────────────────────────

  DELETE FROM recipes          WHERE owner_id IN (SELECT id FROM _anon_ids);
  DELETE FROM ingredients      WHERE owner_id IN (SELECT id FROM _anon_ids);
  DELETE FROM suppliers        WHERE owner_id IN (SELECT id FROM _anon_ids);
  DELETE FROM shopping_lists   WHERE owner_id IN (SELECT id FROM _anon_ids);
  DELETE FROM purchase_orders  WHERE owner_id IN (SELECT id FROM _anon_ids);

  DROP TABLE _anon_ids;

  RAISE NOTICE 'Anonymous cleanup complete (cutoff: %)', cutoff;
END $$;
