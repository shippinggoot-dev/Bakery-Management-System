-- Nutrition columns for ingredients (per 100 g of the ingredient)
-- Run this in your Supabase SQL editor

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS calories_kcal  text,
  ADD COLUMN IF NOT EXISTS protein_g      text,
  ADD COLUMN IF NOT EXISTS fat_total_g    text,
  ADD COLUMN IF NOT EXISTS fat_saturated_g text,
  ADD COLUMN IF NOT EXISTS carbs_total_g  text,
  ADD COLUMN IF NOT EXISTS carbs_sugars_g text,
  ADD COLUMN IF NOT EXISTS fiber_g        text,
  ADD COLUMN IF NOT EXISTS sodium_mg      text,
  ADD COLUMN IF NOT EXISTS grams_per_unit text;
