import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  shoppingLists,
  shoppingListItems,
  recipeIngredients,
} from "@bakery/db";

const listStatusSchema = z.enum(["draft", "in_progress", "completed"]);

const listItemInputSchema = z.object({
  ingredientId: z.string().uuid(),
  quantityNeeded: z.string(),
  unit: z.string().min(1),
  quantityOnHand: z.string().default("0"),
  quantityToPurchase: z.string().default("0"),
  notes: z.string().optional().nullable(),
});

export const shoppingListsRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z
        .object({
          status: listStatusSchema.optional(),
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { status, limit = 20, offset = 0 } = input ?? {};
      return ctx.db.query.shoppingLists.findMany({
        where: status ? eq(shoppingLists.status, status) : undefined,
        limit,
        offset,
        orderBy: [desc(shoppingLists.createdAt)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input),
        with: {
          items: {
            with: { ingredient: { with: { category: true } } },
            orderBy: (sli, { asc }) => [asc(sli.ingredientId)],
          },
        },
      });
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        dueDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        items: z.array(listItemInputSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [list] = await tx
          .insert(shoppingLists)
          .values({
            name: input.name,
            description: input.description,
            dueDate: input.dueDate,
            notes: input.notes,
            status: "draft",
          })
          .returning();
        if (input.items?.length) {
          await tx.insert(shoppingListItems).values(
            input.items.map((item) => ({
              ...item,
              shoppingListId: list!.id,
            }))
          );
        }
        return list;
      });
    }),

  updateStatus: publicProcedure
    .input(z.object({ id: z.string().uuid(), status: listStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(shoppingLists)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(shoppingLists.id, input.id))
        .returning();
      return updated;
    }),

  addItem: publicProcedure
    .input(z.object({ shoppingListId: z.string().uuid(), item: listItemInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const [inserted] = await ctx.db
        .insert(shoppingListItems)
        .values({ ...input.item, shoppingListId: input.shoppingListId })
        .returning();
      return inserted;
    }),

  updateItem: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: listItemInputSchema
          .omit({ ingredientId: true })
          .extend({ isPurchased: z.boolean().optional() })
          .partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(shoppingListItems)
        .set(input.data)
        .where(eq(shoppingListItems.id, input.id))
        .returning();
      return updated;
    }),

  markItemPurchased: publicProcedure
    .input(z.object({ id: z.string().uuid(), isPurchased: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(shoppingListItems)
        .set({ isPurchased: input.isPurchased })
        .where(eq(shoppingListItems.id, input.id))
        .returning();
      return updated;
    }),

  removeItem: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(shoppingListItems)
        .where(eq(shoppingListItems.id, input));
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(shoppingLists).where(eq(shoppingLists.id, input));
      return { success: true };
    }),

  /**
   * Generate a shopping list from a set of recipes with multipliers.
   * Aggregates ingredient quantities across recipes.
   */
  generateFromRecipes: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        dueDate: z.string().optional(),
        recipes: z.array(
          z.object({
            recipeId: z.string().uuid(),
            multiplier: z.number().positive().default(1),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Aggregate ingredients across all recipes
      const ingredientMap = new Map<
        string,
        { unit: string; quantityNeeded: number }
      >();

      for (const { recipeId, multiplier } of input.recipes) {
        const ings = await ctx.db.query.recipeIngredients.findMany({
          where: eq(recipeIngredients.recipeId, recipeId),
        });
        for (const ri of ings) {
          const key = `${ri.ingredientId}::${ri.unit}`;
          const existing = ingredientMap.get(key);
          const qty = parseFloat(ri.quantity) * multiplier;
          if (existing) {
            existing.quantityNeeded += qty;
          } else {
            ingredientMap.set(key, { unit: ri.unit, quantityNeeded: qty });
          }
        }
      }

      return ctx.db.transaction(async (tx) => {
        const [list] = await tx
          .insert(shoppingLists)
          .values({
            name: input.name,
            dueDate: input.dueDate,
            status: "draft",
            notes: `Generated from ${input.recipes.length} recipe(s)`,
          })
          .returning();

        const items = Array.from(ingredientMap.entries()).map(
          ([key, { unit, quantityNeeded }]) => {
            const [ingredientId] = key.split("::");
            return {
              shoppingListId: list!.id,
              ingredientId: ingredientId!,
              quantityNeeded: String(quantityNeeded),
              unit,
              quantityOnHand: "0",
              quantityToPurchase: String(quantityNeeded),
            };
          }
        );

        if (items.length) {
          await tx.insert(shoppingListItems).values(items);
        }
        return list;
      });
    }),
});
