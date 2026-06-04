-- =============================================================================
-- 2026-06-04 — shopify_ignored_products table
-- =============================================================================
--
-- Per-workspace list of Shopify line-item titles to permanently skip
-- during webhook + bulk import. Used for products that don't belong in
-- the bakery fulfillment queue (gift cards, deposits, merchandise, etc).
--
-- Idempotent: re-running on a database that already has the table is a
-- no-op, and adding/removing entries goes through the application.
-- =============================================================================

CREATE TABLE IF NOT EXISTS shopify_ignored_products (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid        NOT NULL,
  shopify_title text        NOT NULL,
  reason        text,
  created_at    timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_ignored_owner
  ON shopify_ignored_products (owner_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shopify_ignored_owner_title'
  ) THEN
    ALTER TABLE shopify_ignored_products
      ADD CONSTRAINT shopify_ignored_owner_title
      UNIQUE (owner_id, shopify_title);
  END IF;
END $$;

-- Owner-scoped RLS — same pattern as the rest of the per-tenant tables.
ALTER TABLE shopify_ignored_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shopify_ignored_products'
      AND policyname = 'owner_access'
  ) THEN
    CREATE POLICY owner_access ON shopify_ignored_products
      USING  (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

-- Cascade owner deletion to clean up the ignore list.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shopify_ignored_products_owner_id_fkey'
  ) THEN
    DELETE FROM shopify_ignored_products
      WHERE owner_id NOT IN (SELECT id FROM auth.users);
    ALTER TABLE shopify_ignored_products
      ADD CONSTRAINT shopify_ignored_products_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
