-- Run this in Supabase SQL Editor (Settings → SQL Editor → New query)

-- 1. cake_orders: new columns + make recipe_id nullable
ALTER TABLE cake_orders
  ADD COLUMN IF NOT EXISTS customer_email      text,
  ADD COLUMN IF NOT EXISTS payment_status      text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shopify_order_id    text,
  ADD COLUMN IF NOT EXISTS shopify_order_number text;

-- Drop NOT NULL from recipe_id so Shopify orders can arrive without a recipe match
ALTER TABLE cake_orders ALTER COLUMN recipe_id DROP NOT NULL;

-- Index for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_cake_orders_shopify_order_id ON cake_orders (shopify_order_id);

-- 2. shopify_settings: add webhook secret column
ALTER TABLE shopify_settings
  ADD COLUMN IF NOT EXISTS webhook_secret text;
