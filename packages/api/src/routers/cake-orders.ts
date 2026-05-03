import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { cakeOrders, recipeIngredients, shoppingLists, shoppingListItems } from "@bakery/db";

const statusSchema = z.enum(["pending", "planned", "in_progress", "completed", "cancelled"]);

export const cakeOrdersRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        status: statusSchema.optional(),
        limit:  z.number().min(1).max(200).default(100),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const { status, limit = 100 } = input ?? {};
      return ctx.db.query.cakeOrders.findMany({
        where: and(
          eq(cakeOrders.ownerId, ctx.user.id),
          status ? eq(cakeOrders.status, status) : undefined,
        ),
        with: { recipe: { columns: { id: true, name: true, yieldAmount: true, yieldUnit: true } } },
        orderBy: [desc(cakeOrders.dueDate), desc(cakeOrders.createdAt)],
        limit,
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        customerName:   z.string().optional().nullable(),
        customerEmail:  z.string().email().optional().nullable(),
        recipeId:       z.string().uuid().optional().nullable(),
        quantity:       z.string().min(1),
        dueDate:        z.string().optional().nullable(),
        notes:          z.string().optional().nullable(),
        cakeStyle:      z.string().optional().nullable(),
        cakeFormat:     z.string().optional().nullable(),
        spongeFlavours: z.string().optional().nullable(),
        frostings:      z.string().optional().nullable(),
        fillings:       z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .insert(cakeOrders)
        .values({ ...input, ownerId: ctx.user.id, status: "pending" })
        .returning();
      return order;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id:            z.string().uuid(),
        status:        statusSchema.optional(),
        paymentStatus: z.enum(["pending", "paid", "unpaid", "refunded"]).optional(),
        salePrice:      z.string().optional().nullable(),
        notes:          z.string().optional().nullable(),
        dueDate:        z.string().optional().nullable(),
        quantity:       z.string().optional(),
        customerName:   z.string().optional().nullable(),
        customerEmail:  z.string().email().optional().nullable(),
        recipeId:       z.string().uuid().optional().nullable(),
        cakeStyle:      z.string().optional().nullable(),
        cakeFormat:     z.string().optional().nullable(),
        spongeFlavours: z.string().optional().nullable(),
        frostings:      z.string().optional().nullable(),
        fillings:       z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(cakeOrders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(cakeOrders.id, id), eq(cakeOrders.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(cakeOrders)
        .where(and(eq(cakeOrders.id, input), eq(cakeOrders.ownerId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Aggregate ingredients across selected orders and create a shopping list.
   * Uses each order's recipe yield to calculate the exact ingredient multiplier.
   * Marks included orders as "planned".
   */
  generateShoppingList: protectedProcedure
    .input(
      z.object({
        orderIds: z.array(z.string().uuid()).min(1),
        listName: z.string().min(1),
        dueDate:  z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load selected orders with their recipe yield info
      const orders = await ctx.db.query.cakeOrders.findMany({
        where: and(
          inArray(cakeOrders.id, input.orderIds),
          eq(cakeOrders.ownerId, ctx.user.id),
        ),
        with: {
          recipe: {
            columns: { id: true, yieldAmount: true },
          },
        },
      });

      if (orders.length === 0) throw new Error("No orders found.");

      // ingredientId::unit → { quantityNeeded: number }
      const ingredientMap = new Map<string, { unit: string; quantityNeeded: number }>();

      for (const order of orders) {
        // Skip orders that haven't been linked to a recipe yet (e.g. unmatched Shopify orders)
        if (!order.recipe) continue;

        const recipeYield  = parseFloat(order.recipe.yieldAmount) || 1;
        const orderQty     = parseFloat(order.quantity) || 1;
        // How many times to run this recipe to fulfil the order
        const multiplier   = orderQty / recipeYield;

        const ings = await ctx.db.query.recipeIngredients.findMany({
          where: eq(recipeIngredients.recipeId, order.recipe.id),
        });

        for (const ri of ings) {
          const key     = `${ri.ingredientId}::${ri.unit}`;
          const needed  = parseFloat(ri.quantity) * multiplier;
          const current = ingredientMap.get(key);
          if (current) { current.quantityNeeded += needed; }
          else { ingredientMap.set(key, { unit: ri.unit, quantityNeeded: needed }); }
        }
      }

      // Build order summary for list name / notes
      const summary = orders
        .map((o) => `${o.quantity} × ${o.recipe?.yieldAmount ? `(×${(parseFloat(o.quantity) / parseFloat(o.recipe.yieldAmount)).toFixed(2)} batch) ` : ""}${o.customerName ? `for ${o.customerName}` : ""}`)
        .join(", ");

      return ctx.db.transaction(async (tx) => {
        // Create the shopping list
        const [list] = await tx
          .insert(shoppingLists)
          .values({
            name:     input.listName,
            dueDate:  input.dueDate,
            status:   "draft",
            notes:    `Auto-generated from ${orders.length} order(s). ${summary}`.slice(0, 500),
            ownerId:  ctx.user.id,
          })
          .returning();

        // Insert line items
        const items = Array.from(ingredientMap.entries()).map(([key, { unit, quantityNeeded }]) => {
          const [ingredientId] = key.split("::");
          const qty = parseFloat(quantityNeeded.toFixed(4));
          return {
            shoppingListId:     list!.id,
            ingredientId:       ingredientId!,
            quantityNeeded:     String(qty),
            unit,
            quantityOnHand:     "0",
            quantityToPurchase: String(qty),
          };
        });

        if (items.length) await tx.insert(shoppingListItems).values(items);

        // Mark orders as planned
        await tx
          .update(cakeOrders)
          .set({ status: "planned", updatedAt: new Date() })
          .where(inArray(cakeOrders.id, input.orderIds));

        return { list, itemCount: items.length };
      });
    }),
});
