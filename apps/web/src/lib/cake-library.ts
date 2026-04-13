export type Category = "cake" | "pastry" | "bread" | "cookie" | "dessert";

export interface LibraryItem {
  id: string;
  name: string;
  category: Category;
  description: string;
  /** Typical single serving in grams */
  servingSizeG: number;
  allergens: string[];
  /** All values per 100 g of finished product */
  per100g: {
    calories: number;
    fat: number;
    saturates: number;
    carbs: number;
    sugars: number;
    fibre: number;
    protein: number;
    salt: number;
  };
}

export const LIBRARY: LibraryItem[] = [
  // ── Cakes ──────────────────────────────────────────────────────────────────
  {
    id: "chocolate-layer-cake",
    name: "Chocolate Layer Cake",
    category: "cake",
    description: "Classic layered sponge filled and covered with dark chocolate ganache buttercream.",
    servingSizeG: 110,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 380, fat: 17, saturates: 8, carbs: 53, sugars: 38, fibre: 2, protein: 5, salt: 0.4 },
  },
  {
    id: "vanilla-sponge",
    name: "Vanilla Sponge Cake",
    category: "cake",
    description: "Light Victoria sponge with vanilla buttercream and raspberry jam.",
    servingSizeG: 100,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 360, fat: 14, saturates: 7, carbs: 55, sugars: 35, fibre: 0.5, protein: 5, salt: 0.45 },
  },
  {
    id: "carrot-cake",
    name: "Carrot Cake",
    category: "cake",
    description: "Moist spiced carrot cake with full cream cheese frosting and toasted walnuts.",
    servingSizeG: 110,
    allergens: ["Gluten", "Eggs", "Milk", "Tree Nuts"],
    per100g: { calories: 415, fat: 22, saturates: 7, carbs: 50, sugars: 34, fibre: 1.5, protein: 4.5, salt: 0.5 },
  },
  {
    id: "lemon-drizzle",
    name: "Lemon Drizzle Cake",
    category: "cake",
    description: "Zesty lemon sponge soaked with lemon syrup and finished with a crunchy sugar glaze.",
    servingSizeG: 90,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 390, fat: 17, saturates: 8, carbs: 56, sugars: 40, fibre: 0.5, protein: 4.5, salt: 0.4 },
  },
  {
    id: "red-velvet",
    name: "Red Velvet Cake",
    category: "cake",
    description: "Velvety cocoa sponge with a vivid red crumb, layered with cream cheese frosting.",
    servingSizeG: 110,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 370, fat: 15, saturates: 7, carbs: 54, sugars: 38, fibre: 1, protein: 5, salt: 0.5 },
  },
  {
    id: "black-forest",
    name: "Black Forest Cake",
    category: "cake",
    description: "Kirsch-soaked chocolate sponge with whipped cream, morello cherries, and dark chocolate shavings.",
    servingSizeG: 120,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 325, fat: 16, saturates: 9, carbs: 41, sugars: 28, fibre: 1.5, protein: 4.5, salt: 0.3 },
  },
  {
    id: "pound-cake",
    name: "Pound Cake",
    category: "cake",
    description: "Classic quatre-quarts — equal weights of butter, sugar, eggs, and flour.",
    servingSizeG: 90,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 400, fat: 19, saturates: 11, carbs: 52, sugars: 32, fibre: 0.5, protein: 5.5, salt: 0.5 },
  },
  {
    id: "strawberry-shortcake",
    name: "Strawberry Shortcake",
    category: "cake",
    description: "Soft vanilla genoise layered with chantilly cream and fresh strawberries.",
    servingSizeG: 110,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 265, fat: 12, saturates: 7, carbs: 35, sugars: 22, fibre: 1, protein: 4, salt: 0.25 },
  },

  // ── Pastries ───────────────────────────────────────────────────────────────
  {
    id: "butter-croissant",
    name: "Butter Croissant",
    category: "pastry",
    description: "Laminated yeasted dough with 27 layers of butter for a flaky, honeycomb interior.",
    servingSizeG: 80,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 406, fat: 21, saturates: 12, carbs: 46, sugars: 8, fibre: 2, protein: 8, salt: 0.8 },
  },
  {
    id: "chocolate-eclair",
    name: "Chocolate Éclair",
    category: "pastry",
    description: "Choux pastry filled with vanilla custard and dipped in dark chocolate fondant.",
    servingSizeG: 75,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 290, fat: 15, saturates: 8, carbs: 34, sugars: 20, fibre: 0.5, protein: 5, salt: 0.4 },
  },
  {
    id: "cinnamon-roll",
    name: "Cinnamon Roll",
    category: "pastry",
    description: "Soft enriched dough rolled with cinnamon-sugar butter and topped with cream cheese glaze.",
    servingSizeG: 120,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 370, fat: 12, saturates: 5, carbs: 59, sugars: 25, fibre: 1.5, protein: 7, salt: 0.7 },
  },
  {
    id: "stroopwafel",
    name: "Stroopwafel",
    category: "pastry",
    description: "Two thin wafer layers sandwiched with a caramel-syrup filling.",
    servingSizeG: 35,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 452, fat: 18, saturates: 9, carbs: 68, sugars: 40, fibre: 1, protein: 5.5, salt: 0.55 },
  },

  // ── Breads ─────────────────────────────────────────────────────────────────
  {
    id: "banana-bread",
    name: "Banana Bread",
    category: "bread",
    description: "Dense, moist loaf made with overripe bananas, brown sugar, and a hint of cinnamon.",
    servingSizeG: 90,
    allergens: ["Gluten", "Eggs"],
    per100g: { calories: 278, fat: 8, saturates: 2, carbs: 47, sugars: 25, fibre: 1.5, protein: 5, salt: 0.35 },
  },
  {
    id: "brioche",
    name: "Brioche",
    category: "bread",
    description: "Rich, egg-and-butter-enriched French bread with a golden crust and tender crumb.",
    servingSizeG: 60,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 350, fat: 13, saturates: 7, carbs: 47, sugars: 10, fibre: 1.5, protein: 9, salt: 0.65 },
  },

  // ── Cookies ────────────────────────────────────────────────────────────────
  {
    id: "french-macaron",
    name: "French Macaron",
    category: "cookie",
    description: "Delicate almond meringue shells sandwiching a ganache or buttercream filling.",
    servingSizeG: 20,
    allergens: ["Eggs", "Tree Nuts"],
    per100g: { calories: 430, fat: 14, saturates: 4, carbs: 71, sugars: 65, fibre: 0.5, protein: 6, salt: 0.15 },
  },
  {
    id: "speculaas",
    name: "Speculaas",
    category: "cookie",
    description: "Crisp spiced biscuit with cinnamon, cardamom, cloves, and nutmeg — a Dutch classic.",
    servingSizeG: 25,
    allergens: ["Gluten", "Milk", "Tree Nuts"],
    per100g: { calories: 455, fat: 18, saturates: 8, carbs: 68, sugars: 34, fibre: 2, protein: 5.5, salt: 0.7 },
  },
  {
    id: "chocolate-brownie",
    name: "Chocolate Brownie",
    category: "cookie",
    description: "Dense, fudgy bake with 70% dark chocolate and a crinkly top.",
    servingSizeG: 65,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 415, fat: 20, saturates: 11, carbs: 55, sugars: 40, fibre: 2.5, protein: 5.5, salt: 0.35 },
  },

  // ── Desserts ───────────────────────────────────────────────────────────────
  {
    id: "new-york-cheesecake",
    name: "New York Cheesecake",
    category: "dessert",
    description: "Dense baked cream cheese filling on a crushed digestive biscuit base.",
    servingSizeG: 120,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 322, fat: 22, saturates: 13, carbs: 26, sugars: 22, fibre: 0.5, protein: 5.5, salt: 0.4 },
  },
  {
    id: "tiramisu",
    name: "Tiramisu",
    category: "dessert",
    description: "Espresso-soaked savoiardi layered with mascarpone cream and dusted with cocoa.",
    servingSizeG: 130,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 240, fat: 14, saturates: 8, carbs: 24, sugars: 18, fibre: 0.5, protein: 5, salt: 0.15 },
  },
  {
    id: "apple-pie",
    name: "Apple Pie",
    category: "dessert",
    description: "Shortcrust pastry filled with spiced Granny Smith apples and topped with a lattice lid.",
    servingSizeG: 150,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 237, fat: 11, saturates: 4, carbs: 32, sugars: 16, fibre: 2, protein: 2.5, salt: 0.35 },
  },
  {
    id: "blueberry-muffin",
    name: "Blueberry Muffin",
    category: "dessert",
    description: "Soft, dome-topped muffin loaded with fresh blueberries and a crunchy sugar top.",
    servingSizeG: 120,
    allergens: ["Gluten", "Eggs", "Milk"],
    per100g: { calories: 345, fat: 13, saturates: 3, carbs: 53, sugars: 30, fibre: 2, protein: 5, salt: 0.45 },
  },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  cake:    "Cake",
  pastry:  "Pastry",
  bread:   "Bread",
  cookie:  "Cookie",
  dessert: "Dessert",
};
