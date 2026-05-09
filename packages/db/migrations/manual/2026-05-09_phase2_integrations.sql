-- =====================================================================
-- Phase 2 integrations migration
--
-- Run this AFTER 2026-05-08_workflow_integrations.sql.
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- =====================================================================

-- 1) Cake orders link to a CRM customer (optional). Enables auto-awarding
--    loyalty points when an order is completed and a customer is on file.
ALTER TABLE cake_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid
  REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cake_orders_customer_id
  ON cake_orders(customer_id);

-- 2) Production schedules link back to the cake order they were auto-created
--    from. Used by the UI to show a "From order #X" badge.
ALTER TABLE production_schedules
  ADD COLUMN IF NOT EXISTS cake_order_id uuid
  REFERENCES cake_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_schedules_cake_order_id
  ON production_schedules(cake_order_id);

-- 3) Customer sale line items. Each line records what was sold; lines with a
--    recipe_id trigger FEFO stock deduction at sale time. Free-form lines
--    just record revenue without touching stock.
CREATE TABLE IF NOT EXISTS customer_sale_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid        NOT NULL REFERENCES customer_sales(id) ON DELETE CASCADE,
  description     text        NOT NULL,
  recipe_id       uuid        REFERENCES recipes(id)       ON DELETE SET NULL,
  premade_cake_id uuid        REFERENCES premade_cakes(id) ON DELETE SET NULL,
  quantity        text        NOT NULL DEFAULT '1',
  unit_price      text,
  line_total      text,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_sale_items_sale_id         ON customer_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_customer_sale_items_recipe_id       ON customer_sale_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_customer_sale_items_premade_cake_id ON customer_sale_items(premade_cake_id);

-- Row-level security: a sale item is visible/writable to the same workspace
-- that owns its parent sale.
ALTER TABLE customer_sale_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customer_sale_items'
      AND policyname = 'csi_owner_select'
  ) THEN
    CREATE POLICY csi_owner_select
      ON customer_sale_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM customer_sales s
          WHERE s.id = customer_sale_items.sale_id
            AND s.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customer_sale_items'
      AND policyname = 'csi_owner_insert'
  ) THEN
    CREATE POLICY csi_owner_insert
      ON customer_sale_items FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customer_sales s
          WHERE s.id = customer_sale_items.sale_id
            AND s.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customer_sale_items'
      AND policyname = 'csi_owner_update'
  ) THEN
    CREATE POLICY csi_owner_update
      ON customer_sale_items FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM customer_sales s
          WHERE s.id = customer_sale_items.sale_id
            AND s.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customer_sale_items'
      AND policyname = 'csi_owner_delete'
  ) THEN
    CREATE POLICY csi_owner_delete
      ON customer_sale_items FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM customer_sales s
          WHERE s.id = customer_sale_items.sale_id
            AND s.owner_id = auth.uid()
        )
      );
  END IF;
END
$$;
