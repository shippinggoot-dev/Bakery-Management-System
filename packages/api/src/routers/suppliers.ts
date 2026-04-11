import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
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
  getAll: publicProcedure
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { isActive, limit = 50, offset = 0 } = input ?? {};
      return ctx.db.query.suppliers.findMany({
        where: isActive !== undefined ? eq(suppliers.isActive, isActive) : undefined,
        limit,
        offset,
        orderBy: (s, { asc }) => [asc(s.name)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.suppliers.findFirst({
        where: eq(suppliers.id, input),
        with: {
          supplierPrices: {
            with: { ingredient: true },
            orderBy: (sp, { asc }) => [asc(sp.unit)],
          },
        },
      });
    }),

  create: publicProcedure
    .input(supplierInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [supplier] = await ctx.db
        .insert(suppliers)
        .values(input)
        .returning();
      return supplier;
    }),

  update: publicProcedure
    .input(z.object({ id: z.string().uuid(), data: supplierInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(suppliers)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(suppliers.id, input.id))
        .returning();
      return updated;
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(suppliers).where(eq(suppliers.id, input));
      return { success: true };
    }),

  getPrices: publicProcedure
    .input(z.object({ supplierId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.supplierPrices.findMany({
        where: eq(supplierPrices.supplierId, input.supplierId),
        with: { ingredient: true },
        orderBy: (sp, { asc }) => [asc(sp.unit)],
      });
    }),

  /** Create or update a supplier price record. */
  upsertPrice: publicProcedure
    .input(supplierPriceInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if a price record already exists for this supplier+ingredient
      const existing = await ctx.db.query.supplierPrices.findFirst({
        where: and(
          eq(supplierPrices.supplierId, input.supplierId),
          eq(supplierPrices.ingredientId, input.ingredientId)
        ),
      });
      if (existing) {
        const [updated] = await ctx.db
          .update(supplierPrices)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(supplierPrices.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await ctx.db
        .insert(supplierPrices)
        .values(input)
        .returning();
      return inserted;
    }),

  deletePrice: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(supplierPrices).where(eq(supplierPrices.id, input));
      return { success: true };
    }),

  /**
   * Fetches all grocery stores within 8 km of Fana from Kassal.app
   * and creates or updates them as suppliers.
   */
  importLocalStores: publicProcedure.mutation(async ({ ctx }) => {
    const apiKey = process.env.KASSALAPP_API_KEY;
    if (!apiKey) throw new Error("KASSALAPP_API_KEY is not configured");

    const stores = await getLocalStores(apiKey);
    let created = 0, updated = 0;

    for (const store of stores) {
      const existing = await ctx.db.query.suppliers.findFirst({
        where: eq(suppliers.kassalappStoreId, store.id),
      });

      if (existing) {
        // Keep the user's isActive choice — only refresh name and address
        await ctx.db
          .update(suppliers)
          .set({ name: store.name, address: store.address, updatedAt: new Date() })
          .where(eq(suppliers.id, existing.id));
        updated++;
      } else {
        // New stores start unselected so the user can pick which ones they use
        await ctx.db.insert(suppliers).values({
          name: store.name,
          address: store.address,
          kassalappStoreId: store.id,
          kassalappGroup: store.group,
          isActive: false,
        });
        created++;
      }
    }

    return { created, updated, total: stores.length };
  }),
});
