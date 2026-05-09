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
import { cakeOrdersRouter } from "./routers/cake-orders";
import { emailSettingsRouter } from "./routers/email-settings";
import { productionRouter } from "./routers/production";
import { salesRouter } from "./routers/sales";
import { dashboardRouter } from "./routers/dashboard";
import { otherDeliveriesRouter } from "./routers/other-deliveries";
import { instagramRouter } from "./routers/instagram";
import { customOptionsRouter } from "./routers/custom-options";
import { premadeCakesRouter } from "./routers/premade-cakes";
import { preferencesRouter } from "./routers/preferences";

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
  cakeOrders:     cakeOrdersRouter,
  emailSettings:  emailSettingsRouter,
  production:     productionRouter,
  sales:          salesRouter,
  dashboard:      dashboardRouter,
  otherDeliveries: otherDeliveriesRouter,
  instagram:        instagramRouter,
  customOptions:    customOptionsRouter,
  premadeCakes:     premadeCakesRouter,
  preferences:      preferencesRouter,
});

export type AppRouter = typeof appRouter;
