import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { purchaseOrders, purchaseOrderItems, shoppingListItems } from "@bakery/db";

const orderStatusSchema = z.enum(["draft", "sent", "confirmed", "delivered", "cancelled"]);

const orderItemInputSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.string(),
  unit: z.string().min(1),
  unitPrice: z.string().optional().nullable(),
  totalPrice: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const purchaseOrdersRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(
      z.object({
        supplierId: z.string().uuid().optional(),
        status: orderStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { supplierId, status, limit = 20, offset = 0 } = input ?? {};
      const conditions: ReturnType<typeof eq>[] = [
        eq(purchaseOrders.ownerId, ctx.user.id),
      ];
      if (supplierId) conditions.push(eq(purchaseOrders.supplierId, supplierId));
      if (status)     conditions.push(eq(purchaseOrders.status, status));
      return ctx.db.query.purchaseOrders.findMany({
        where: and(...conditions),
        with: { supplier: true },
        limit,
        offset,
        orderBy: [desc(purchaseOrders.createdAt)],
      });
    }),

  getById: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.purchaseOrders.findFirst({
        where: and(eq(purchaseOrders.id, input), eq(purchaseOrders.ownerId, ctx.user.id)),
        with: { supplier: true, items: { with: { ingredient: true } } },
      });
    }),

  create: protectedProcedure
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
          .values({ supplierId: input.supplierId, orderNumber: input.orderNumber, notes: input.notes, status: "draft", ownerId: ctx.user.id })
          .returning();
        if (input.items.length) {
          await tx.insert(purchaseOrderItems).values(
            input.items.map((item) => ({ ...item, purchaseOrderId: po!.id }))
          );
        }
        return po;
      });
    }),

  addItem: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid(), item: orderItemInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const po = await ctx.db.query.purchaseOrders.findFirst({
        where: and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!po) throw new Error("Purchase order not found.");
      const [inserted] = await ctx.db
        .insert(purchaseOrderItems)
        .values({ ...input.item, purchaseOrderId: input.purchaseOrderId })
        .returning();
      return inserted;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: orderStatusSchema, deliveredAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(purchaseOrders)
        .set({ status: input.status, deliveredAt: input.deliveredAt, updatedAt: new Date() })
        .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.ownerId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(purchaseOrders).where(and(eq(purchaseOrders.id, input), eq(purchaseOrders.ownerId, ctx.user.id)));
      return { success: true };
    }),

  generateFromShoppingList: protectedProcedure
    .input(z.object({ shoppingListId: z.string().uuid(), supplierId: z.string().uuid(), orderNumber: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const listItems = await ctx.db.query.shoppingListItems.findMany({
        where: (sli, { and, eq, gt }) => and(eq(sli.shoppingListId, input.shoppingListId), eq(sli.isPurchased, false), gt(sli.quantityToPurchase, "0")),
        with: { ingredient: { with: { supplierPrices: { where: (sp, { and, eq }) => and(eq(sp.supplierId, input.supplierId), eq(sp.isPreferred, true)), limit: 1 } } } },
      });
      if (!listItems.length) throw new Error("No unpurchased items to order for this supplier");

      return ctx.db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({ supplierId: input.supplierId, orderNumber: input.orderNumber, status: "draft", notes: `Generated from shopping list ${input.shoppingListId}`, ownerId: ctx.user.id })
          .returning();

        await tx.insert(purchaseOrderItems).values(
          listItems.map((li) => {
            const price = li.ingredient.supplierPrices[0];
            const qty = li.quantityToPurchase;
            const unitPrice = price?.pricePerUnit ?? null;
            const totalPrice = unitPrice && qty ? String(parseFloat(unitPrice) * parseFloat(qty)) : null;
            return { purchaseOrderId: po!.id, ingredientId: li.ingredientId, quantity: qty, unit: li.unit, unitPrice, totalPrice };
          })
        );
        return po;
      });
    }),
});
