import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
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
  // Categories are global reference data — no owner filter needed
  getCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.recipeCategories.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    });
  }),

  createCategory: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.isAnonymous) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create an account to manage categories." });
      }
      const [category] = await ctx.db
        .insert(recipeCategories)
        .values({ name: input.name.trim() })
        .returning();
      return category;
    }),

  deleteCategory: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.isAnonymous) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create an account to manage categories." });
      }
      await ctx.db
        .delete(recipeCategories)
        .where(eq(recipeCategories.id, input));
      return { success: true };
    }),

  getAll: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        categoryId: z.string().uuid().optional(),
        isActive: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const { limit = 20, offset = 0, categoryId, isActive } = input ?? {};
      const conditions: ReturnType<typeof eq>[] = [
        eq(recipes.ownerId, ctx.user.id),
      ];
      if (categoryId) conditions.push(eq(recipes.categoryId, categoryId));
      if (isActive !== undefined) conditions.push(eq(recipes.isActive, isActive));
      return ctx.db.query.recipes.findMany({
        where: and(...conditions),
        with: { category: true },
        limit,
        offset,
        orderBy: [desc(recipes.createdAt)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      return ctx.db.query.recipes.findFirst({
        where: and(eq(recipes.id, input), eq(recipes.ownerId, ctx.user.id)),
        with: {
          category: true,
          ingredients: {
            with: {
              ingredient: { with: { allergens: { with: { allergen: true } } } },
            },
            orderBy: (ri, { asc }) => [asc(ri.sortOrder)],
          },
        },
      });
    }),

  create: protectedProcedure
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
          .values({ ...input.recipe, ownerId: ctx.user.id })
          .returning();
        if (input.ingredients?.length) {
          await tx.insert(recipeIngredients).values(
            input.ingredients.map((ing) => ({ ...ing, recipeId: recipe!.id }))
          );
        }
        return recipe;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: recipeInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(recipes)
        .set({ ...input.data, updatedAt: new Date() })
        .where(and(eq(recipes.id, input.id), eq(recipes.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(recipes)
        .where(and(eq(recipes.id, input), eq(recipes.ownerId, ctx.user.id)));
      return { success: true };
    }),

  addIngredient: protectedProcedure
    .input(z.object({ recipeId: z.string().uuid(), ingredient: recipeIngredientInputSchema }))
    .mutation(async ({ ctx, input }) => {
      // Verify the recipe belongs to this user before adding
      const recipe = await ctx.db.query.recipes.findFirst({
        where: and(eq(recipes.id, input.recipeId), eq(recipes.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!recipe) throw new Error("Recipe not found.");
      const [inserted] = await ctx.db
        .insert(recipeIngredients)
        .values({ ...input.ingredient, recipeId: input.recipeId })
        .returning();
      return inserted;
    }),

  updateIngredient: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: recipeIngredientInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(recipeIngredients)
        .set(input.data)
        .where(eq(recipeIngredients.id, input.id))
        .returning();
      return updated;
    }),

  removeIngredient: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(recipeIngredients).where(eq(recipeIngredients.id, input));
      return { success: true };
    }),

  calculateCost: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      const recipe = await ctx.db.query.recipes.findFirst({
        where: and(eq(recipes.id, input), eq(recipes.ownerId, ctx.user.id)),
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
        const unitCost = preferredPrice ? parseFloat(preferredPrice.pricePerUnit) : 0;
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
