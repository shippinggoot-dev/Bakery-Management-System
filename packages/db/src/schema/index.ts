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
export * from "./price-ingestion-sessions";
export * from "./price-ingestion-items";
export * from "./margin-settings";
export * from "./notifications";
export * from "./production-batches";
export * from "./waste-logs";
export * from "./stock-movements";
export * from "./customers";
export * from "./loyalty-tiers";
export * from "./loyalty-transactions";
export * from "./rewards";
export * from "./customer-segments";
export * from "./customer-sales";
export * from "./shopify-settings";
export * from "./todos";
export * from "./cake-orders";
export * from "./email-settings";
export * from "./production-schedules";

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
import { priceIngestionSessions } from "./price-ingestion-sessions";
import { priceIngestionItems } from "./price-ingestion-items";
import { marginSettings } from "./margin-settings";
import { notifications } from "./notifications";
import { productionBatches } from "./production-batches";
import { wasteLogs } from "./waste-logs";
import { stockMovements } from "./stock-movements";
import { customers } from "./customers";
import { loyaltyTiers } from "./loyalty-tiers";
import { loyaltyTransactions } from "./loyalty-transactions";
import { rewards } from "./rewards";
import { customerSegments, customerSegmentMembers } from "./customer-segments";
import { customerSales } from "./customer-sales";
import { cakeOrders } from "./cake-orders";
import { productionSchedules } from "./production-schedules";

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

export const priceIngestionSessionsRelations = relations(priceIngestionSessions, ({ many }) => ({
  items: many(priceIngestionItems),
}));

export const priceIngestionItemsRelations = relations(priceIngestionItems, ({ one }) => ({
  session: one(priceIngestionSessions, {
    fields: [priceIngestionItems.sessionId],
    references: [priceIngestionSessions.id],
  }),
  ingredient: one(ingredients, {
    fields: [priceIngestionItems.ingredientId],
    references: [ingredients.id],
  }),
  supplier: one(suppliers, {
    fields: [priceIngestionItems.supplierId],
    references: [suppliers.id],
  }),
}));

// marginSettings and notifications have no FK relations to wire up

export const productionBatchesRelations = relations(productionBatches, ({ one }) => ({
  recipe: one(recipes, {
    fields: [productionBatches.recipeId],
    references: [recipes.id],
  }),
}));

export const wasteLogsRelations = relations(wasteLogs, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [wasteLogs.ingredientId],
    references: [ingredients.id],
  }),
  lot: one(lots, {
    fields: [wasteLogs.lotId],
    references: [lots.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [stockMovements.ingredientId],
    references: [ingredients.id],
  }),
  lot: one(lots, {
    fields: [stockMovements.lotId],
    references: [lots.id],
  }),
}));

// ─── Loyalty / CRM relations ──────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  loyaltyTransactions: many(loyaltyTransactions),
  rewards:             many(rewards),
  sales:               many(customerSales),
  segmentMemberships:  many(customerSegmentMembers),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  customer: one(customers, {
    fields: [loyaltyTransactions.customerId],
    references: [customers.id],
  }),
}));

export const rewardsRelations = relations(rewards, ({ one }) => ({
  customer: one(customers, {
    fields: [rewards.customerId],
    references: [customers.id],
  }),
}));

export const customerSalesRelations = relations(customerSales, ({ one }) => ({
  customer: one(customers, {
    fields: [customerSales.customerId],
    references: [customers.id],
  }),
}));

export const customerSegmentsRelations = relations(customerSegments, ({ many }) => ({
  members: many(customerSegmentMembers),
}));

export const customerSegmentMembersRelations = relations(customerSegmentMembers, ({ one }) => ({
  segment: one(customerSegments, {
    fields: [customerSegmentMembers.segmentId],
    references: [customerSegments.id],
  }),
  customer: one(customers, {
    fields: [customerSegmentMembers.customerId],
    references: [customers.id],
  }),
}));

// loyaltyTiers has no FK relations — standalone config table per owner

// ─── Cake orders ─────────────────────────────────────────────────────────────

export const cakeOrdersRelations = relations(cakeOrders, ({ one }) => ({
  recipe: one(recipes, {
    fields: [cakeOrders.recipeId],
    references: [recipes.id],
  }),
}));

// ─── Production schedules ─────────────────────────────────────────────────────

export const productionSchedulesRelations = relations(productionSchedules, ({ one }) => ({
  recipe: one(recipes, {
    fields: [productionSchedules.recipeId],
    references: [recipes.id],
  }),
}));
