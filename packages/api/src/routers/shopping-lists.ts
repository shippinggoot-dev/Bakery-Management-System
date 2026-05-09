import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { shoppingLists, shoppingListItems, recipeIngredients, ingredientSuppliers } from "@bakery/db";

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
      z.object({
        status: listStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const { status, limit = 20, offset = 0 } = input ?? {};
      const conditions: ReturnType<typeof eq>[] = [
        eq(shoppingLists.ownerId, ctx.user.id),
      ];
      if (status) conditions.push(eq(shoppingLists.status, status));
      return ctx.db.query.shoppingLists.findMany({
        where: and(...conditions),
        limit,
        offset,
        orderBy: [desc(shoppingLists.createdAt)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      return ctx.db.query.shoppingLists.findFirst({
        where: and(eq(shoppingLists.id, input), eq(shoppingLists.ownerId, ctx.user.id)),
        with: {
          items: {
            with: {
              ingredient: {
                with: {
                  category: true,
                  ingredientSuppliers: {
                    where: eq(ingredientSuppliers.isPreferred, true),
                    with: { supplier: true },
                    limit: 1,
                  },
                },
              },
            },
            orderBy: (sli, { asc }) => [asc(sli.ingredientId)],
          },
        },
      });
    }),

  create: protectedProcedure
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
          .values({ name: input.name, description: input.description, dueDate: input.dueDate, notes: input.notes, status: "draft", ownerId: ctx.user.id })
          .returning();
        if (input.items?.length) {
          await tx.insert(shoppingListItems).values(
            input.items.map((item) => ({ ...item, shoppingListId: list!.id }))
          );
        }
        return list;
      });
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: listStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(shoppingLists)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(shoppingLists.id, input.id), eq(shoppingLists.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  addItem: protectedProcedure
    .input(z.object({ shoppingListId: z.string().uuid(), item: listItemInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: and(eq(shoppingLists.id, input.shoppingListId), eq(shoppingLists.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!list) throw new Error("Shopping list not found.");
      const [inserted] = await ctx.db
        .insert(shoppingListItems)
        .values({ ...input.item, shoppingListId: input.shoppingListId })
        .returning();
      return inserted;
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: listItemInputSchema.omit({ ingredientId: true }).extend({ isPurchased: z.boolean().optional() }).partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ownedListIds = ctx.db.select({ id: shoppingLists.id }).from(shoppingLists).where(eq(shoppingLists.ownerId, ctx.user.id));
      const [updated] = await ctx.db
        .update(shoppingListItems)
        .set(input.data)
        .where(and(eq(shoppingListItems.id, input.id), inArray(shoppingListItems.shoppingListId, ownedListIds)))
        .returning();
      return updated;
    }),

  markItemPurchased: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isPurchased: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ownedListIds = ctx.db.select({ id: shoppingLists.id }).from(shoppingLists).where(eq(shoppingLists.ownerId, ctx.user.id));
      const [updated] = await ctx.db
        .update(shoppingListItems)
        .set({ isPurchased: input.isPurchased })
        .where(and(eq(shoppingListItems.id, input.id), inArray(shoppingListItems.shoppingListId, ownedListIds)))
        .returning();
      return updated;
    }),

  removeItem: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const ownedListIds = ctx.db.select({ id: shoppingLists.id }).from(shoppingLists).where(eq(shoppingLists.ownerId, ctx.user.id));
      await ctx.db.delete(shoppingListItems).where(and(eq(shoppingListItems.id, input), inArray(shoppingListItems.shoppingListId, ownedListIds)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(shoppingLists).where(and(eq(shoppingLists.id, input), eq(shoppingLists.ownerId, ctx.user.id)));
      return { success: true };
    }),

  generateFromRecipes: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        dueDate: z.string().optional(),
        recipes: z.array(z.object({ recipeId: z.string().uuid(), multiplier: z.number().positive().default(1) })),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ingredientMap = new Map<string, { unit: string; quantityNeeded: number }>();

      for (const { recipeId, multiplier } of input.recipes) {
        const ings = await ctx.db.query.recipeIngredients.findMany({
          where: eq(recipeIngredients.recipeId, recipeId),
        });
        for (const ri of ings) {
          const key = `${ri.ingredientId}::${ri.unit}`;
          const existing = ingredientMap.get(key);
          const qty = parseFloat(ri.quantity) * multiplier;
          if (existing) { existing.quantityNeeded += qty; }
          else { ingredientMap.set(key, { unit: ri.unit, quantityNeeded: qty }); }
        }
      }

      return ctx.db.transaction(async (tx) => {
        const [list] = await tx
          .insert(shoppingLists)
          .values({ name: input.name, dueDate: input.dueDate, status: "draft", notes: `Generated from ${input.recipes.length} recipe(s)`, ownerId: ctx.user.id })
          .returning();

        const items = Array.from(ingredientMap.entries()).map(([key, { unit, quantityNeeded }]) => {
          const [ingredientId] = key.split("::");
          return { shoppingListId: list!.id, ingredientId: ingredientId!, quantityNeeded: String(quantityNeeded), unit, quantityOnHand: "0", quantityToPurchase: String(quantityNeeded) };
        });

        if (items.length) await tx.insert(shoppingListItems).values(items);
        return list;
      });
    }),
});
