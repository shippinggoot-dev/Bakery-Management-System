import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, lte } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { productionSchedules, recipes } from "@bakery/db";
import { inventoryService } from "../services/inventory";
import { canUnlockRecordedBatch } from "../lib/permissions";

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

  /**
   * Generic update. Refuses to mutate fields that affect the recorded
   * deduction (status, recipeId, batchCount) once the schedule has been
   * recorded — the user must `unlock` first.
   */
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

      const existing = await ctx.db.query.productionSchedules.findFirst({
        where: and(eq(productionSchedules.id, id), eq(productionSchedules.ownerId, ctx.user.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // If the batch has already been recorded, refuse mutations to fields
      // that would imply a different deduction. Cosmetic fields are still OK.
      if (existing.recordedBatchId) {
        const wantsLockedFieldChange =
          (rest.status !== undefined && rest.status !== existing.status) ||
          (rest.recipeId !== undefined && rest.recipeId !== existing.recipeId) ||
          (batchCount !== undefined && String(batchCount) !== existing.batchCount);
        if (wantsLockedFieldChange) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "BATCH_LOCKED",
          });
        }
      }

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

  /**
   * Mark a scheduled batch as "done". Side-effects:
   *   1. calls inventoryService.recordProduction → FEFO deduction across lots
   *   2. links the resulting batch via recorded_batch_id (idempotent)
   *   3. flips status to "done"
   *
   * Idempotent: if the schedule already has a recordedBatchId, returns the
   * existing batch info without re-deducting.
   */
  markDone: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sched = await ctx.db.query.productionSchedules.findFirst({
        where: and(eq(productionSchedules.id, input.id), eq(productionSchedules.ownerId, ctx.user.id)),
      });
      if (!sched) throw new TRPCError({ code: "NOT_FOUND" });

      // Idempotency guard
      if (sched.recordedBatchId) {
        return {
          alreadyRecorded: true,
          batchId: sched.recordedBatchId,
          deductions: [],
          reorderAlerts: [],
        };
      }

      if (!sched.recipeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot record a batch without a linked recipe.",
        });
      }

      const result = await inventoryService.recordProduction({
        ownerId:     ctx.user.id,
        recipeId:    sched.recipeId,
        scaleFactor: parseFloat(sched.batchCount),
        notes:       sched.notes,
      });

      await ctx.db
        .update(productionSchedules)
        .set({
          status: "done",
          recordedBatchId: result.batchId,
          updatedAt: new Date(),
        })
        .where(eq(productionSchedules.id, sched.id));

      return {
        alreadyRecorded: false,
        batchId: result.batchId,
        deductions: result.deductions,
        reorderAlerts: result.reorderAlerts,
      };
    }),

  /**
   * Unlink a recorded batch from its schedule entry, allowing the user to
   * edit status/recipe/scale again. Does NOT reverse the deduction —
   * deductions are append-only; to correct stock the user does a stocktake
   * or waste log. The actual production_batches row stays intact.
   *
   * Today: any signed-in workspace member can unlock. Future: gated to
   * managers via canUnlockRecordedBatch().
   */
  unlock: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!canUnlockRecordedBatch(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const sched = await ctx.db.query.productionSchedules.findFirst({
        where: and(eq(productionSchedules.id, input.id), eq(productionSchedules.ownerId, ctx.user.id)),
      });
      if (!sched) throw new TRPCError({ code: "NOT_FOUND" });
      if (!sched.recordedBatchId) return sched;

      const [updated] = await ctx.db
        .update(productionSchedules)
        .set({
          recordedBatchId: null,
          updatedAt: new Date(),
        })
        .where(eq(productionSchedules.id, sched.id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.productionSchedules.findFirst({
        where: and(eq(productionSchedules.id, input), eq(productionSchedules.ownerId, ctx.user.id)),
        columns: { recordedBatchId: true },
      });
      if (existing?.recordedBatchId) {
        // Removing the schedule shouldn't silently erase the audit trail of
        // a recorded batch. Force the user to unlock first if they really
        // want to delete it.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "BATCH_LOCKED",
        });
      }
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
