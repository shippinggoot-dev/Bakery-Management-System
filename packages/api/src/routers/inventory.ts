import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, gte } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { lots, stockMovements, wasteLogs, productionBatches, ingredients } from "@bakery/db";
import { inventoryService } from "../services/inventory";
import { WASTE_REASONS } from "@bakery/db";

export const inventoryRouter = createTRPCRouter({

  // ── Stock overview ─────────────────────────────────────────────────────────

  getStockLevels: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    return inventoryService.getStockLevels(ctx.user.id);
  }),

  // ── Lot management ─────────────────────────────────────────────────────────

  getLots: protectedProcedure
    .input(z.object({
      ingredientId: z.string().uuid().optional(),
      status: z.enum(["available", "quarantine", "consumed", "expired", "returned"]).optional(),
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(ingredients.ownerId, ctx.user.id)];

      const allLots = await ctx.db.query.lots.findMany({
        where: and(
          input?.ingredientId ? eq(lots.ingredientId, input.ingredientId) : undefined,
          input?.status ? eq(lots.status, input.status) : undefined
        ),
        with: {
          ingredient: { columns: { id: true, name: true, unit: true, ownerId: true } },
          supplier: { columns: { id: true, name: true } },
        },
        orderBy: [desc(lots.receivedAt)],
        limit: input?.limit ?? 50,
      });

      // Filter to this user's lots
      return allLots.filter((l) => l.ingredient.ownerId === ctx.user.id);
    }),

  // ── Receive delivery ───────────────────────────────────────────────────────

  receiveDelivery: protectedProcedure
    .input(z.object({
      ingredientId:    z.string().uuid(),
      supplierId:      z.string().uuid().optional().nullable(),
      quantity:        z.number().positive(),
      unit:            z.string().min(1),
      lotNumber:       z.string().optional().nullable(),
      expiryDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      purchaseOrderId: z.string().uuid().optional().nullable(),
      notes:           z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const ing = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!ing) throw new TRPCError({ code: "NOT_FOUND" });

      return inventoryService.receiveDelivery({
        ownerId:         ctx.user.id,
        ingredientId:    input.ingredientId,
        supplierId:      input.supplierId      ?? null,
        quantity:        input.quantity,
        unit:            input.unit,
        lotNumber:       input.lotNumber       ?? null,
        expiryDate:      input.expiryDate      ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        notes:           input.notes           ?? null,
      });
    }),

  // ── Record production ──────────────────────────────────────────────────────

  recordProduction: protectedProcedure
    .input(z.object({
      recipeId:    z.string().uuid(),
      scaleFactor: z.number().positive().default(1),
      notes:       z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return inventoryService.recordProduction({
        ownerId:     ctx.user.id,
        recipeId:    input.recipeId,
        scaleFactor: input.scaleFactor,
        notes:       input.notes ?? null,
      });
    }),

  // ── Log waste ──────────────────────────────────────────────────────────────

  logWaste: protectedProcedure
    .input(z.object({
      ingredientId: z.string().uuid(),
      quantity:     z.number().positive(),
      unit:         z.string().min(1),
      reason:       z.enum(WASTE_REASONS),
      notes:        z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ing = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!ing) throw new TRPCError({ code: "NOT_FOUND" });

      return inventoryService.logWaste({
        ownerId:      ctx.user.id,
        ingredientId: input.ingredientId,
        quantity:     input.quantity,
        unit:         input.unit,
        reason:       input.reason,
        notes:        input.notes ?? null,
      });
    }),

  // ── Manual stock adjustment ────────────────────────────────────────────────

  adjustStock: protectedProcedure
    .input(z.object({
      ingredientId: z.string().uuid(),
      newQuantity:  z.number().min(0),
      unit:         z.string().min(1),
      notes:        z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ing = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!ing) throw new TRPCError({ code: "NOT_FOUND" });

      return inventoryService.adjustStock({
        ownerId:      ctx.user.id,
        ingredientId: input.ingredientId,
        newQuantity:  input.newQuantity,
        unit:         input.unit,
        notes:        input.notes ?? null,
      });
    }),

  // ── Barcode lookup ─────────────────────────────────────────────────────────

  lookupBarcode: protectedProcedure
    .input(z.string().min(1))
    .query(async ({ ctx, input }) => {
      return inventoryService.lookupBarcode(input, ctx.user.id);
    }),

  // ── Movement history ───────────────────────────────────────────────────────

  getMovements: protectedProcedure
    .input(z.object({
      ingredientId: z.string().uuid().optional(),
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const moves = await ctx.db.query.stockMovements.findMany({
        where: and(
          eq(stockMovements.ownerId, ctx.user.id),
          input?.ingredientId ? eq(stockMovements.ingredientId, input.ingredientId) : undefined
        ),
        with: { ingredient: { columns: { id: true, name: true, unit: true } } },
        orderBy: [desc(stockMovements.createdAt)],
        limit: input?.limit ?? 50,
      });
      return moves;
    }),

  // ── Production history ─────────────────────────────────────────────────────

  getProductionHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.productionBatches.findMany({
        where: eq(productionBatches.ownerId, ctx.user.id),
        with: { recipe: { columns: { id: true, name: true } } },
        orderBy: [desc(productionBatches.producedAt)],
        limit: input?.limit ?? 20,
      });
    }),

  // ── Weekly waste report ────────────────────────────────────────────────────

  getWasteReport: protectedProcedure
    .input(z.object({ weeksBack: z.number().min(1).max(12).default(1) }).optional())
    .query(async ({ ctx, input }) => {
      return inventoryService.getWasteReport(ctx.user.id, input?.weeksBack ?? 1);
    }),

  getWasteLogs: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.wasteLogs.findMany({
        where: eq(wasteLogs.ownerId, ctx.user.id),
        with: {
          ingredient: { columns: { id: true, name: true, unit: true } },
        },
        orderBy: [desc(wasteLogs.loggedAt)],
        limit: input?.limit ?? 50,
      });
    }),
});
