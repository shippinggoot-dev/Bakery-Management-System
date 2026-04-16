import { z } from "zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { productionSchedules, recipes } from "@bakery/db";

const shiftEnum = z.enum(["morning", "afternoon", "evening"]);
const statusEnum = z.enum(["planned", "in_progress", "done", "cancelled"]);

export const productionRouter = createTRPCRouter({
  /** Fetch schedule entries for a date range (defaults to current week). */
  getSchedule: publicProcedure
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const from = input?.from ?? weekStart();
      const to   = input?.to   ?? weekEnd();
      return ctx.db.query.productionSchedules.findMany({
        where: and(
          eq(productionSchedules.ownerId, ctx.user.id),
          gte(productionSchedules.scheduledDate, from),
          lte(productionSchedules.scheduledDate, to),
        ),
        with: { recipe: { columns: { id: true, name: true, yieldAmount: true, yieldUnit: true } } },
        orderBy: [productionSchedules.scheduledDate, productionSchedules.shift],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        recipeId:      z.string().uuid().optional().nullable(),
        recipeName:    z.string().optional().nullable(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shift:         shiftEnum.default("morning"),
        batchCount:    z.number().positive().default(1),
        notes:         z.string().optional().nullable(),
        assignedTo:    z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If recipeId given but no name, look up the name for the snapshot
      let recipeName = input.recipeName ?? null;
      if (input.recipeId && !recipeName) {
        const r = await ctx.db.query.recipes.findFirst({
          where: and(eq(recipes.id, input.recipeId), eq(recipes.ownerId, ctx.user.id)),
          columns: { name: true },
        });
        recipeName = r?.name ?? null;
      }
      const [row] = await ctx.db
        .insert(productionSchedules)
        .values({
          ownerId:       ctx.user.id,
          recipeId:      input.recipeId   ?? null,
          recipeName:    recipeName,
          scheduledDate: input.scheduledDate,
          shift:         input.shift,
          batchCount:    String(input.batchCount),
          notes:         input.notes      ?? null,
          assignedTo:    input.assignedTo ?? null,
          status:        "planned",
        })
        .returning();
      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id:            z.string().uuid(),
        status:        statusEnum.optional(),
        shift:         shiftEnum.optional(),
        batchCount:    z.number().positive().optional(),
        notes:         z.string().optional().nullable(),
        assignedTo:    z.string().optional().nullable(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        recipeId:      z.string().uuid().optional().nullable(),
        recipeName:    z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, batchCount, ...rest } = input;
      const [updated] = await ctx.db
        .update(productionSchedules)
        .set({
          ...rest,
          ...(batchCount !== undefined ? { batchCount: String(batchCount) } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(productionSchedules.id, id), eq(productionSchedules.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(productionSchedules)
        .where(and(eq(productionSchedules.id, input), eq(productionSchedules.ownerId, ctx.user.id)));
      return { success: true };
    }),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function weekEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + (6 - d.getDay()));
  return d.toISOString().slice(0, 10);
}
