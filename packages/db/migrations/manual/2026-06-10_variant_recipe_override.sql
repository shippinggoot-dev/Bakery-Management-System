-- =====================================================================
-- Phase 2 follow-up — per-variant recipe override
--
-- Reverses the decision in docs/phase2-variants.md §6 item 1
-- ("shared recipe per cake") for Sucre's actual catalog. Distinct
-- flavours on the same premade cake (Cookies & Cream, Midnight Cherry,
-- Citrus Dream, …) bake from genuinely different sponge recipes, not
-- from one base recipe + addons. Adding a nullable per-variant recipe
-- FK lets variants override the parent cake's recipeId; null means
-- "inherit from parent cake" (existing behaviour).
--
-- Additive only, idempotent, no data migration needed.
-- =====================================================================

ALTER TABLE premade_cake_variants
  ADD COLUMN IF NOT EXISTS recipe_id uuid
    REFERENCES recipes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_premade_cake_variants_recipe_id
  ON premade_cake_variants(recipe_id);
