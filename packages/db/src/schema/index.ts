// ─── Table exports ───────────────────────────────────────────────────────────
export * from "./allergens";
export * from "./ingredient-categories";
export * from "./ingredients";
export * from "./ingredient-allergens";
export * from "./ingredient-suppliers";
export * from "./suppliers";
export * from "./supplier-prices";
export * from "./price-history";
export * from "./lots";
export * from "./recipe-categories";
export * from "./recipes";
export * from "./purchase-orders";
export * from "./shopping-lists";
export * from "./price-alerts";

// ─── Relations ───────────────────────────────────────────────────────────────
// All relations are defined here to avoid circular import issues between files.
import { relations } from "drizzle-orm";

import { allergens } from "./allergens";
import { ingredientCategories } from "./ingredient-categories";
import { ingredients } from "./ingredients";
import { ingredientAllergens } from "./ingredient-allergens";
import { ingredientSuppliers } from "./ingredient-suppliers";
import { suppliers } from "./suppliers";
import { supplierPrices } from "./supplier-prices";
import { priceHistory } from "./price-history";
import { lots } from "./lots";
import { recipeCategories } from "./recipe-categories";
import { recipes, recipeIngredients } from "./recipes";
import { purchaseOrders, purchaseOrderItems } from "./purchase-orders";
import { shoppingLists, shoppingListItems } from "./shopping-lists";
import { priceAlerts } from "./price-alerts";

export const allergensRelations = relations(allergens, ({ many }) => ({
  ingredientAllergens: many(ingredientAllergens),
}));

export const ingredientCategoriesRelations = relations(
  ingredientCategories,
  ({ many }) => ({ ingredients: many(ingredients) })
);

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  category: one(ingredientCategories, {
    fields: [ingredients.categoryId],
    references: [ingredientCategories.id],
  }),
  allergens: many(ingredientAllergens),
  supplierPrices: many(supplierPrices),
  ingredientSuppliers: many(ingredientSuppliers),
  lots: many(lots),
  recipeIngredients: many(recipeIngredients),
  purchaseOrderItems: many(purchaseOrderItems),
  shoppingListItems: many(shoppingListItems),
}));

export const ingredientAllergensRelations = relations(
  ingredientAllergens,
  ({ one }) => ({
    ingredient: one(ingredients, {
      fields: [ingredientAllergens.ingredientId],
      references: [ingredients.id],
    }),
    allergen: one(allergens, {
      fields: [ingredientAllergens.allergenId],
      references: [allergens.id],
    }),
  })
);

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  supplierPrices: many(supplierPrices),
  ingredientSuppliers: many(ingredientSuppliers),
  lots: many(lots),
  purchaseOrders: many(purchaseOrders),
}));

export const supplierPricesRelations = relations(supplierPrices, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierPrices.supplierId],
    references: [suppliers.id],
  }),
  ingredient: one(ingredients, {
    fields: [supplierPrices.ingredientId],
    references: [ingredients.id],
  }),
}));

export const recipeCategoriesRelations = relations(
  recipeCategories,
  ({ many }) => ({ recipes: many(recipes) })
);

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  category: one(recipeCategories, {
    fields: [recipes.categoryId],
    references: [recipeCategories.id],
  }),
  ingredients: many(recipeIngredients),
}));

export const recipeIngredientsRelations = relations(
  recipeIngredients,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [recipeIngredients.recipeId],
      references: [recipes.id],
    }),
    ingredient: one(ingredients, {
      fields: [recipeIngredients.ingredientId],
      references: [ingredients.id],
    }),
    substituteIngredient: one(ingredients, {
      fields: [recipeIngredients.substituteIngredientId],
      references: [ingredients.id],
      relationName: "substituteIngredient",
    }),
  })
);

export const ingredientSuppliersRelations = relations(
  ingredientSuppliers,
  ({ one, many }) => ({
    ingredient: one(ingredients, {
      fields: [ingredientSuppliers.ingredientId],
      references: [ingredients.id],
    }),
    supplier: one(suppliers, {
      fields: [ingredientSuppliers.supplierId],
      references: [suppliers.id],
    }),
    priceHistory: many(priceHistory),
  })
);

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  ingredientSupplier: one(ingredientSuppliers, {
    fields: [priceHistory.ingredientSupplierId],
    references: [ingredientSuppliers.id],
  }),
}));

export const lotsRelations = relations(lots, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [lots.ingredientId],
    references: [ingredients.id],
  }),
  supplier: one(suppliers, {
    fields: [lots.supplierId],
    references: [suppliers.id],
  }),
}));

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ one, many }) => ({
    supplier: one(suppliers, {
      fields: [purchaseOrders.supplierId],
      references: [suppliers.id],
    }),
    items: many(purchaseOrderItems),
  })
);

export const purchaseOrderItemsRelations = relations(
  purchaseOrderItems,
  ({ one }) => ({
    purchaseOrder: one(purchaseOrders, {
      fields: [purchaseOrderItems.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    ingredient: one(ingredients, {
      fields: [purchaseOrderItems.ingredientId],
      references: [ingredients.id],
    }),
  })
);

export const shoppingListsRelations = relations(shoppingLists, ({ many }) => ({
  items: many(shoppingListItems),
}));

export const shoppingListItemsRelations = relations(
  shoppingListItems,
  ({ one }) => ({
    shoppingList: one(shoppingLists, {
      fields: [shoppingListItems.shoppingListId],
      references: [shoppingLists.id],
    }),
    ingredient: one(ingredients, {
      fields: [shoppingListItems.ingredientId],
      references: [ingredients.id],
    }),
  })
);

export const priceAlertsRelations = relations(priceAlerts, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [priceAlerts.ingredientId],
    references: [ingredients.id],
  }),
}));
