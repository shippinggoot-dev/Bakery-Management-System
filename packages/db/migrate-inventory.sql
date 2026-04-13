-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory Management Tables
-- Run this migration in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── lots ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  lot_number     TEXT,
  quantity       TEXT NOT NULL,
  unit           TEXT NOT NULL,
  expiry_date    TEXT,          -- YYYY-MM-DD
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         TEXT NOT NULL DEFAULT 'available',  -- available|quarantine|consumed|expired|returned
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lots_ingredient_id ON lots(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_lots_supplier_id   ON lots(supplier_id);
CREATE INDEX IF NOT EXISTS idx_lots_status        ON lots(status);
CREATE INDEX IF NOT EXISTS idx_lots_expiry_date   ON lots(expiry_date);
CREATE INDEX IF NOT EXISTS idx_lots_received_at   ON lots(received_at);

-- Row Level Security
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

-- Lots are owned by whoever owns the ingredient.
-- Join via ingredients to check ownerId.
CREATE POLICY lots_owner ON lots
  USING (
    EXISTS (
      SELECT 1 FROM ingredients
      WHERE ingredients.id = lots.ingredient_id
        AND ingredients.owner_id = auth.uid()
    )
  );

-- ── production_batches ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL,
  recipe_id    UUID NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  scale_factor TEXT NOT NULL DEFAULT '1',
  yield_amount TEXT NOT NULL,
  yield_unit   TEXT NOT NULL,
  produced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_batches_owner_id    ON production_batches(owner_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_recipe_id   ON production_batches(recipe_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_produced_at ON production_batches(produced_at);

ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_batches_owner ON production_batches
  USING (owner_id = auth.uid());

-- ── waste_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waste_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  lot_id        UUID REFERENCES lots(id) ON DELETE SET NULL,
  quantity      TEXT NOT NULL,
  unit          TEXT NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'other',
  notes         TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_logs_owner_id      ON waste_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_ingredient_id ON waste_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_logged_at     ON waste_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_waste_logs_reason        ON waste_logs(reason);

ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY waste_logs_owner ON waste_logs
  USING (owner_id = auth.uid());

-- ── stock_movements ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  lot_id          UUID REFERENCES lots(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,   -- receive|produce|waste|adjust|recount
  quantity_delta  TEXT NOT NULL,   -- positive = in, negative = out
  stock_after     TEXT NOT NULL,
  unit            TEXT NOT NULL,
  reference_id    UUID,            -- FK to source record
  reference_type  TEXT,            -- production_batch|waste_log|purchase_order|manual
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_owner_id      ON stock_movements(owner_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient_id ON stock_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type          ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at    ON stock_movements(created_at);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_owner ON stock_movements
  USING (owner_id = auth.uid());

-- ── Add stock-tracking columns to ingredients (if not already present) ────────
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS current_stock  TEXT DEFAULT '0',
  ADD COLUMN IF NOT EXISTS par_level      TEXT,
  ADD COLUMN IF NOT EXISTS reorder_point  TEXT;

-- ── GRANT for authenticated role ──────────────────────────────────────────────
GRANT ALL ON lots              TO authenticated;
GRANT ALL ON production_batches TO authenticated;
GRANT ALL ON waste_logs         TO authenticated;
GRANT ALL ON stock_movements    TO authenticated;
