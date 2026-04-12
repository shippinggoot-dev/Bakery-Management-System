import { z } from "zod";
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
      const [category] = await ctx.db
        .insert(recipeCategories)
        .values({ name: input.name.trim() })
        .returning();
      return category;
    }),

  deleteCategory: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
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

  parseFromText: protectedProcedure
    .input(z.object({ text: z.string().min(10).max(30000) }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

      const Anthropic = await import("@anthropic-ai/sdk");
      const client = new Anthropic.default({ apiKey });

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `Extract this recipe into JSON. Return ONLY valid JSON — no explanation, no markdown, no code fences.

Schema (all fields required, use null for missing values):
{
  "name": string,
  "description": string | null,
  "category": "Sponges" | "Fillings" | "Frostings" | "Mousse" | "Brownie" | "Cookies" | "Cupcakes" | "Entremet" | null,
  "yieldAmount": string,
  "yieldUnit": string,
  "prepTimeMinutes": number | null,
  "bakeTimeMinutes": number | null,
  "ingredients": [{ "name": string, "quantity": string, "unit": string, "notes": string | null }],
  "instructions": string | null,
  "notes": string | null
}

Rules:
- quantities must be numbers as strings (e.g. "250", "1.5") — no fractions like "1/2" (convert to "0.5")
- units should be standard (g, kg, ml, L, tsp, tbsp, piece, cup)
- yieldUnit: singular noun (e.g. "bun", "loaf", "slice")
- instructions: preserve numbered steps, join with newlines

Recipe text:
${input.text}`,
          },
        ],
      });

      const raw = message.content[0];
      if (raw.type !== "text") throw new Error("Unexpected AI response format.");

      try {
        return JSON.parse(raw.text) as {
          name: string;
          description: string | null;
          category: string | null;
          yieldAmount: string;
          yieldUnit: string;
          prepTimeMinutes: number | null;
          bakeTimeMinutes: number | null;
          ingredients: { name: string; quantity: string; unit: string; notes: string | null }[];
          instructions: string | null;
          notes: string | null;
        };
      } catch {
        throw new Error("AI returned invalid JSON. Please try again.");
      }
    }),
});
