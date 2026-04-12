import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  purchaseOrders,
  purchaseOrderItems,
  shoppingListItems,
} from "@bakery/db";

const orderStatusSchema = z.enum([
  "draft",
  "sent",
  "confirmed",
  "delivered",
  "cancelled",
]);

const orderItemInputSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.string(),
  unit: z.string().min(1),
  unitPrice: z.string().optional().nullable(),
  totalPrice: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const purchaseOrdersRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z
        .object({
          supplierId: z.string().uuid().optional(),
          status: orderStatusSchema.optional(),
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { supplierId, status, limit = 20, offset = 0 } = input ?? {};
      return ctx.db.query.purchaseOrders.findMany({
        where: (po, { and, eq }) => {
          const conds = [];
          if (supplierId) conds.push(eq(po.supplierId, supplierId));
          if (status) conds.push(eq(po.status, status));
          return conds.length ? and(...conds) : undefined;
        },
        with: { supplier: true },
        limit,
        offset,
        orderBy: [desc(purchaseOrders.createdAt)],
      });
    }),

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, input),
        with: {
          supplier: true,
          items: { with: { ingredient: true } },
        },
      });
    }),

  create: publicProcedure
    .input(
      z.object({
        supplierId: z.string().uuid(),
        orderNumber: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        items: z.array(orderItemInputSchema).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            supplierId: input.supplierId,
            orderNumber: input.orderNumber,
            notes: input.notes,
            status: "draft",
          })
          .returning();
        await tx.insert(purchaseOrderItems).values(
          input.items.map((item) => ({ ...item, purchaseOrderId: po!.id }))
        );
        return po;
      });
    }),

  addItem: publicProcedure
    .input(
      z.object({
        purchaseOrderId: z.string().uuid(),
        item: orderItemInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [inserted] = await ctx.db
        .insert(purchaseOrderItems)
        .values({ ...input.item, purchaseOrderId: input.purchaseOrderId })
        .returning();
      return inserted;
    }),

  updateStatus: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: orderStatusSchema,
        deliveredAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(purchaseOrders)
        .set({
          status: input.status,
          deliveredAt: input.deliveredAt,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, input.id))
        .returning();
      return updated;
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(purchaseOrders)
        .where(eq(purchaseOrders.id, input));
      return { success: true };
    }),

  /** Generate a purchase order from unpurchased shopping list items for a given supplier. */
  generateFromShoppingList: publicProcedure
    .input(
      z.object({
        shoppingListId: z.string().uuid(),
        supplierId: z.string().uuid(),
        orderNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const listItems = await ctx.db.query.shoppingListItems.findMany({
        where: (sli, { and, eq, gt }) =>
          and(
            eq(sli.shoppingListId, input.shoppingListId),
            eq(sli.isPurchased, false),
            gt(sli.quantityToPurchase, "0")
          ),
        with: {
          ingredient: {
            with: {
              supplierPrices: {
                where: (sp, { and, eq }) =>
                  and(
                    eq(sp.supplierId, input.supplierId),
                    eq(sp.isPreferred, true)
                  ),
                limit: 1,
              },
            },
          },
        },
      });

      if (!listItems.length) {
        throw new Error("No unpurchased items to order for this supplier");
      }

      return ctx.db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            supplierId: input.supplierId,
            orderNumber: input.orderNumber,
            status: "draft",
            notes: `Generated from shopping list ${input.shoppingListId}`,
          })
          .returning();

        await tx.insert(purchaseOrderItems).values(
          listItems.map((li) => {
            const price = li.ingredient.supplierPrices[0];
            const qty = li.quantityToPurchase;
            const unitPrice = price?.pricePerUnit ?? null;
            const totalPrice =
              unitPrice && qty
                ? String(
                    parseFloat(unitPrice) * parseFloat(qty)
                  )
                : null;
            return {
              purchaseOrderId: po!.id,
              ingredientId: li.ingredientId,
              quantity: qty,
              unit: li.unit,
              unitPrice,
              totalPrice,
            };
          })
        );

        return po;
      });
    }),
});
