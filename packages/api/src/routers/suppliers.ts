import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { suppliers, supplierPrices } from "@bakery/db";
import { getLocalStores } from "../services/kassalapp";

const supplierInputSchema = z.object({
  name: z.string().min(1).max(255),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

const supplierPriceInputSchema = z.object({
  supplierId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  pricePerUnit: z.string(),
  unit: z.string().min(1),
  minOrderQty: z.string().optional().nullable(),
  leadTimeDays: z.number().int().positive().optional().nullable(),
  isPreferred: z.boolean().default(false),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
});

export const suppliersRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(
      z.object({
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
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

  getById: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
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

  getPrices: protectedProcedure
    .input(z.object({ supplierId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
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
      await ctx.db.delete(supplierPrices).where(eq(supplierPrices.id, input));
      return { success: true };
    }),

  importLocalStores: protectedProcedure.mutation(async ({ ctx }) => {
    const apiKey = process.env.KASSALAPP_API_KEY;
    if (!apiKey) throw new Error("KASSALAPP_API_KEY is not configured");

    const stores = await getLocalStores(apiKey);
    let created = 0, updated = 0;

    for (const store of stores) {
      const existing = await ctx.db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.kassalappStoreId, store.id),
          eq(suppliers.ownerId, ctx.user.id)
        ),
      });

      if (existing) {
        await ctx.db
          .update(suppliers)
          .set({ name: store.name, address: store.address, updatedAt: new Date() })
          .where(eq(suppliers.id, existing.id));
        updated++;
      } else {
        await ctx.db.insert(suppliers).values({
          name: store.name,
          address: store.address,
          kassalappStoreId: store.id,
          kassalappGroup: store.group,
          isActive: false,
          ownerId: ctx.user.id,
        });
        created++;
      }
    }

    return { created, updated, total: stores.length };
  }),
});
