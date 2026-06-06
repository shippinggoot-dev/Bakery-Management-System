-- =====================================================================
-- Phase 2 — Shopify product variants
--
-- Adds the `premade_cake_variants` table + the two `cake_orders` columns
-- needed to link incoming Shopify line items to a specific variant.
-- This migration is ADDITIVE ONLY — no behaviour changes until PR 2
-- (matcher) lands. Safe to re-run; every statement is idempotent.
--
-- See docs/phase2-variants.md for the full design.
-- =====================================================================

-- 1) Per-cake variant rows. One row per actually-orderable
--    size × flavour × occasion combination the bakery sells through
--    Shopify.
CREATE TABLE IF NOT EXISTS premade_cake_variants (
  id                        uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  cake_id                   uuid       NOT NULL REFERENCES premade_cakes(id) ON DELETE CASCADE,
  label                     text       NOT NULL,
  flavour_id                uuid       REFERENCES flavours(id) ON DELETE SET NULL,
  size_label                text,
  serves                    integer,
  occasion                  text,
  price                     text       NOT NULL,
  shopify_variant_id        text,
  shopify_inventory_item_id text,
  shopify_match_title       text,
  is_active                 boolean    NOT NULL DEFAULT true,
  display_order             integer    NOT NULL DEFAULT 0,
  created_at                timestamp  NOT NULL DEFAULT now(),
  updated_at                timestamp  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_premade_cake_variants_cake_id
  ON premade_cake_variants(cake_id);
CREATE INDEX IF NOT EXISTS idx_premade_cake_variants_shopify_variant_id
  ON premade_cake_variants(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_premade_cake_variants_shopify_match_title
  ON premade_cake_variants(shopify_match_title);

-- 2) Order linkage. An order now points at EITHER a recipe (legacy /
--    simple Shopify products) or a premade_cake_variant (variant
--    products). Both columns are nullable. shopify_variant_title is
--    preserved verbatim from Shopify for diagnostics / fallback display.
ALTER TABLE cake_orders
  ADD COLUMN IF NOT EXISTS premade_cake_variant_id uuid
    REFERENCES premade_cake_variants(id) ON DELETE SET NULL;

ALTER TABLE cake_orders
  ADD COLUMN IF NOT EXISTS shopify_variant_title text;

CREATE INDEX IF NOT EXISTS idx_cake_orders_premade_cake_variant_id
  ON cake_orders(premade_cake_variant_id);

-- 3) Row-level security. A variant is visible/writable to the same
--    workspace that owns its parent cake, mirroring the pattern used
--    for customer_sale_items in 2026-05-09_phase2_integrations.sql.
ALTER TABLE premade_cake_variants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'premade_cake_variants'
      AND policyname = 'pcv_owner_select'
  ) THEN
    CREATE POLICY pcv_owner_select
      ON premade_cake_variants FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM premade_cakes c
          WHERE c.id       = premade_cake_variants.cake_id
            AND c.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'premade_cake_variants'
      AND policyname = 'pcv_owner_insert'
  ) THEN
    CREATE POLICY pcv_owner_insert
      ON premade_cake_variants FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM premade_cakes c
          WHERE c.id       = premade_cake_variants.cake_id
            AND c.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'premade_cake_variants'
      AND policyname = 'pcv_owner_update'
  ) THEN
    CREATE POLICY pcv_owner_update
      ON premade_cake_variants FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM premade_cakes c
          WHERE c.id       = premade_cake_variants.cake_id
            AND c.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'premade_cake_variants'
      AND policyname = 'pcv_owner_delete'
  ) THEN
    CREATE POLICY pcv_owner_delete
      ON premade_cake_variants FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM premade_cakes c
          WHERE c.id       = premade_cake_variants.cake_id
            AND c.owner_id = auth.uid()
        )
      );
  END IF;
END
$$;
