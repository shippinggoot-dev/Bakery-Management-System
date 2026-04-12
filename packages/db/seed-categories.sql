-- Run this in the Supabase SQL Editor to replace the old recipe categories
-- with the new bakery-specific ones.
--
-- SAFE to run: uses ON CONFLICT DO NOTHING so it won't duplicate categories
-- that already exist, and won't touch any recipe data.

-- Remove old default categories (only if they have no recipes attached)
DELETE FROM recipe_categories
WHERE name IN ('Breads & Loaves', 'Pastries', 'Muffins & Quick Breads', 'Sweet Rolls', 'Cakes & Brownies')
  AND NOT EXISTS (
    SELECT 1 FROM recipes WHERE category_id = recipe_categories.id
  );

-- Insert new categories (skip if already present)
INSERT INTO recipe_categories (name, description) VALUES
  ('Sponges',   'Genoise, chiffon, joconde, and other sponge bases'),
  ('Fillings',  'Curds, compotes, pastry creams, and ganache fillings'),
  ('Frostings', 'Buttercreams, cream cheese frostings, and glazes'),
  ('Mousse',    'Chocolate, fruit, and bavarois mousse components'),
  ('Brownie',   'Dense, fudgy brownies and blondie bars'),
  ('Cookies',   'Drop cookies, shortbread, biscotti, and rolled cookies'),
  ('Cupcakes',  'Individual cupcakes and mini cakes'),
  ('Entremet',  'Multi-component mousse cakes and mirror-glaze entremets')
ON CONFLICT (name) DO NOTHING;
