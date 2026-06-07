-- =====================================================================
-- Drop the legacy premade_cake_sizes table.
--
-- Superseded by premade_cake_variants (added in 2026-06-06_phase2_variants.sql)
-- which carries per-variant price, Shopify variant ID, and the
-- size / occasion axes that premade_cake_sizes only modelled descriptively.
--
-- Pre-flight check — confirm the table is empty before running the drop:
--
--   SELECT COUNT(*) FROM premade_cake_sizes;
--
-- If that returns 0, run the rest of this file. If non-zero, STOP and
-- migrate the rows into premade_cake_variants manually first.
--
-- This is destructive and irreversible.
-- =====================================================================

DROP TABLE IF EXISTS premade_cake_sizes;
