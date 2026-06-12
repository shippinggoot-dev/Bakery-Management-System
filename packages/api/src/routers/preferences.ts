import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { userPreferences } from "@bakery/db";

const DEFAULTS = {
  confirmBatchCompletion:    true,
  dashboardShowShopifyTile:  true,
  bakeryName:                null as string | null,
};

export const preferencesRouter = createTRPCRouter({
  /**
   * Read the current user's preferences. Always returns a complete object,
   * filling in defaults for any field the user hasn't explicitly set yet.
   * Returns defaults for anonymous/unauthenticated users so the UI can
   * render without conditional checks.
   */
  get: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.isAnonymous) return DEFAULTS;
    const row = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });
    if (!row) return DEFAULTS;
    return {
      confirmBatchCompletion:    row.confirmBatchCompletion,
      dashboardShowShopifyTile:  row.dashboardShowShopifyTile,
      bakeryName:                row.bakeryName,
    };
  }),

  /** Upsert one or more preference fields for the current user. */
  update: protectedProcedure
    .input(
      z.object({
        confirmBatchCompletion:    z.boolean().optional(),
        dashboardShowShopifyTile:  z.boolean().optional(),
        bakeryName:                z.string().trim().max(40).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, ctx.user.id),
      });

      if (existing) {
        const [updated] = await ctx.db
          .update(userPreferences)
          .set({
            ...(input.confirmBatchCompletion !== undefined
              ? { confirmBatchCompletion: input.confirmBatchCompletion }
              : {}),
            ...(input.dashboardShowShopifyTile !== undefined
              ? { dashboardShowShopifyTile: input.dashboardShowShopifyTile }
              : {}),
            ...(input.bakeryName !== undefined
              ? { bakeryName: input.bakeryName === "" ? null : input.bakeryName }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.userId, ctx.user.id))
          .returning();
        return updated;
      }

      const [inserted] = await ctx.db
        .insert(userPreferences)
        .values({
          userId: ctx.user.id,
          confirmBatchCompletion:   input.confirmBatchCompletion   ?? DEFAULTS.confirmBatchCompletion,
          dashboardShowShopifyTile: input.dashboardShowShopifyTile ?? DEFAULTS.dashboardShowShopifyTile,
          bakeryName:               input.bakeryName === "" ? null : (input.bakeryName ?? null),
        })
        .returning();
      return inserted;
    }),
});
