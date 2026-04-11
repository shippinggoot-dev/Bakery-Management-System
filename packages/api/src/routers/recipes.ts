import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  recipes,
  recipeIngredients,
  recipeCategories,
  supplierPrices,
} from "@bakery/db";

const recipeInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  yieldAmount: z.string(),
  yieldUnit: z.string().min(1),
  prepTimeMinutes: z.number().int().positive().optional().nullable(),
  bakeTimeMinutes: z.number().int().positive().optional().nullable(),
  instructions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

const recipeIngredientInputSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.string(),
  unit: z.string().min(1),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export const recipesRouter = createTRPCRouter({
  getCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.recipeCategories.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    });
  }),

  getAll: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
          categoryId: z.string().uuid().optional(),
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { limit = 20, offset = 0, categoryId, isActive } = input ?? {};
      const conditions = [];
      if (categoryId) conditions.push(eq(recipes.categoryId, categoryId));
      if (isActive !== undefined) conditions.push(eq(recipes.isActive, isActive));
      return ctx.db.query.recipes.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { category: true },
        limit,
        offset,
        orderBy: [desc(recipes.createdAt)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.recipes.findFirst({
        where: eq(recipes.id, input),
        with: {
          category: true,
          ingredients: {
            with: {
              ingredient: {
                with: {
                  allergens: { with: { allergen: true } },
                },
              },
            },
            orderBy: (ri, { asc }) => [asc(ri.sortOrder)],
          },
        },
      });
    }),

  create: publicProcedure
    .input(
      z.object({
        recipe: recipeInputSchema,
        ingredients: z.array(recipeIngredientInputSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [recipe] = await tx
          .insert(recipes)
          .values(input.recipe)
          .returning();
        if (input.ingredients?.length) {
          await tx.insert(recipeIngredients).values(
            input.ingredients.map((ing) => ({ ...ing, recipeId: recipe!.id }))
          );
        }
        return recipe;
      });
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: recipeInputSchema.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(recipes)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(recipes.id, input.id))
        .returning();
      return updated;
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(recipes).where(eq(recipes.id, input));
      return { success: true };
    }),

  addIngredient: publicProcedure
    .input(
      z.object({
        recipeId: z.string().uuid(),
        ingredient: recipeIngredientInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [inserted] = await ctx.db
        .insert(recipeIngredients)
        .values({ ...input.ingredient, recipeId: input.recipeId })
        .returning();
      return inserted;
    }),

  updateIngredient: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: recipeIngredientInputSchema.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(recipeIngredients)
        .set(input.data)
        .where(eq(recipeIngredients.id, input.id))
        .returning();
      return updated;
    }),

  removeIngredient: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(recipeIngredients)
        .where(eq(recipeIngredients.id, input));
      return { success: true };
    }),

  /** Calculate the ingredient cost of a recipe using each ingredient's preferred supplier price. */
  calculateCost: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const recipe = await ctx.db.query.recipes.findFirst({
        where: eq(recipes.id, input),
        with: {
          ingredients: {
            with: {
              ingredient: {
                with: {
                  supplierPrices: {
                    where: (sp, { eq }) => eq(sp.isPreferred, true),
                    limit: 1,
                  },
                },
              },
            },
          },
        },
      });
      if (!recipe) return null;

      let totalCost = 0;
      const lineItems = recipe.ingredients.map((ri) => {
        const preferredPrice = ri.ingredient.supplierPrices[0];
        const unitCost = preferredPrice
          ? parseFloat(preferredPrice.pricePerUnit)
          : 0;
        const lineCost = unitCost * parseFloat(ri.quantity);
        totalCost += lineCost;
        return {
          ingredientName: ri.ingredient.name,
          quantity: ri.quantity,
          unit: ri.unit,
          unitCost,
          lineCost: parseFloat(lineCost.toFixed(4)),
          hasPricing: !!preferredPrice,
        };
      });

      return {
        recipeId: input,
        recipeName: recipe.name,
        yieldAmount: recipe.yieldAmount,
        yieldUnit: recipe.yieldUnit,
        lineItems,
        totalCost: parseFloat(totalCost.toFixed(4)),
      };
    }),
});
