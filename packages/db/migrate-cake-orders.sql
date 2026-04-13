-- Incoming customer cake orders → used to auto-generate shopping lists
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS cake_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL,
  customer_name text,
  recipe_id     uuid NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  quantity      text NOT NULL DEFAULT '1',
  due_date      text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','planned','in_progress','completed','cancelled')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cake_orders_owner_id ON cake_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_cake_orders_due_date  ON cake_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_cake_orders_status    ON cake_orders(status);

-- RLS
ALTER TABLE cake_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON cake_orders
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
