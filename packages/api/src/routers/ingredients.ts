import { z } from "zod";
import { eq, and, like } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { ingredients, ingredientAllergens, ingredientCategories, allergens, ingredientSuppliers, supplierPrices, suppliers } from "@bakery/db";
import {
  shortText,
  longText,
  searchQuery,
  nonNegativeDecimalString,
  stripLikeWildcards,
} from "../lib/validation";

const ingredientInputSchema = z.object({
  name: shortText({ min: 1 }),
  unit: z.string().min(1).max(32),
  categoryId: z.string().uuid().optional().nullable(),
  notes: longText().optional().nullable(),
  // Nutrition — per 100 g (all optional, non-negative numbers as strings)
  caloriesKcal:  nonNegativeDecimalString().optional().nullable(),
  proteinG:      nonNegativeDecimalString().optional().nullable(),
  fatTotalG:     nonNegativeDecimalString().optional().nullable(),
  fatSaturatedG: nonNegativeDecimalString().optional().nullable(),
  carbsTotalG:   nonNegativeDecimalString().optional().nullable(),
  carbsSugarsG:  nonNegativeDecimalString().optional().nullable(),
  fiberG:        nonNegativeDecimalString().optional().nullable(),
  sodiumMg:      nonNegativeDecimalString().optional().nullable(),
  gramsPerUnit:  nonNegativeDecimalString().optional().nullable(),
});

export const ingredientsRouter = createTRPCRouter({
  // Categories are per-tenant — each bakery curates its own.
  getCategories: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    return ctx.db.query.ingredientCategories.findMany({
      where: eq(ingredientCategories.ownerId, ctx.user.id),
      orderBy: (c, { asc }) => [asc(c.name)],
    });
  }),

  createCategory: protectedProcedure
    .input(z.object({ name: shortText({ min: 1 }).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const [category] = await ctx.db
        .insert(ingredientCategories)
        .values({ name: input.name.trim(), ownerId: ctx.user.id })
        .returning();
      return category;
    }),

  getAllAllergens: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.allergens.findMany({
      orderBy: (a, { asc }) => [asc(a.name)],
    });
  }),

  getAll: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
        categoryId: z.string().uuid().optional(),
        search: searchQuery().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const { limit = 50, offset = 0, categoryId, search } = input ?? {};
      const conditions: ReturnType<typeof eq>[] = [
        eq(ingredients.ownerId, ctx.user.id),
      ];
      if (categoryId) conditions.push(eq(ingredients.categoryId, categoryId));
      if (search) {
        // Strip LIKE wildcards from user input so "%%%%a%%%%" can't force a
        // quadratic table scan on the ingredient catalog.
        const safe = stripLikeWildcards(search);
        conditions.push(like(ingredients.name, `%${safe}%`));
      }
      return ctx.db.query.ingredients.findMany({
        where: and(...conditions),
        with: {
          category: true,
          allergens: { with: { allergen: true } },
          supplierPrices: {
            where: eq(supplierPrices.isPreferred, true),
            with: { supplier: true },
            limit: 1,
          },
          ingredientSuppliers: {
            where: eq(ingredientSuppliers.isPreferred, true),
            with: { supplier: true },
            limit: 1,
          },
        },
        limit,
        offset,
        orderBy: (ing, { asc }) => [asc(ing.name)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      return ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input), eq(ingredients.ownerId, ctx.user.id)),
        with: {
          category: true,
          allergens: { with: { allergen: true } },
          supplierPrices: { with: { supplier: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        ingredient: ingredientInputSchema,
        allergenIds: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [ingredient] = await tx
          .insert(ingredients)
          .values({ ...input.ingredient, ownerId: ctx.user.id })
          .returning();
        if (input.allergenIds?.length) {
          await tx.insert(ingredientAllergens).values(
            input.allergenIds.map((allergenId) => ({
              ingredientId: ingredient!.id,
              allergenId,
            }))
          );
        }
        return ingredient;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: ingredientInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(ingredients)
        .set({ ...input.data, updatedAt: new Date() })
        .where(and(eq(ingredients.id, input.id), eq(ingredients.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(ingredients)
        .where(and(eq(ingredients.id, input), eq(ingredients.ownerId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Set the preferred supplier for an ingredient. Unmarks any other
   * preferred row for the same ingredient. Pass supplierId=null to clear.
   *
   * Drives the auto-PO logic in inventoryService.checkReorder, the inline
   * "Reorder" button on the inventory list, and the supplier-grouped
   * shopping list view.
   */
  setPreferredSupplier: protectedProcedure
    .input(
      z.object({
        ingredientId: z.string().uuid(),
        supplierId:   z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the ingredient belongs to this workspace
      const ing = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!ing) throw new Error("Ingredient not found.");

      // If a supplier was passed, verify it belongs to this workspace too
      if (input.supplierId) {
        const sup = await ctx.db.query.suppliers.findFirst({
          where: and(eq(suppliers.id, input.supplierId), eq(suppliers.ownerId, ctx.user.id)),
          columns: { id: true },
        });
        if (!sup) throw new Error("Supplier not found.");
      }

      return ctx.db.transaction(async (tx) => {
        // Clear any existing preferred flag for this ingredient
        await tx
          .update(ingredientSuppliers)
          .set({ isPreferred: false, updatedAt: new Date() })
          .where(
            and(
              eq(ingredientSuppliers.ingredientId, input.ingredientId),
              eq(ingredientSuppliers.isPreferred, true)
            )
          );

        if (!input.supplierId) {
          return { ingredientId: input.ingredientId, supplierId: null };
        }

        // Upsert (ingredientId, supplierId) → preferred
        const existing = await tx.query.ingredientSuppliers.findFirst({
          where: and(
            eq(ingredientSuppliers.ingredientId, input.ingredientId),
            eq(ingredientSuppliers.supplierId, input.supplierId)
          ),
        });
        if (existing) {
          await tx
            .update(ingredientSuppliers)
            .set({ isPreferred: true, updatedAt: new Date() })
            .where(eq(ingredientSuppliers.id, existing.id));
        } else {
          await tx.insert(ingredientSuppliers).values({
            ingredientId: input.ingredientId,
            supplierId:   input.supplierId,
            isPreferred:  true,
          });
        }
        return { ingredientId: input.ingredientId, supplierId: input.supplierId };
      });
    }),

  setAllergens: protectedProcedure
    .input(z.object({ ingredientId: z.string().uuid(), allergenIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before modifying
      const ingredient = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!ingredient) throw new Error("Ingredient not found.");
      return ctx.db.transaction(async (tx) => {
        await tx.delete(ingredientAllergens).where(eq(ingredientAllergens.ingredientId, input.ingredientId));
        if (input.allergenIds.length) {
          await tx.insert(ingredientAllergens).values(
            input.allergenIds.map((allergenId) => ({ ingredientId: input.ingredientId, allergenId }))
          );
        }
        return { success: true };
      });
    }),
});
