import { z } from "zod";
import { eq, and, like } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { ingredients, ingredientAllergens, ingredientCategories, allergens } from "@bakery/db";

const ingredientInputSchema = z.object({
  name: z.string().min(1).max(255),
  unit: z.string().min(1),
  categoryId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const ingredientsRouter = createTRPCRouter({
  getCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.ingredientCategories.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    });
  }),

  getAllAllergens: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.allergens.findMany({
      orderBy: (a, { asc }) => [asc(a.name)],
    });
  }),

  getAll: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(200).default(50),
          offset: z.number().min(0).default(0),
          categoryId: z.string().uuid().optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { limit = 50, offset = 0, categoryId, search } = input ?? {};
      const conditions = [];
      if (categoryId) conditions.push(eq(ingredients.categoryId, categoryId));
      if (search) conditions.push(like(ingredients.name, `%${search}%`));
      return ctx.db.query.ingredients.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          category: true,
          allergens: { with: { allergen: true } },
        },
        limit,
        offset,
        orderBy: (ing, { asc }) => [asc(ing.name)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.ingredients.findFirst({
        where: eq(ingredients.id, input),
        with: {
          category: true,
          allergens: { with: { allergen: true } },
          supplierPrices: { with: { supplier: true } },
        },
      });
    }),

  create: publicProcedure
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
          .values(input.ingredient)
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

  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: ingredientInputSchema.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(ingredients)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(ingredients.id, input.id))
        .returning();
      return updated;
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(ingredients).where(eq(ingredients.id, input));
      return { success: true };
    }),

  /** Replace the full set of allergens for an ingredient. */
  setAllergens: publicProcedure
    .input(
      z.object({
        ingredientId: z.string().uuid(),
        allergenIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        await tx
          .delete(ingredientAllergens)
          .where(eq(ingredientAllergens.ingredientId, input.ingredientId));
        if (input.allergenIds.length) {
          await tx.insert(ingredientAllergens).values(
            input.allergenIds.map((allergenId) => ({
              ingredientId: input.ingredientId,
              allergenId,
            }))
          );
        }
        return { success: true };
      });
    }),
});
