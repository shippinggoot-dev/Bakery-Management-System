import { createTRPCRouter } from "./trpc";
import { recipesRouter } from "./routers/recipes";
import { ingredientsRouter } from "./routers/ingredients";
import { suppliersRouter } from "./routers/suppliers";
import { purchaseOrdersRouter } from "./routers/purchase-orders";
import { shoppingListsRouter } from "./routers/shopping-lists";
import { priceSyncRouter } from "./routers/price-sync";
import { priceIngestionRouter } from "./routers/price-ingestion";
import { inventoryRouter } from "./routers/inventory";
import { customersRouter } from "./routers/customers";
import { shopifyRouter } from "./routers/shopify";
import { todosRouter } from "./routers/todos";

export const appRouter = createTRPCRouter({
  recipes:        recipesRouter,
  ingredients:    ingredientsRouter,
  suppliers:      suppliersRouter,
  purchaseOrders: purchaseOrdersRouter,
  shoppingLists:  shoppingListsRouter,
  priceSync:      priceSyncRouter,
  priceIngestion: priceIngestionRouter,
  inventory:      inventoryRouter,
  customers:      customersRouter,
  shopify:        shopifyRouter,
  todos:          todosRouter,
});

export type AppRouter = typeof appRouter;
