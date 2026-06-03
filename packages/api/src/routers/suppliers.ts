import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { suppliers, supplierPrices, ingredients } from "@bakery/db";
import {
  shortText,
  longText,
  emailField,
  phoneField,
  nonNegativeDecimalString,
} from "../lib/validation";

const supplierInputSchema = z.object({
  name: shortText({ min: 1 }),
  contactName: shortText().optional().nullable(),
  email: emailField().optional().nullable(),
  phone: phoneField().optional().nullable(),
  address: longText().optional().nullable(),
  notes: longText().optional().nullable(),
  isActive: z.boolean().default(true),
});

const supplierPriceInputSchema = z.object({
  supplierId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  pricePerUnit: nonNegativeDecimalString(),
  unit: z.string().min(1).max(32),
  minOrderQty: nonNegativeDecimalString().optional().nullable(),
  leadTimeDays: z.number().int().positive().max(3650).optional().nullable(),
  isPreferred: z.boolean().default(false),
  validFrom: z.string().max(32).optional().nullable(),
  validTo: z.string().max(32).optional().nullable(),
});

export const suppliersRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const { isActive, limit = 50, offset = 0 } = input ?? {};
      const conditions: ReturnType<typeof eq>[] = [
        eq(suppliers.ownerId, ctx.user.id),
      ];
      if (isActive !== undefined) conditions.push(eq(suppliers.isActive, isActive));
      return ctx.db.query.suppliers.findMany({
        where: and(...conditions),
        limit,
        offset,
        orderBy: (s, { asc }) => [asc(s.name)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      return ctx.db.query.suppliers.findFirst({
        where: and(eq(suppliers.id, input), eq(suppliers.ownerId, ctx.user.id)),
        with: { supplierPrices: { with: { ingredient: true }, orderBy: (sp, { asc }) => [asc(sp.unit)] } },
      });
    }),

  create: protectedProcedure
    .input(supplierInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [supplier] = await ctx.db
        .insert(suppliers)
        .values({ ...input, ownerId: ctx.user.id })
        .returning();
      return supplier;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: supplierInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(suppliers)
        .set({ ...input.data, updatedAt: new Date() })
        .where(and(eq(suppliers.id, input.id), eq(suppliers.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(suppliers).where(and(eq(suppliers.id, input), eq(suppliers.ownerId, ctx.user.id)));
      return { success: true };
    }),

  getPrices: publicProcedure
    .input(z.object({ supplierId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      // Verify supplier ownership first
      const supplier = await ctx.db.query.suppliers.findFirst({
        where: and(eq(suppliers.id, input.supplierId), eq(suppliers.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!supplier) return [];
      return ctx.db.query.supplierPrices.findMany({
        where: eq(supplierPrices.supplierId, input.supplierId),
        with: { ingredient: true },
        orderBy: (sp, { asc }) => [asc(sp.unit)],
      });
    }),

  upsertPrice: protectedProcedure
    .input(supplierPriceInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify both supplier and ingredient belong to the caller before
      // touching supplier_prices. Otherwise a tenant can overwrite another
      // bakery's prices (cross-tenant write / poisoning COGS calculations).
      const [supplier, ingredient] = await Promise.all([
        ctx.db.query.suppliers.findFirst({
          where: and(eq(suppliers.id, input.supplierId), eq(suppliers.ownerId, ctx.user.id)),
          columns: { id: true },
        }),
        ctx.db.query.ingredients.findFirst({
          where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
          columns: { id: true },
        }),
      ]);
      if (!supplier || !ingredient) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Supplier or ingredient not found." });
      }

      const existing = await ctx.db.query.supplierPrices.findFirst({
        where: and(eq(supplierPrices.supplierId, input.supplierId), eq(supplierPrices.ingredientId, input.ingredientId)),
      });
      if (existing) {
        const [updated] = await ctx.db
          .update(supplierPrices)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(supplierPrices.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await ctx.db.insert(supplierPrices).values(input).returning();
      return inserted;
    }),

  deletePrice: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const ownedSupplierIds = ctx.db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.ownerId, ctx.user.id));
      await ctx.db.delete(supplierPrices).where(and(eq(supplierPrices.id, input), inArray(supplierPrices.supplierId, ownedSupplierIds)));
      return { success: true };
    }),

});
