-- =====================================================================
-- Per-user toggle for the Shopify tile on the dashboard.
--
-- When true (default), the Shopify activity card occupies the 4th slot
-- in the dashboard's Today row. When false, the Tomorrow preview takes
-- its place. Toggleable from /settings → workflow preferences.
--
-- Safe to re-run: IF NOT EXISTS guard.
-- =====================================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS dashboard_show_shopify_tile boolean NOT NULL DEFAULT true;
