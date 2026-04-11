import { createTRPCRouter } from "./trpc";
import { recipesRouter } from "./routers/recipes";
import { ingredientsRouter } from "./routers/ingredients";
import { suppliersRouter } from "./routers/suppliers";
import { purchaseOrdersRouter } from "./routers/purchase-orders";
import { shoppingListsRouter } from "./routers/shopping-lists";
import { priceSyncRouter } from "./routers/price-sync";

export const appRouter = createTRPCRouter({
  recipes: recipesRouter,
  ingredients: ingredientsRouter,
  suppliers: suppliersRouter,
  purchaseOrders: purchaseOrdersRouter,
  shoppingLists: shoppingListsRouter,
  priceSync: priceSyncRouter,
});

export type AppRouter = typeof appRouter;
