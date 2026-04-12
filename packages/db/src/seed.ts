import "dotenv/config";
import { db } from "./client";
import {
  allergens,
  ingredientCategories,
  ingredients,
  ingredientAllergens,
  ingredientSuppliers,
  suppliers,
  supplierPrices,
  priceHistory,
  lots,
  recipeCategories,
  recipes,
  recipeIngredients,
  purchaseOrders,
  purchaseOrderItems,
  shoppingLists,
  shoppingListItems,
} from "./schema";

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ─── 1. Clear existing data (leaf → root) ───────────────────────────────
  console.log("  Clearing existing data...");
  await db.delete(shoppingListItems);
  await db.delete(shoppingLists);
  await db.delete(purchaseOrderItems);
  await db.delete(purchaseOrders);
  await db.delete(recipeIngredients);
  await db.delete(recipes);
  await db.delete(supplierPrices);
  await db.delete(priceHistory);
  await db.delete(lots);
  await db.delete(ingredientSuppliers);
  await db.delete(ingredientAllergens);
  await db.delete(ingredients);
  await db.delete(allergens);
  await db.delete(ingredientCategories);
  await db.delete(recipeCategories);
  await db.delete(suppliers);

  // ─── 2. Allergens ────────────────────────────────────────────────────────
  console.log("  Inserting allergens...");
  // All 14 EU mandatory allergens (EU Regulation 1169/2011), required in Norway
  const [
    gluten,
    crustaceans,
    eggs,
    fish,
    peanuts,
    soy,
    milk,
    treeNuts,
    celery,
    mustard,
    sesame,
    sulphites,
    lupin,
    molluscs,
  ] = await db
    .insert(allergens)
    .values([
      { name: "Gluten", description: "Cereals containing gluten: wheat, rye, barley, oats, spelt, and kamut" },
      { name: "Crustaceans", description: "Crab, lobster, shrimp, prawns, and crayfish" },
      { name: "Eggs", description: "Hen eggs and all egg-derived products" },
      { name: "Fish", description: "All fish species and fish-derived products" },
      { name: "Peanuts", description: "Peanuts (groundnuts) and peanut-derived products" },
      { name: "Soybeans", description: "Soya beans and all soy-derived products including soy lecithin" },
      { name: "Milk", description: "Dairy milk including butter, cream, cheese, yoghurt, and lactose" },
      { name: "Tree Nuts", description: "Almonds, hazelnuts, walnuts, cashews, pecans, Brazil nuts, pistachios, macadamia" },
      { name: "Celery", description: "Celery stalks, leaves, seeds, and celeriac" },
      { name: "Mustard", description: "Mustard seeds, leaves, oil, and mustard-containing products" },
      { name: "Sesame", description: "Sesame seeds, sesame oil, and tahini" },
      { name: "Sulphites", description: "Sulphur dioxide and sulphites at concentrations above 10 mg/kg or 10 mg/L" },
      { name: "Lupin", description: "Lupin seeds and lupin flour, used in some gluten-free and specialty baking" },
      { name: "Molluscs", description: "Clams, mussels, oysters, squid, and octopus" },
    ])
    .returning();

  // ─── 3. Ingredient Categories ────────────────────────────────────────────
  console.log("  Inserting ingredient categories...");
  const [
    catFlours,
    catDairy,
    catSweeteners,
    catFats,
    catLeavening,
    catFlavourings,
    catFruits,
    catChocolate,
    catSpices,
  ] = await db
    .insert(ingredientCategories)
    .values([
      { name: "Flours & Grains", description: "Wheat flours, alternative grains, and starches" },
      { name: "Dairy & Eggs", description: "Milk, cream, butter, yoghurt, and eggs" },
      { name: "Sweeteners", description: "Sugars, syrups, and natural sweeteners" },
      { name: "Fats & Oils", description: "Butter, vegetable oils, and shortenings" },
      { name: "Leavening Agents", description: "Yeasts, baking powders, and starters" },
      { name: "Flavourings & Extracts", description: "Vanilla, citrus zest, and other flavour enhancers" },
      { name: "Fruits & Berries", description: "Fresh, dried, and frozen fruit" },
      { name: "Chocolate & Cocoa", description: "Dark, milk, and white chocolate; cocoa powders" },
      { name: "Spices & Seasonings", description: "Cinnamon, salt, cardamom, and other spices" },
    ])
    .returning();

  // ─── 4. Recipe Categories ────────────────────────────────────────────────
  console.log("  Inserting recipe categories...");
  const insertedCats = await db
    .insert(recipeCategories)
    .values([
      { name: "Sponges",   description: "Genoise, chiffon, joconde, and other sponge bases" },
      { name: "Fillings",  description: "Curds, compotes, pastry creams, and ganache fillings" },
      { name: "Frostings", description: "Buttercreams, cream cheese frostings, and glazes" },
      { name: "Mousse",    description: "Chocolate, fruit, and bavarois mousse components" },
      { name: "Brownie",   description: "Dense, fudgy brownies and blondie bars" },
      { name: "Cookies",   description: "Drop cookies, shortbread, biscotti, and rolled cookies" },
      { name: "Cupcakes",  description: "Individual cupcakes and mini cakes" },
      { name: "Entremet",  description: "Multi-component mousse cakes and mirror-glaze entremets" },
    ])
    .returning();
  const catBrownie = insertedCats.find((c) => c.name === "Brownie");

  // ─── 5. Suppliers ────────────────────────────────────────────────────────
  // Local Bergen/Fana stores are imported from Kassal.app via the UI.

  // ─── 6. Ingredients ──────────────────────────────────────────────────────
  console.log("  Inserting ingredients...");
  const [
    ingBreadFlour,
    ingAllPurposeFlour,
    ingWater,
    ingSalt,
    ingButter,
    ingMilk,
    ingEggs,
    ingGranSugar,
    ingBrownSugar,
    ingPowdSugar,
    ingYeast,
    ingBakingPowder,
    ingVanilla,
    ingLemonZest,
    ingBlueberries,
    ingCinnamon,
    ingCreamCheese,
    ingDarkChoc,
    ingCocoaPowder,
    ingSourdoughStarter,
  ] = await db
    .insert(ingredients)
    .values([
      { name: "Bread Flour", unit: "g", categoryId: catFlours!.id, notes: "Strong white bread flour, 12–14% protein" },
      { name: "All-Purpose Flour", unit: "g", categoryId: catFlours!.id, notes: "Plain flour, 10–12% protein" },
      { name: "Water", unit: "ml", categoryId: null, notes: "Filtered or room-temperature tap water" },
      { name: "Salt", unit: "g", categoryId: catSpices!.id, notes: "Fine sea salt" },
      { name: "Butter", unit: "g", categoryId: catFats!.id, notes: "Unsalted, 82% fat European-style" },
      { name: "Milk", unit: "ml", categoryId: catDairy!.id, notes: "Whole milk (3.5% fat)" },
      { name: "Eggs", unit: "piece", categoryId: catDairy!.id, notes: "Large free-range eggs (~60g each)" },
      { name: "Granulated Sugar", unit: "g", categoryId: catSweeteners!.id },
      { name: "Brown Sugar", unit: "g", categoryId: catSweeteners!.id, notes: "Soft light brown sugar" },
      { name: "Powdered Sugar", unit: "g", categoryId: catSweeteners!.id, notes: "Icing sugar, finely milled" },
      { name: "Instant Yeast", unit: "g", categoryId: catLeavening!.id, notes: "Fast-action dried yeast" },
      { name: "Baking Powder", unit: "g", categoryId: catLeavening!.id, notes: "Double-acting baking powder" },
      { name: "Vanilla Extract", unit: "ml", categoryId: catFlavourings!.id, notes: "Pure vanilla extract, not imitation" },
      { name: "Lemon Zest", unit: "piece", categoryId: catFlavourings!.id, notes: "Zest of 1 unwaxed lemon" },
      { name: "Blueberries", unit: "g", categoryId: catFruits!.id, notes: "Fresh or frozen" },
      { name: "Cinnamon", unit: "g", categoryId: catSpices!.id, notes: "Ground Ceylon cinnamon" },
      { name: "Cream Cheese", unit: "g", categoryId: catDairy!.id, notes: "Full-fat cream cheese, room temperature" },
      { name: "Dark Chocolate", unit: "g", categoryId: catChocolate!.id, notes: "70% cocoa solids, chopped" },
      { name: "Cocoa Powder", unit: "g", categoryId: catChocolate!.id, notes: "Dutch-process unsweetened cocoa" },
      { name: "Sourdough Starter", unit: "g", categoryId: catLeavening!.id, notes: "Active, 100% hydration starter; fed 4–8h before use" },
    ])
    .returning();

  // ─── 7. Ingredient → Allergen mappings ──────────────────────────────────
  console.log("  Inserting ingredient-allergen links...");
  await db.insert(ingredientAllergens).values([
    // Gluten-containing
    { ingredientId: ingBreadFlour!.id, allergenId: gluten!.id },
    { ingredientId: ingAllPurposeFlour!.id, allergenId: gluten!.id },
    { ingredientId: ingSourdoughStarter!.id, allergenId: gluten!.id },
    // Milk-containing
    { ingredientId: ingButter!.id, allergenId: milk!.id },
    { ingredientId: ingMilk!.id, allergenId: milk!.id },
    { ingredientId: ingCreamCheese!.id, allergenId: milk!.id },
    // Egg-containing
    { ingredientId: ingEggs!.id, allergenId: eggs!.id },
    // Chocolate (may contain milk & soy — typical for dark choc)
    { ingredientId: ingDarkChoc!.id, allergenId: milk!.id },
    { ingredientId: ingDarkChoc!.id, allergenId: soy!.id },
  ]);

  // ─── 8. Supplier Prices ──────────────────────────────────────────────────
  // Prices are populated automatically via the Kassal.app price sync.

  // ─── 9. Recipes ──────────────────────────────────────────────────────────
  console.log("  Inserting recipes...\n");

  // ── Recipe 1: Classic Sourdough Bread ──────────────────────────────────
  const [sourdough] = await db
    .insert(recipes)
    .values({
      name: "Classic Sourdough Bread",
      description: "A rustic, open-crumb sourdough with a crisp blistered crust. Uses only flour, water, salt, and a live starter.",
      categoryId: null,
      yieldAmount: "1",
      yieldUnit: "loaf (approx. 900g baked)",
      prepTimeMinutes: 30,
      bakeTimeMinutes: 45,
      instructions: `1. AUTOLYSE: Mix bread flour and 325ml of the water. Rest 1 hour.
2. ADD STARTER & SALT: Add active starter and salt dissolved in remaining 50ml water. Incorporate fully.
3. BULK FERMENT: Perform 4 sets of stretch-and-folds, 30 min apart. Then ferment at room temperature for 8–12 hours until 50–75% volume increase.
4. SHAPE: Turn dough onto an unfloured surface. Pre-shape into a round, rest 20 min. Final shape and place seam-side up in a floured banneton.
5. COLD PROOF: Cover and refrigerate 8–16 hours.
6. BAKE: Preheat oven to 250°C (480°F) with a Dutch oven inside for 45 min. Score the dough, bake covered 20 min, then uncovered 20–25 min until deep mahogany.
7. Cool on a wire rack for at least 1 hour before slicing.`,
      notes: "Hydration: 75%. For best results use a digital scale and maintain a consistent ambient temperature of 22–24°C during bulk fermentation.",
      isActive: true,
    })
    .returning();

  await db.insert(recipeIngredients).values([
    { recipeId: sourdough!.id, ingredientId: ingBreadFlour!.id, quantity: "500", unit: "g", sortOrder: 1 },
    { recipeId: sourdough!.id, ingredientId: ingWater!.id, quantity: "375", unit: "ml", sortOrder: 2 },
    { recipeId: sourdough!.id, ingredientId: ingSourdoughStarter!.id, quantity: "100", unit: "g", sortOrder: 3 },
    { recipeId: sourdough!.id, ingredientId: ingSalt!.id, quantity: "10", unit: "g", sortOrder: 4 },
  ]);
  console.log("    ✔ Classic Sourdough Bread");

  // ── Recipe 2: Butter Croissants ──────────────────────────────────────
  const [croissants] = await db
    .insert(recipes)
    .values({
      name: "Butter Croissants",
      description: "Flaky, golden laminated croissants with 27 layers of butter. Takes 2 days but worth every minute.",
      categoryId: null,
      yieldAmount: "12",
      yieldUnit: "croissants",
      prepTimeMinutes: 180,
      bakeTimeMinutes: 18,
      instructions: `DAY 1 – DÉTREMPE:
1. Warm milk to 35°C, dissolve yeast and 1 tsp of the sugar. Rest 10 min until frothy.
2. Combine flour, remaining sugar, and salt. Add yeast mixture and 30g softened butter. Knead 5 min until smooth (do not overdevelop).
3. Flatten into a rectangle, wrap, and refrigerate overnight.

DAY 2 – LAMINATION:
4. BEURRAGE: Beat cold butter into a 19cm square between two sheets of parchment. Refrigerate 10 min.
5. Roll détrempe to 40×20cm. Enclose butter block in dough with a letter fold. Seal edges.
6. TURNS: Roll to 60×20cm, fold in thirds (1st turn). Rotate 90°, repeat (2nd turn). Wrap and rest 30 min in fridge. Repeat for 3rd and 4th turns (total 4 turns = 81 layers).
7. Roll dough to 4mm thickness. Cut into 10×20cm triangles. Roll tightly from base to tip.
8. PROOF: Place on lined baking sheets, cover loosely. Proof at room temperature 2–3 hours until puffy and jiggly.
9. BAKE: Brush gently with egg wash. Bake at 200°C (fan 180°C) for 16–18 min until deep amber.`,
      notes: "Use 84%+ fat European-style butter for best lamination. Dough must be cold at all times when laminating.",
      isActive: true,
    })
    .returning();

  await db.insert(recipeIngredients).values([
    { recipeId: croissants!.id, ingredientId: ingAllPurposeFlour!.id, quantity: "500", unit: "g", sortOrder: 1 },
    { recipeId: croissants!.id, ingredientId: ingMilk!.id, quantity: "300", unit: "ml", sortOrder: 2, notes: "Warmed to 35°C" },
    { recipeId: croissants!.id, ingredientId: ingButter!.id, quantity: "30", unit: "g", sortOrder: 3, notes: "Softened, for the dough" },
    { recipeId: croissants!.id, ingredientId: ingButter!.id, quantity: "280", unit: "g", sortOrder: 4, notes: "Cold, for lamination (beurrage)" },
    { recipeId: croissants!.id, ingredientId: ingGranSugar!.id, quantity: "50", unit: "g", sortOrder: 5 },
    { recipeId: croissants!.id, ingredientId: ingSalt!.id, quantity: "10", unit: "g", sortOrder: 6 },
    { recipeId: croissants!.id, ingredientId: ingYeast!.id, quantity: "7", unit: "g", sortOrder: 7 },
    { recipeId: croissants!.id, ingredientId: ingEggs!.id, quantity: "1", unit: "piece", sortOrder: 8, notes: "Beaten, for egg wash" },
  ]);
  console.log("    ✔ Butter Croissants");

  // ── Recipe 3: Blueberry Lemon Muffins ─────────────────────────────────
  const [muffins] = await db
    .insert(recipes)
    .values({
      name: "Blueberry Lemon Muffins",
      description: "Tender, bakery-style muffins bursting with juicy blueberries and bright lemon zest. Ready in under 40 minutes.",
      categoryId: null,
      yieldAmount: "12",
      yieldUnit: "standard muffins",
      prepTimeMinutes: 15,
      bakeTimeMinutes: 22,
      instructions: `1. Preheat oven to 200°C (fan 180°C). Line a 12-hole muffin tin with paper cases.
2. DRY: Whisk together flour, baking powder, and salt in a large bowl.
3. WET: In a separate bowl, melt butter and whisk with sugar until combined. Add eggs one at a time, then milk and vanilla. Stir in lemon zest.
4. COMBINE: Pour wet ingredients into dry. Fold with a spatula until just combined — a few lumps are fine; do not overmix.
5. FOLD IN BERRIES: Gently fold in blueberries (toss frozen berries in 1 tbsp flour first to prevent sinking).
6. FILL & BAKE: Divide batter evenly between cases, filling to the brim. Bake 20–22 min until a skewer comes out clean and tops are golden.
7. Cool in tin 5 min, then transfer to a wire rack.`,
      notes: "For domed tops: start at 220°C for 5 min, then reduce to 180°C for the remainder. Do not open the oven during baking.",
      isActive: true,
    })
    .returning();

  await db.insert(recipeIngredients).values([
    { recipeId: muffins!.id, ingredientId: ingAllPurposeFlour!.id, quantity: "250", unit: "g", sortOrder: 1 },
    { recipeId: muffins!.id, ingredientId: ingGranSugar!.id, quantity: "150", unit: "g", sortOrder: 2 },
    { recipeId: muffins!.id, ingredientId: ingBakingPowder!.id, quantity: "10", unit: "g", sortOrder: 3 },
    { recipeId: muffins!.id, ingredientId: ingSalt!.id, quantity: "5", unit: "g", sortOrder: 4 },
    { recipeId: muffins!.id, ingredientId: ingButter!.id, quantity: "115", unit: "g", sortOrder: 5, notes: "Melted and cooled" },
    { recipeId: muffins!.id, ingredientId: ingEggs!.id, quantity: "2", unit: "piece", sortOrder: 6 },
    { recipeId: muffins!.id, ingredientId: ingMilk!.id, quantity: "120", unit: "ml", sortOrder: 7 },
    { recipeId: muffins!.id, ingredientId: ingLemonZest!.id, quantity: "1", unit: "piece", sortOrder: 8 },
    { recipeId: muffins!.id, ingredientId: ingBlueberries!.id, quantity: "200", unit: "g", sortOrder: 9 },
    { recipeId: muffins!.id, ingredientId: ingVanilla!.id, quantity: "5", unit: "ml", sortOrder: 10 },
  ]);
  console.log("    ✔ Blueberry Lemon Muffins");

  // ── Recipe 4: Cinnamon Rolls with Cream Cheese Frosting ──────────────
  const [cinnamonRolls] = await db
    .insert(recipes)
    .values({
      name: "Cinnamon Rolls with Cream Cheese Frosting",
      description: "Pillowy soft rolls swirled with brown sugar and cinnamon, topped with a tangy cream cheese frosting. Bakery's best-seller.",
      categoryId: null,
      yieldAmount: "12",
      yieldUnit: "large rolls",
      prepTimeMinutes: 120,
      bakeTimeMinutes: 25,
      instructions: `DOUGH:
1. Warm milk to 40°C. Combine with yeast and 1 tsp sugar; rest 10 min until foamy.
2. Mix flour, remaining sugar, and salt. Add yeast mixture, eggs, and softened butter. Knead 8–10 min until smooth and elastic.
3. FIRST RISE: Cover and rise in a warm spot 1–1.5 hours until doubled.

FILLING & SHAPING:
4. Mix brown sugar and cinnamon together.
5. Roll dough to a 45×35cm rectangle. Spread 60g melted butter over the surface, then scatter the cinnamon sugar evenly.
6. Roll tightly from the long edge into a log. Cut into 12 equal pieces with a sharp knife or dental floss.
7. SECOND RISE: Arrange rolls in a greased 23×33cm tin. Cover and rise 45–60 min until puffed and touching.

BAKE & FROST:
8. Bake at 180°C for 23–25 min until light golden (do not overbake — the tops should be pale).
9. FROSTING: Beat cream cheese until smooth. Add powdered sugar, vanilla, and a pinch of salt; beat until silky.
10. Frost rolls immediately while still warm so the frosting melts into every crevice.`,
      notes: "For overnight rolls: after shaping, refrigerate covered overnight. Bring to room temperature 1 hour before baking.",
      isActive: true,
    })
    .returning();

  await db.insert(recipeIngredients).values([
    { recipeId: cinnamonRolls!.id, ingredientId: ingAllPurposeFlour!.id, quantity: "600", unit: "g", sortOrder: 1 },
    { recipeId: cinnamonRolls!.id, ingredientId: ingMilk!.id, quantity: "240", unit: "ml", sortOrder: 2, notes: "Warmed to 40°C" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingGranSugar!.id, quantity: "100", unit: "g", sortOrder: 3 },
    { recipeId: cinnamonRolls!.id, ingredientId: ingButter!.id, quantity: "85", unit: "g", sortOrder: 4, notes: "Softened, for the dough" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingEggs!.id, quantity: "2", unit: "piece", sortOrder: 5 },
    { recipeId: cinnamonRolls!.id, ingredientId: ingYeast!.id, quantity: "7", unit: "g", sortOrder: 6 },
    { recipeId: cinnamonRolls!.id, ingredientId: ingSalt!.id, quantity: "5", unit: "g", sortOrder: 7 },
    { recipeId: cinnamonRolls!.id, ingredientId: ingBrownSugar!.id, quantity: "200", unit: "g", sortOrder: 8, notes: "For the filling" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingCinnamon!.id, quantity: "15", unit: "g", sortOrder: 9, notes: "For the filling" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingButter!.id, quantity: "60", unit: "g", sortOrder: 10, notes: "Melted, for the filling" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingCreamCheese!.id, quantity: "115", unit: "g", sortOrder: 11, notes: "Room temperature, for frosting" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingPowdSugar!.id, quantity: "250", unit: "g", sortOrder: 12, notes: "For frosting" },
    { recipeId: cinnamonRolls!.id, ingredientId: ingVanilla!.id, quantity: "5", unit: "ml", sortOrder: 13, notes: "For frosting" },
  ]);
  console.log("    ✔ Cinnamon Rolls with Cream Cheese Frosting");

  // ── Recipe 5: Dark Chocolate Brownies ────────────────────────────────
  const [brownies] = await db
    .insert(recipes)
    .values({
      name: "Dark Chocolate Brownies",
      description: "Dense, fudgy brownies with a crackly top made from 70% dark chocolate. No mixer required.",
      categoryId: catBrownie?.id ?? null,
      yieldAmount: "16",
      yieldUnit: "pieces (20×20cm tin)",
      prepTimeMinutes: 20,
      bakeTimeMinutes: 30,
      instructions: `1. Preheat oven to 175°C (fan 155°C). Grease and line a 20×20cm tin with parchment, leaving an overhang.
2. MELT: Combine dark chocolate and butter in a heatproof bowl. Melt over a bain-marie (or in microwave in 30-second bursts), stirring until smooth. Cool to room temperature.
3. WHIP EGGS & SUGAR: Using a whisk or hand mixer, beat eggs and sugar vigorously for 3–4 min until pale, thick, and ribbon-like. This creates the crackly top.
4. COMBINE: Fold the cooled chocolate mixture into the egg mixture until fully incorporated.
5. DRY INGREDIENTS: Sift in flour, cocoa powder, and salt. Fold gently until just combined.
6. Add vanilla and fold once more.
7. BAKE: Pour into prepared tin and smooth the top. Bake 28–30 min — the centre should still have a slight wobble; a skewer will come out with moist crumbs.
8. Cool completely in the tin (at least 1 hour) before lifting out and cutting into 16 squares.`,
      notes: "For extra fudgy results, refrigerate overnight and slice cold. Use good-quality 70%+ chocolate — it makes a significant difference.",
      isActive: true,
    })
    .returning();

  await db.insert(recipeIngredients).values([
    { recipeId: brownies!.id, ingredientId: ingDarkChoc!.id, quantity: "200", unit: "g", sortOrder: 1, notes: "70% cocoa, chopped" },
    { recipeId: brownies!.id, ingredientId: ingButter!.id, quantity: "115", unit: "g", sortOrder: 2 },
    { recipeId: brownies!.id, ingredientId: ingGranSugar!.id, quantity: "300", unit: "g", sortOrder: 3 },
    { recipeId: brownies!.id, ingredientId: ingEggs!.id, quantity: "3", unit: "piece", sortOrder: 4, notes: "Room temperature" },
    { recipeId: brownies!.id, ingredientId: ingAllPurposeFlour!.id, quantity: "120", unit: "g", sortOrder: 5 },
    { recipeId: brownies!.id, ingredientId: ingCocoaPowder!.id, quantity: "30", unit: "g", sortOrder: 6 },
    { recipeId: brownies!.id, ingredientId: ingSalt!.id, quantity: "5", unit: "g", sortOrder: 7 },
    { recipeId: brownies!.id, ingredientId: ingVanilla!.id, quantity: "5", unit: "ml", sortOrder: 8 },
  ]);
  console.log("    ✔ Dark Chocolate Brownies");

  // ─── 10. Sample Purchase Order ───────────────────────────────────────────
  // (Removed — purchase orders will be created against imported local stores.)

  // ─── 11. Sample Shopping List ────────────────────────────────────────────
  console.log("  Inserting sample shopping list...");
  const [list1] = await db
    .insert(shoppingLists)
    .values({
      name: "Weekly Bake Prep – Week 15",
      description: "Ingredients needed to produce: 2× Sourdough loaves + 16 Dark Chocolate Brownies",
      status: "draft",
      dueDate: "2024-04-13",
      notes: "Check stock levels before ordering.",
    })
    .returning();

  await db.insert(shoppingListItems).values([
    {
      shoppingListId: list1!.id,
      ingredientId: ingBreadFlour!.id,
      quantityNeeded: "1000",
      unit: "g",
      quantityOnHand: "200",
      quantityToPurchase: "800",
      isPurchased: false,
    },
    {
      shoppingListId: list1!.id,
      ingredientId: ingSourdoughStarter!.id,
      quantityNeeded: "200",
      unit: "g",
      quantityOnHand: "100",
      quantityToPurchase: "100",
      isPurchased: false,
    },
    {
      shoppingListId: list1!.id,
      ingredientId: ingDarkChoc!.id,
      quantityNeeded: "200",
      unit: "g",
      quantityOnHand: "0",
      quantityToPurchase: "200",
      isPurchased: false,
    },
    {
      shoppingListId: list1!.id,
      ingredientId: ingButter!.id,
      quantityNeeded: "115",
      unit: "g",
      quantityOnHand: "50",
      quantityToPurchase: "65",
      isPurchased: false,
    },
    {
      shoppingListId: list1!.id,
      ingredientId: ingGranSugar!.id,
      quantityNeeded: "300",
      unit: "g",
      quantityOnHand: "150",
      quantityToPurchase: "150",
      isPurchased: false,
    },
    {
      shoppingListId: list1!.id,
      ingredientId: ingEggs!.id,
      quantityNeeded: "3",
      unit: "piece",
      quantityOnHand: "6",
      quantityToPurchase: "0",
      isPurchased: false,
      notes: "Already in stock",
    },
  ]);

  // ─── 12. Wholesale Suppliers + ingredient_suppliers + price history ─────────
  console.log("  Inserting wholesale suppliers + 6-month price history...");

  const [ws1, ws2] = await db
    .insert(suppliers)
    .values([
      {
        name: "Bergen Grossist AS",
        contactName: "Håkon Moen",
        email: "ordre@bergengrossist.no",
        phone: "+47 55 20 10 00",
        address: "Nygårdsgaten 112, 5008 Bergen",
        leadTimeDays: 2,
        paymentTerms: "Net 30",
        notes: "Primary wholesale supplier. Delivery Tue/Thu. Min order 500 NOK.",
        isActive: true,
      },
      {
        name: "Norsk Mel & Bakst",
        contactName: "Silje Eriksen",
        email: "salg@norskmel.no",
        phone: "+47 55 31 44 00",
        address: "Industrivegen 8, 5353 Straume",
        leadTimeDays: 3,
        paymentTerms: "Net 15",
        notes: "Specialist flour and baking supply. Best prices on bread flours.",
        isActive: true,
      },
    ])
    .returning();

  // 5 ingredients we want to track wholesale prices for
  const trackedIngredients = [ingBreadFlour!, ingButter!, ingEggs!, ingGranSugar!, ingDarkChoc!];
  const trackedSuppliers   = [ws1!, ws2!];

  // Build ingredient_suppliers rows (2 per ingredient)
  const isRows = [];
  for (const ing of trackedIngredients) {
    for (const [si, sup] of trackedSuppliers.entries()) {
      isRows.push({
        ingredientId: ing.id,
        supplierId:   sup.id,
        isPreferred:  si === 0,          // Bergen Grossist is preferred
        sku:          `${sup.name.substring(0, 3).toUpperCase()}-${ing.name.substring(0, 4).toUpperCase().replace(/\s/g, "")}`,
        moq:          si === 0 ? "5000" : "2000",  // g / pieces
      });
    }
  }
  const insertedIS = await db.insert(ingredientSuppliers).values(isRows).returning();

  // ── 6 months of monthly price history (Oct 2025 → Mar 2026) ──────────────
  // Base wholesale prices per kg/piece in NOK, with slight month-on-month drift
  const basePrices: Record<string, [number, number]> = {
    // [Bergen Grossist price/unit, Norsk Mel price/unit]
    "Bread Flour":       [8.50,  7.80],
    "Butter":           [130.00, 138.00],
    "Eggs":               [3.80,   4.10],
    "Granulated Sugar":  [11.20,  12.00],
    "Dark Chocolate":    [92.00,  88.00],
  };

  // Monthly price drift (multiplier per month, simulates real market movement)
  const monthlyDrift = [1.000, 1.012, 0.998, 1.021, 1.008, 0.995];
  const months = [
    new Date("2025-10-15"),
    new Date("2025-11-15"),
    new Date("2025-12-15"),
    new Date("2026-01-15"),
    new Date("2026-02-15"),
    new Date("2026-03-15"),
  ];
  const sources: Array<"manual" | "csv" | "api"> = ["api", "api", "manual", "api", "csv", "api"];

  const phRows = [];
  for (const isRow of insertedIS) {
    const ing  = trackedIngredients.find((i) => i.id === isRow.ingredientId)!;
    const supIdx = trackedSuppliers.findIndex((s) => s.id === isRow.supplierId);
    const base = basePrices[ing.name]?.[supIdx] ?? 10;
    let price = base;
    for (let m = 0; m < 6; m++) {
      price = price * monthlyDrift[m]!;
      phRows.push({
        ingredientSupplierId: isRow.id,
        pricePerUnit: price.toFixed(4),
        currency: "NOK",
        recordedAt: months[m]!,
        source: sources[m]!,
      });
    }
  }
  await db.insert(priceHistory).values(phRows);

  // ─── 13. Sample lots ────────────────────────────────────────────────────────
  console.log("  Inserting sample lots...");
  await db.insert(lots).values([
    {
      ingredientId: ingBreadFlour!.id,
      supplierId:   ws1!.id,
      lotNumber:    "BG-2026-0312",
      quantity:     "25000",
      unit:         "g",
      expiryDate:   "2026-12-31",
      receivedAt:   new Date("2026-03-12"),
      status:       "available",
      notes:        "25 kg bag, strong white bread flour",
    },
    {
      ingredientId: ingButter!.id,
      supplierId:   ws1!.id,
      lotNumber:    "BG-2026-0318",
      quantity:     "10000",
      unit:         "g",
      expiryDate:   "2026-05-01",
      receivedAt:   new Date("2026-03-18"),
      status:       "available",
    },
    {
      ingredientId: ingEggs!.id,
      supplierId:   ws2!.id,
      lotNumber:    "NM-2026-0320",
      quantity:     "180",
      unit:         "piece",
      expiryDate:   "2026-04-20",
      receivedAt:   new Date("2026-03-20"),
      status:       "available",
      notes:        "15 dozen free-range",
    },
    {
      ingredientId: ingDarkChoc!.id,
      supplierId:   ws2!.id,
      lotNumber:    "NM-2025-1205",
      quantity:     "5000",
      unit:         "g",
      expiryDate:   "2027-06-30",
      receivedAt:   new Date("2025-12-05"),
      status:       "available",
    },
  ]);

  console.log("\n✅ Seeding complete!");
  console.log("   Allergens:         14");
  console.log("   Ingredient cats:    9");
  console.log("   Recipe cats:        5");
  console.log("   Suppliers:          5  (3 Kassal.app placeholder + 2 wholesale)");
  console.log("   Ingredients:       20");
  console.log("   Allergen links:     9");
  console.log("   Supplier prices:   11  (Kassal.app-linked)");
  console.log("   Ingredient suppl.: 10  (5 ingredients × 2 wholesale suppliers)");
  console.log("   Price history:     60  (10 pairs × 6 months)");
  console.log("   Lots:               4");
  console.log("   Recipes:            5");
  console.log("   Purchase orders:    1  (+ 2 line items)");
  console.log("   Shopping lists:     1  (+ 6 line items)");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
