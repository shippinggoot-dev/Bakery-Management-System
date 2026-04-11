import { z } from "zod";
import { eq, isNull, isNotNull, count } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { ingredients, priceAlerts } from "@bakery/db";
import {
  getLocalStoreGroups,
  getCheapestLocalPrice,
  searchKassalProducts,
} from "../services/kassalapp";

export const priceSyncRouter = createTRPCRouter({
  /**
   * Checks all linked ingredients against Kassal.app prices,
   * creates an alert for any that have changed, and updates the stored price.
   */
  sync: publicProcedure.mutation(async ({ ctx }) => {
    const apiKey = process.env.KASSALAPP_API_KEY;
    if (!apiKey) throw new Error("KASSALAPP_API_KEY is not configured");

    const localGroups = await getLocalStoreGroups(apiKey);

    const linked = await ctx.db.query.ingredients.findMany({
      where: isNotNull(ingredients.kassalappEan),
    });

    if (linked.length === 0) {
      return { checked: 0, updated: 0 };
    }

    let updated = 0;
    const now = new Date();

    for (const ingredient of linked) {
      const result = await getCheapestLocalPrice(
        apiKey,
        ingredient.kassalappEan!,
        localGroups
      );

      if (!result) continue;

      const newPrice = result.price.toFixed(2);
      const oldPrice = ingredient.currentPriceNok;

      if (oldPrice !== null && oldPrice !== newPrice) {
        await ctx.db.insert(priceAlerts).values({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          oldPriceNok: oldPrice,
          newPriceNok: newPrice,
          oldStore: ingredient.cheapestStore,
          newStore: result.store,
        });
        updated++;
      }

      await ctx.db
        .update(ingredients)
        .set({
          currentPriceNok: newPrice,
          currentPricePer: result.sizePer,
          cheapestStore: result.store,
          lastPriceCheck: now,
          updatedAt: now,
        })
        .where(eq(ingredients.id, ingredient.id));
    }

    return { checked: linked.length, updated };
  }),

  /** Returns all unread (not dismissed) alerts, newest first */
  getAlerts: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.priceAlerts.findMany({
      where: isNull(priceAlerts.dismissedAt),
      orderBy: (a, { desc }) => [desc(a.detectedAt)],
    });
  }),

  /** Number of ingredients with a Kassal.app EAN linked */
  getLinkedCount: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.ingredients.findMany({
      where: isNotNull(ingredients.kassalappEan),
      columns: { id: true },
    });
    return rows.length;
  }),

  /** Count of unread alerts — used for the nav badge */
  getAlertCount: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.priceAlerts.findMany({
      where: isNull(priceAlerts.dismissedAt),
      columns: { id: true },
    });
    return rows.length;
  }),

  dismissAlert: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(priceAlerts)
        .set({ dismissedAt: new Date() })
        .where(eq(priceAlerts.id, input));
      return { success: true };
    }),

  dismissAll: publicProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(priceAlerts)
      .set({ dismissedAt: new Date() })
      .where(isNull(priceAlerts.dismissedAt));
    return { success: true };
  }),

  /** Search Kassal.app by name — for linking an ingredient to a product */
  searchProducts: publicProcedure
    .input(z.string().min(2))
    .query(async ({ input }) => {
      const apiKey = process.env.KASSALAPP_API_KEY;
      if (!apiKey) throw new Error("KASSALAPP_API_KEY is not configured");
      return searchKassalProducts(apiKey, input);
    }),

  /** Save a Kassal.app EAN to an ingredient and immediately fetch its price */
  linkProduct: publicProcedure
    .input(z.object({ ingredientId: z.string(), ean: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.KASSALAPP_API_KEY;

      // Save EAN first
      await ctx.db
        .update(ingredients)
        .set({ kassalappEan: input.ean, updatedAt: new Date() })
        .where(eq(ingredients.id, input.ingredientId));

      // Immediately fetch current price so it shows without waiting for a sync
      if (apiKey) {
        try {
          const localGroups = await getLocalStoreGroups(apiKey);
          const result = await getCheapestLocalPrice(apiKey, input.ean, localGroups);
          if (result) {
            await ctx.db
              .update(ingredients)
              .set({
                currentPriceNok: result.price.toFixed(2),
                currentPricePer: result.sizePer,
                cheapestStore: result.store,
                lastPriceCheck: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(ingredients.id, input.ingredientId));
          }
        } catch {
          // Price fetch failed — EAN is still saved, sync will pick it up later
        }
      }

      return { success: true };
    }),

  /** Remove a Kassal.app link from an ingredient */
  unlinkProduct: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(ingredients)
        .set({
          kassalappEan: null,
          currentPriceNok: null,
          currentPricePer: null,
          cheapestStore: null,
          lastPriceCheck: null,
          updatedAt: new Date(),
        })
        .where(eq(ingredients.id, input));
      return { success: true };
    }),
});
