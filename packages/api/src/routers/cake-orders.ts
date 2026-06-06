import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  cakeOrders,
  recipeIngredients,
  shoppingLists,
  shoppingListItems,
  productionSchedules,
  recipes,
  customers,
} from "@bakery/db";
import { inventoryService } from "../services/inventory";
import { recordSale } from "../services/loyalty";
import {
  shortText,
  longText,
  emailField,
  positiveDecimalString,
  nonNegativeDecimalString,
} from "../lib/validation";

const statusSchema = z.enum(["pending", "planned", "in_progress", "completed", "cancelled"]);

/**
 * Verify FK targets the client passed (recipeId, customerId) actually
 * belong to the caller. Pass `null` for any value you don't need to
 * check (e.g. on update when the field wasn't changed).
 *
 * Throws NOT_FOUND if any non-null target is missing or owned by
 * another tenant — same surface the rest of the router uses.
 */
async function assertOwnedFkTargets(
  ctx: { db: typeof import("@bakery/db").db; user: { id: string } },
  targets: { recipeId: string | null; customerId: string | null },
): Promise<void> {
  if (targets.recipeId) {
    const r = await ctx.db.query.recipes.findFirst({
      where: and(eq(recipes.id, targets.recipeId), eq(recipes.ownerId, ctx.user.id)),
      columns: { id: true },
    });
    if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found." });
  }
  if (targets.customerId) {
    const c = await ctx.db.query.customers.findFirst({
      where: and(eq(customers.id, targets.customerId), eq(customers.ownerId, ctx.user.id)),
      columns: { id: true },
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
  }
}

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
        customerId:     z.string().uuid().optional().nullable(),
        customerName:   shortText().optional().nullable(),
        customerEmail:  emailField().optional().nullable(),
        recipeId:       z.string().uuid().optional().nullable(),
        quantity:       positiveDecimalString(),
        dueDate:        z.string().max(32).optional().nullable(),
        notes:          longText().optional().nullable(),
        salePrice:      nonNegativeDecimalString().optional().nullable(),
        cakeStyle:      shortText().optional().nullable(),
        cakeFormat:     shortText().optional().nullable(),
        spongeFlavours: longText().optional().nullable(),
        frostings:      longText().optional().nullable(),
        fillings:       longText().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate any FK targets that came from the client belong to the
      // caller. Without this a tenant can plant a cake_order pointing at
      // another bakery's recipe or customer; later transitions on the
      // order would then read/write that foreign tenant's data.
      await assertOwnedFkTargets(ctx, {
        recipeId:   input.recipeId   ?? null,
        customerId: input.customerId ?? null,
      });
      const [order] = await ctx.db
        .insert(cakeOrders)
        .values({ ...input, ownerId: ctx.user.id, status: "pending" })
        .returning();
      return order;
    }),

  /**
   * Update a cake order. Side-effects on status transitions:
   *
   *   pending → planned: auto-create a production_schedules entry on or
   *     before due_date so the baker sees the order on the scheduler.
   *     Idempotent — does nothing if a schedule already linked.
   *
   *   * → completed: if the order has no linked schedule entry that has
   *     already been recorded as a batch, deduct stock now. If a customer
   *     is linked and salePrice is set, also record the sale through the
   *     loyalty path so points get awarded.
   */
  update: protectedProcedure
    .input(
      z.object({
        id:            z.string().uuid(),
        status:        statusSchema.optional(),
        paymentStatus: z.enum(["pending", "paid", "unpaid", "refunded"]).optional(),
        salePrice:      nonNegativeDecimalString().optional().nullable(),
        notes:          longText().optional().nullable(),
        dueDate:        z.string().max(32).optional().nullable(),
        quantity:       positiveDecimalString().optional(),
        customerId:     z.string().uuid().optional().nullable(),
        customerName:   shortText().optional().nullable(),
        customerEmail:  emailField().optional().nullable(),
        recipeId:       z.string().uuid().optional().nullable(),
        cakeStyle:      shortText().optional().nullable(),
        cakeFormat:     shortText().optional().nullable(),
        spongeFlavours: longText().optional().nullable(),
        frostings:      longText().optional().nullable(),
        fillings:       longText().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const before = await ctx.db.query.cakeOrders.findFirst({
        where: and(eq(cakeOrders.id, id), eq(cakeOrders.ownerId, ctx.user.id)),
      });
      if (!before) throw new Error("Cake order not found.");

      // Validate any FK targets that came from the client. Only check when
      // the caller is actually changing the value — saves a DB round-trip
      // on the common "edit notes / status" path.
      await assertOwnedFkTargets(ctx, {
        recipeId:   data.recipeId   !== undefined && data.recipeId   !== before.recipeId   ? data.recipeId   : null,
        customerId: data.customerId !== undefined && data.customerId !== before.customerId ? data.customerId : null,
      });

      const [updated] = await ctx.db
        .update(cakeOrders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(cakeOrders.id, id), eq(cakeOrders.ownerId, ctx.user.id)))
        .returning();
      if (!updated) throw new Error("Update failed.");

      // ── Status transition side-effects ───────────────────────────────────

      const newStatus = data.status;
      const oldStatus = before.status;

      // 1) pending → planned: auto-create a production_schedules row
      if (newStatus === "planned" && oldStatus !== "planned" && updated.recipeId) {
        const existing = await ctx.db.query.productionSchedules.findFirst({
          where: and(
            eq(productionSchedules.cakeOrderId, updated.id),
            eq(productionSchedules.ownerId, ctx.user.id),
          ),
          columns: { id: true },
        });

        if (!existing) {
          const recipe = await ctx.db.query.recipes.findFirst({
            where: and(eq(recipes.id, updated.recipeId), eq(recipes.ownerId, ctx.user.id)),
            columns: { name: true, yieldAmount: true },
          });

          // Default to baking on the due date; if no due date, schedule for today
          const scheduledDate = updated.dueDate ?? new Date().toISOString().slice(0, 10);

          // Compute the batch count from the order quantity vs recipe yield.
          // 1 cake order asking for 12 cookies, recipe yields 24 → batchCount = 0.5
          const recipeYield = recipe?.yieldAmount ? parseFloat(recipe.yieldAmount) : 1;
          const orderQty    = parseFloat(updated.quantity || "1");
          const batchCount  = recipeYield > 0 ? orderQty / recipeYield : orderQty;

          await ctx.db.insert(productionSchedules).values({
            ownerId:       ctx.user.id,
            recipeId:      updated.recipeId,
            recipeName:    recipe?.name ?? null,
            scheduledDate,
            shift:         "morning",
            batchCount:    String(batchCount),
            notes:         `Order for ${updated.customerName ?? "customer"}${updated.notes ? ` — ${updated.notes}` : ""}`.slice(0, 500),
            status:        "planned",
            cakeOrderId:   updated.id,
          });
        }
      }

      // 2) → completed: deduct stock if no linked recorded batch yet, then
      //    optionally award loyalty points
      if (newStatus === "completed" && oldStatus !== "completed") {
        const linkedSchedule = await ctx.db.query.productionSchedules.findFirst({
          where: and(
            eq(productionSchedules.cakeOrderId, updated.id),
            eq(productionSchedules.ownerId, ctx.user.id),
          ),
          columns: { id: true, recordedBatchId: true },
        });

        // Deduct only if there's no schedule entry that's already been recorded.
        // This prevents double deduction when the schedule entry's "mark done"
        // flow has already run.
        if (updated.recipeId && (!linkedSchedule || !linkedSchedule.recordedBatchId)) {
          const recipe = await ctx.db.query.recipes.findFirst({
            where: eq(recipes.id, updated.recipeId),
            columns: { yieldAmount: true },
          });
          const recipeYield = recipe?.yieldAmount ? parseFloat(recipe.yieldAmount) : 1;
          const orderQty    = parseFloat(updated.quantity || "1");
          const scaleFactor = recipeYield > 0 ? orderQty / recipeYield : orderQty;

          const batch = await inventoryService.recordProduction({
            ownerId:     ctx.user.id,
            recipeId:    updated.recipeId,
            scaleFactor,
            notes:       `Cake order completion: ${updated.customerName ?? "customer"}`,
          });

          // If we created a schedule entry earlier, link the batch back to it
          // so the scheduler reflects the recorded state.
          if (linkedSchedule) {
            await ctx.db
              .update(productionSchedules)
              .set({
                recordedBatchId: batch.batchId,
                status:          "done",
                updatedAt:       new Date(),
              })
              .where(eq(productionSchedules.id, linkedSchedule.id));
          }
        }

        // Award loyalty points if a customer is on file and a sale price exists.
        // Note: we don't double-award if the order was also rung up at the POS;
        // assume cake-order completion is the canonical revenue event for
        // pre-orders.
        if (updated.customerId && updated.salePrice) {
          const amount = parseFloat(updated.salePrice);
          if (amount > 0) {
            try {
              await recordSale({
                ownerId:    ctx.user.id,
                customerId: updated.customerId,
                currency:   "NOK",
                items: [{
                  description:   `Cake order: ${updated.recipeId ? "" : ""}${updated.customerName ? `for ${updated.customerName}` : "completed"}`.trim() || "Cake order",
                  recipeId:      null, // already deducted above; don't double-deduct
                  premadeCakeId: null,
                  quantity:      parseFloat(updated.quantity || "1"),
                  unitPrice:     amount / parseFloat(updated.quantity || "1"),
                }],
                notes:      `Auto-recorded from cake order ${updated.id}`,
              });
            } catch (err) {
              // Don't fail the whole order completion if loyalty side-effects
              // fail — the sale itself has already been recorded.
              console.error("Loyalty award failed for cake order:", err);
            }
          }
        }
      }

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
   * Schedule an unlinked Shopify-origin order as a production event (no
   * recipe authored). Used for class-style or service products like
   * "Bakeskole - August 2026" that need a slot on the production calendar
   * but have nothing to bake. Creates a production_schedules row with
   * recipeId = null and recipeName = the Shopify line-item title, then
   * flips the order's status to "planned" so it leaves the pending queue.
   *
   * Idempotent on re-call: if a schedule already exists for this order it
   * is updated in-place rather than duplicated.
   */
  scheduleAsEvent: protectedProcedure
    .input(
      z.object({
        cakeOrderId:   z.string().uuid(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shift:         z.enum(["morning", "afternoon", "evening"]).default("morning"),
        notes:         longText().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.cakeOrders.findFirst({
        where: and(eq(cakeOrders.id, input.cakeOrderId), eq(cakeOrders.ownerId, ctx.user.id)),
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Cake order not found." });
      if (!order.shopifyLineItemTitle) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only Shopify-origin orders can be scheduled as events.",
        });
      }
      if (order.recipeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This order is already linked to a recipe — schedule a batch instead.",
        });
      }

      return ctx.db.transaction(async (tx) => {
        const existing = await tx.query.productionSchedules.findFirst({
          where: and(
            eq(productionSchedules.cakeOrderId, order.id),
            eq(productionSchedules.ownerId, ctx.user.id),
          ),
          columns: { id: true },
        });

        let schedule;
        if (existing) {
          [schedule] = await tx
            .update(productionSchedules)
            .set({
              recipeId:      null,
              recipeName:    order.shopifyLineItemTitle,
              scheduledDate: input.scheduledDate,
              shift:         input.shift,
              notes:         input.notes ?? null,
              updatedAt:     new Date(),
            })
            .where(eq(productionSchedules.id, existing.id))
            .returning();
        } else {
          [schedule] = await tx
            .insert(productionSchedules)
            .values({
              ownerId:       ctx.user.id,
              recipeId:      null,
              recipeName:    order.shopifyLineItemTitle,
              scheduledDate: input.scheduledDate,
              shift:         input.shift,
              batchCount:    "1",
              notes:         input.notes ?? null,
              status:        "planned",
              cakeOrderId:   order.id,
            })
            .returning();
        }

        await tx
          .update(cakeOrders)
          .set({ status: "planned", updatedAt: new Date() })
          .where(and(eq(cakeOrders.id, order.id), eq(cakeOrders.ownerId, ctx.user.id)));

        return schedule;
      });
    }),

  /**
   * Aggregate ingredients across selected orders and create a shopping list.
   * Uses each order's recipe yield to calculate the exact ingredient multiplier.
   * Marks included orders as "planned".
   */
  generateShoppingList: protectedProcedure
    .input(
      z.object({
        orderIds: z.array(z.string().uuid()).min(1).max(200),
        listName: shortText({ min: 1 }),
        dueDate:  z.string().max(32).optional(),
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
