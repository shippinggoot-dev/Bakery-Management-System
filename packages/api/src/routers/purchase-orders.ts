import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  purchaseOrders,
  purchaseOrderItems,
  shoppingListItems,
  ingredients,
  ingredientSuppliers,
  suppliers,
  todos,
} from "@bakery/db";

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
  getAll: publicProcedure
    .input(
      z.object({
        supplierId: z.string().uuid().optional(),
        status: orderStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
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

  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
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
      const before = await ctx.db.query.purchaseOrders.findFirst({
        where: and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.ownerId, ctx.user.id)),
        with: { supplier: { columns: { name: true } } },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(purchaseOrders)
        .set({ status: input.status, deliveredAt: input.deliveredAt, updatedAt: new Date() })
        .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.ownerId, ctx.user.id)))
        .returning();
      if (!updated) return updated;

      // ── Auto-todo lifecycle ──────────────────────────────────────────────
      // When a PO is confirmed by a supplier, create a "receive delivery" todo
      // so the baker doesn't forget to log it on arrival. When the PO moves
      // to delivered or cancelled, mark the linked todo done — it's no longer
      // actionable.

      const becameConfirmed = input.status === "confirmed" && before.status !== "confirmed";
      const becameTerminal  = (input.status === "delivered" || input.status === "cancelled")
                            && before.status !== input.status;

      if (becameConfirmed) {
        // Dedupe — don't create a second todo if one already exists for this PO
        const existing = await ctx.db.query.todos.findFirst({
          where: and(
            eq(todos.ownerId, ctx.user.id),
            eq(todos.sourceType, "purchase_order"),
            eq(todos.sourceId, updated.id),
          ),
          columns: { id: true, completed: true },
        });

        if (!existing) {
          const supplierName = before.supplier?.name ?? "supplier";
          const orderRef     = updated.orderNumber ? ` ${updated.orderNumber}` : "";
          // Keep the date in YYYY-MM-DD format that other todos use
          const expectedDate = updated.expectedDeliveryAt
            ? new Date(updated.expectedDeliveryAt).toISOString().slice(0, 10)
            : null;

          await ctx.db.insert(todos).values({
            ownerId:     ctx.user.id,
            title:       `Receive delivery from ${supplierName}${orderRef}`,
            description: expectedDate
              ? `Confirmed PO arriving on ${expectedDate}. Use Inventory → Receive when it arrives.`
              : "Confirmed PO. Use Inventory → Receive when it arrives.",
            dueDate:     expectedDate,
            priority:    "medium",
            sourceType:  "purchase_order",
            sourceId:    updated.id,
          });
        } else if (existing.completed) {
          // Re-open if the PO was re-confirmed after a previous completion
          await ctx.db.update(todos)
            .set({ completed: false, updatedAt: new Date() })
            .where(eq(todos.id, existing.id));
        }
      }

      if (becameTerminal) {
        // Mark the linked todo done — the receive event has happened (or the
        // PO was cancelled, in which case the action is no longer needed)
        await ctx.db.update(todos)
          .set({ completed: true, updatedAt: new Date() })
          .where(and(
            eq(todos.ownerId, ctx.user.id),
            eq(todos.sourceType, "purchase_order"),
            eq(todos.sourceId, updated.id),
            eq(todos.completed, false),
          ));
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      // Drop any auto-created todos linked to this PO before deleting
      // the PO itself, since the source link will dangle otherwise.
      await ctx.db.delete(todos).where(and(
        eq(todos.ownerId, ctx.user.id),
        eq(todos.sourceType, "purchase_order"),
        eq(todos.sourceId, input),
      ));
      await ctx.db.delete(purchaseOrders).where(and(eq(purchaseOrders.id, input), eq(purchaseOrders.ownerId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * One-click reorder for a single ingredient. Creates a draft purchase order
   * with the ingredient's preferred supplier and a default quantity of
   * (reorder_point × 3) — same heuristic the auto-reorder uses.
   *
   * Throws NO_PREFERRED_SUPPLIER if the ingredient has no preferred supplier
   * configured; the UI catches this and prompts the user to set one.
   */
  quickReorder: protectedProcedure
    .input(z.object({ ingredientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ing = await ctx.db.query.ingredients.findFirst({
        where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.ownerId, ctx.user.id)),
        columns: { id: true, name: true, unit: true, reorderPoint: true, parLevel: true },
      });
      if (!ing) throw new TRPCError({ code: "NOT_FOUND" });

      const preferred = await ctx.db.query.ingredientSuppliers.findFirst({
        where: and(
          eq(ingredientSuppliers.ingredientId, input.ingredientId),
          eq(ingredientSuppliers.isPreferred, true)
        ),
        with: { supplier: true },
      });
      if (!preferred) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NO_PREFERRED_SUPPLIER",
        });
      }
      // Defence in depth: confirm supplier ownership matches workspace
      if (preferred.supplier.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Default quantity heuristic: reorder_point × 3, fall back to par,
      // fall back to 1 unit. Matches inventoryService.checkReorder.
      const reorderQty = ing.reorderPoint
        ? (parseFloat(ing.reorderPoint) * 3).toString()
        : ing.parLevel
          ? ing.parLevel
          : "1";

      return ctx.db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            ownerId:    ctx.user.id,
            supplierId: preferred.supplierId,
            status:     "draft",
            notes:      `Quick reorder: ${ing.name}`,
          })
          .returning();
        await tx.insert(purchaseOrderItems).values({
          purchaseOrderId: po!.id,
          ingredientId:    ing.id,
          quantity:        reorderQty,
          unit:            ing.unit,
        });
        return { id: po!.id, supplierId: preferred.supplierId, supplierName: preferred.supplier.name };
      });
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
