-- =====================================================================
-- Shopify bidirectional integration migration
--
-- Run this AFTER 2026-05-09_phase3_polish.sql.
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- =====================================================================

-- 1) Recipes link back to their pushed Shopify product/variant/inventory item.
--    Stored as text because Shopify IDs are 64-bit integers that lose
--    precision when cast through JavaScript Number.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shopify_product_id        text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shopify_variant_id        text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text;

CREATE INDEX IF NOT EXISTS idx_recipes_shopify_product_id
  ON recipes(shopify_product_id);

-- 2) Same triple on premade cakes — they push to Shopify alongside recipes.
ALTER TABLE premade_cakes ADD COLUMN IF NOT EXISTS shopify_product_id        text;
ALTER TABLE premade_cakes ADD COLUMN IF NOT EXISTS shopify_variant_id        text;
ALTER TABLE premade_cakes ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text;

CREATE INDEX IF NOT EXISTS idx_premade_cakes_shopify_product_id
  ON premade_cakes(shopify_product_id);

-- 3) Per-shop config for inventory level pushes.
ALTER TABLE shopify_settings ADD COLUMN IF NOT EXISTS shopify_location_id    text;
ALTER TABLE shopify_settings ADD COLUMN IF NOT EXISTS last_inventory_sync_at timestamp;
