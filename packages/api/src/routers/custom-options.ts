import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { customOptions } from "@bakery/db";

export const customOptionsRouter = createTRPCRouter({
  getOptions: publicProcedure
    .input(z.object({ fieldKey: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      return ctx.db.query.customOptions.findMany({
        where: and(
          eq(customOptions.ownerId, ctx.user.id),
          eq(customOptions.fieldKey, input.fieldKey),
        ),
        orderBy: [desc(customOptions.useCount), desc(customOptions.lastUsedAt)],
      });
    }),

  recordUsage: protectedProcedure
    .input(z.object({
      fieldKey: z.string(),
      values:   z.array(z.string().min(1)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      for (const value of input.values) {
        await ctx.db
          .insert(customOptions)
          .values({
            ownerId:    ctx.user.id,
            fieldKey:   input.fieldKey,
            value:      value.trim(),
            useCount:   1,
            lastUsedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [customOptions.ownerId, customOptions.fieldKey, customOptions.value],
            set: {
              useCount:   sql`${customOptions.useCount} + 1`,
              lastUsedAt: new Date(),
            },
          });
      }
      return { success: true };
    }),
});
