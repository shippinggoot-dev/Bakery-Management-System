import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { otherDeliveries } from "@bakery/db";

export const otherDeliveriesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      itemName:   z.string().min(1),
      quantity:   z.string(),
      unit:       z.string().min(1),
      supplierId: z.string().uuid().optional().nullable(),
      lotNumber:  z.string().optional().nullable(),
      notes:      z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(otherDeliveries)
        .values({ ...input, ownerId: ctx.user.id })
        .returning();
      return row;
    }),

  getAll: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.otherDeliveries.findMany({
        where: and(eq(otherDeliveries.ownerId, ctx.user.id)),
        with: { supplier: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: input?.limit ?? 50,
      });
    }),
});
