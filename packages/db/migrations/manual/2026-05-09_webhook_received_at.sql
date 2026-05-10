-- =====================================================================
-- Track the most recent Shopify webhook timestamp.
--
-- Used by the setup wizard's live "Test it" step: after the user pastes
-- their signing secret in Shopify and places a test order, the wizard
-- polls this column to confirm the webhook is actually being delivered.
--
-- Safe to re-run: IF NOT EXISTS guard.
-- =====================================================================

ALTER TABLE shopify_settings
  ADD COLUMN IF NOT EXISTS last_webhook_received_at timestamp;
