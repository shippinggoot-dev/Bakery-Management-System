import { z } from "zod";
import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ingredients, priceAlerts } from "@bakery/db";
import { getLocalStoreGroups, getCheapestLocalPrice, searchKassalProducts } from "../services/kassalapp";

export const priceSyncRouter = createTRPCRouter({
  sync: protectedProcedure.mutation(async ({ ctx }) => {
    const apiKey = process.env.KASSALAPP_API_KEY;
    if (!apiKey) throw new Error("KASSALAPP_API_KEY is not configured");

    const localGroups = await getLocalStoreGroups(apiKey);

    // Only sync this user's linked ingredients
    const linked = await ctx.db.query.ingredients.findMany({
      where: and(eq(ingredients.ownerId, ctx.user.id), isNotNull(ingredients.kassalappEan)),
    });

    if (linked.length === 0) return { checked: 0, updated: 0 };

    let updated = 0;
    const now = new Date();

    for (const ingredient of linked) {
      const result = await getCheapestLocalPrice(apiKey, ingredient.kassalappEan!, localGroups);
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
        .set({ currentPriceNok: newPrice, currentPricePer: result.sizePer, cheapestStore: result.store, lastPriceCheck: now, updatedAt: now })
        .where(eq(ingredients.id, ingredient.id));
    }

    return { checked: linked.length, updated };
  }),

  getAlerts: protectedProcedure.query(async ({ ctx }) => {
    // Alerts are joined through ingredient — filter by owner via subquery
    const userIngredientIds = await ctx.db.query.ingredients.findMany({
      where: eq(ingredients.ownerId, ctx.user.id),
      columns: { id: true },
    });
    const ids = userIngredientIds.map((i) => i.id);
    if (ids.length === 0) return [];

    return ctx.db.query.priceAlerts.findMany({
      where: (a, { and, isNull, inArray }) =>
        and(isNull(a.dismissedAt), inArray(a.ingredientId, ids)),
      orderBy: (a, { desc }) => [desc(a.detectedAt)],
    });
  }),

  getLinkedCount: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.ingredients.findMany({
      where: and(eq(ingredients.ownerId, ctx.user.id), isNotNull(ingredients.kassalappEan)),
      columns: { id: true },
    });
    return rows.length;
  }),

  getAlertCount: protectedProcedure.query(async ({ ctx }) => {
    const userIngredientIds = await ctx.db.query.ingredients.findMany({
      where: eq(ingredients.ownerId, ctx.user.id),
      columns: { id: true },
    });
    const ids = userIngredientIds.map((i) => i.id);
    if (ids.length === 0) return 0;

    const rows = await ctx.db.query.priceAlerts.findMany({
      where: (a, { and, isNull, inArray }) =>
        and(isNull(a.dismissedAt), inArray(a.ingredientId, ids)),
      columns: { id: true },
    });
    return rows.length;
  }),

  dismissAlert: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(priceAlerts).set({ dismissedAt: new Date() }).where(eq(priceAlerts.id, input));
      return { success: true };
    }),

  dismissAll: protectedProcedure.mutation(async ({ ctx }) => {
    const userIngredientIds = await ctx.db.query.ingredients.findMany({
      where: eq(ingredients.ownerId, ctx.user.id),
      columns: { id: true },
    });
    const ids = userIngredientIds.map((i) => i.id);
    if (ids.length === 0) return { success: true };

    await ctx.db.update(priceAlerts)
      .set({ dismissedAt: new Date() })
      .where(and(isNull(priceAlerts.dismissedAt), inArray(priceAlerts.ingredientId, ids)));
    return { success: true };
  }),

  searchProducts: protectedProcedure
    .input(z.string().min(2))
    .query(async ({ input }) => {
      const apiKey = process.env.KASSALAPP_API_KEY;
      if (!apiKey) throw new Error("KASSALAPP_API_KEY is not configured");
      return searchKassalProducts(apiKey, input);
    }),

  linkProduct: protectedProcedure
    .input(z.object({ ingredientId: z.string(), ean: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.KASSALAPP_API_KEY;
      // Verify ownership before linking
      const ingredient = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!ingredient) throw new Error("Ingredient not found.");

      await ctx.db.update(ingredients).set({ kassalappEan: input.ean, updatedAt: new Date() }).where(eq(ingredients.id, input.ingredientId));

      if (apiKey) {
        try {
          const localGroups = await getLocalStoreGroups(apiKey);
          const result = await getCheapestLocalPrice(apiKey, input.ean, localGroups);
          if (result) {
            await ctx.db.update(ingredients)
              .set({ currentPriceNok: result.price.toFixed(2), currentPricePer: result.sizePer, cheapestStore: result.store, lastPriceCheck: new Date(), updatedAt: new Date() })
              .where(eq(ingredients.id, input.ingredientId));
          }
        } catch { /* Price fetch failed — EAN saved, sync will pick it up later */ }
      }
      return { success: true };
    }),

  unlinkProduct: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(ingredients)
        .set({ kassalappEan: null, currentPriceNok: null, currentPricePer: null, cheapestStore: null, lastPriceCheck: null, updatedAt: new Date() })
        .where(and(eq(ingredients.id, input), eq(ingredients.ownerId, ctx.user.id)));
      return { success: true };
    }),
});
