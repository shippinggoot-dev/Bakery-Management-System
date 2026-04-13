import { z } from "zod";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { ingredients, priceAlerts } from "@bakery/db";

export const priceSyncRouter = createTRPCRouter({
  getAlerts: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return [];
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

  getAlertCount: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return 0;
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
});
