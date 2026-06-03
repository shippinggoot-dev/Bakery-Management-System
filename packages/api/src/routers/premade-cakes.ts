import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  premadeCakes,
  premadeCakeSizes,
  flavours,
  premadeCakeFlavours,
  cakeAddons,
  premadeCakeAddons,
  recipes,
} from "@bakery/db";
import {
  shortText,
  longText,
  nonNegativeDecimalString,
} from "../lib/validation";

// ── Input schemas ────────────────────────────────────────────────────────────

const cakeBaseSchema = z.object({
  name:         shortText({ min: 1 }),
  description:  longText().optional().nullable(),
  basePrice:    nonNegativeDecimalString(),
  leadTimeDays: z.number().int().min(0).max(365).default(0),
  recipeId:     z.string().uuid().optional().nullable(),
  allergens:    longText().optional().nullable(),
  isActive:     z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});

const sizeInputSchema = z.object({
  label:        shortText({ min: 1 }),
  diameterCm:   z.number().int().positive().max(1000).optional().nullable(),
  heightCm:     z.number().int().positive().max(1000).optional().nullable(),
  serves:       z.number().int().positive().max(10_000).optional().nullable(),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});

const flavourInputSchema = z.object({
  name:         shortText({ min: 1 }),
  description:  longText().optional().nullable(),
  isActive:     z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});

const addonInputSchema = z.object({
  name:         shortText({ min: 1 }),
  description:  longText().optional().nullable(),
  priceDelta:   nonNegativeDecimalString().default("0"),
  isActive:     z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});

// ── Sub-routers: shared catalogs ─────────────────────────────────────────────

const flavoursRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    return ctx.db.query.flavours.findMany({
      where: eq(flavours.ownerId, ctx.user.id),
      orderBy: [asc(flavours.displayOrder), asc(flavours.name)],
    });
  }),

  create: protectedProcedure
    .input(flavourInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.isAnonymous) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create an account to manage flavours." });
      }
      const [created] = await ctx.db
        .insert(flavours)
        .values({ ...input, ownerId: ctx.user.id })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: flavourInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(flavours)
        .set(input.data)
        .where(and(eq(flavours.id, input.id), eq(flavours.ownerId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(flavours)
        .where(and(eq(flavours.id, input), eq(flavours.ownerId, ctx.user.id)));
      return { success: true };
    }),
});

const addonsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    return ctx.db.query.cakeAddons.findMany({
      where: eq(cakeAddons.ownerId, ctx.user.id),
      orderBy: [asc(cakeAddons.displayOrder), asc(cakeAddons.name)],
    });
  }),

  create: protectedProcedure
    .input(addonInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.isAnonymous) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create an account to manage add-ons." });
      }
      const [created] = await ctx.db
        .insert(cakeAddons)
        .values({ ...input, ownerId: ctx.user.id })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: addonInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(cakeAddons)
        .set(input.data)
        .where(and(eq(cakeAddons.id, input.id), eq(cakeAddons.ownerId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(cakeAddons)
        .where(and(eq(cakeAddons.id, input), eq(cakeAddons.ownerId, ctx.user.id)));
      return { success: true };
    }),
});

// ── Main router ──────────────────────────────────────────────────────────────

export const premadeCakesRouter = createTRPCRouter({
  flavours: flavoursRouter,
  addons:   addonsRouter,

  list: publicProcedure
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const conditions: ReturnType<typeof eq>[] = [
        eq(premadeCakes.ownerId, ctx.user.id),
      ];
      if (input?.isActive !== undefined) {
        conditions.push(eq(premadeCakes.isActive, input.isActive));
      }
      return ctx.db.query.premadeCakes.findMany({
        where: and(...conditions),
        orderBy: [asc(premadeCakes.displayOrder), asc(premadeCakes.name)],
        with: {
          sizes:    { orderBy: [asc(premadeCakeSizes.displayOrder)] },
          flavours: { with: { flavour: true } },
          addons:   { with: { addon: true } },
        },
      });
    }),

  byId: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      return ctx.db.query.premadeCakes.findFirst({
        where: and(eq(premadeCakes.id, input), eq(premadeCakes.ownerId, ctx.user.id)),
        with: {
          sizes:    { orderBy: [asc(premadeCakeSizes.displayOrder)] },
          flavours: { with: { flavour: true } },
          addons:   { with: { addon: true } },
          recipe:   true,
        },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      cake:       cakeBaseSchema,
      sizes:      z.array(sizeInputSchema).default([]),
      flavourIds: z.array(z.string().uuid()).default([]),
      addonIds:   z.array(z.string().uuid()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.isAnonymous) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create an account to manage premade cakes." });
      }
      return ctx.db.transaction(async (tx) => {
        const [cake] = await tx
          .insert(premadeCakes)
          .values({ ...input.cake, ownerId: ctx.user.id })
          .returning();
        if (!cake) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (input.sizes.length) {
          await tx.insert(premadeCakeSizes).values(
            input.sizes.map((s) => ({ ...s, cakeId: cake.id })),
          );
        }
        if (input.flavourIds.length) {
          await tx.insert(premadeCakeFlavours).values(
            input.flavourIds.map((flavourId) => ({ cakeId: cake.id, flavourId })),
          );
        }
        if (input.addonIds.length) {
          await tx.insert(premadeCakeAddons).values(
            input.addonIds.map((addonId) => ({ cakeId: cake.id, addonId })),
          );
        }
        return cake;
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id:         z.string().uuid(),
      cake:       cakeBaseSchema.partial().optional(),
      sizes:      z.array(sizeInputSchema).optional(),
      flavourIds: z.array(z.string().uuid()).optional(),
      addonIds:   z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before any writes.
      const owned = await ctx.db.query.premadeCakes.findFirst({
        where:   and(eq(premadeCakes.id, input.id), eq(premadeCakes.ownerId, ctx.user.id)),
        columns: { id: true },
      });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.transaction(async (tx) => {
        if (input.cake) {
          await tx
            .update(premadeCakes)
            .set({ ...input.cake, updatedAt: new Date() })
            .where(eq(premadeCakes.id, input.id));
        }
        if (input.sizes) {
          await tx.delete(premadeCakeSizes).where(eq(premadeCakeSizes.cakeId, input.id));
          if (input.sizes.length) {
            await tx.insert(premadeCakeSizes).values(
              input.sizes.map((s) => ({ ...s, cakeId: input.id })),
            );
          }
        }
        if (input.flavourIds) {
          await tx.delete(premadeCakeFlavours).where(eq(premadeCakeFlavours.cakeId, input.id));
          if (input.flavourIds.length) {
            await tx.insert(premadeCakeFlavours).values(
              input.flavourIds.map((flavourId) => ({ cakeId: input.id, flavourId })),
            );
          }
        }
        if (input.addonIds) {
          await tx.delete(premadeCakeAddons).where(eq(premadeCakeAddons.cakeId, input.id));
          if (input.addonIds.length) {
            await tx.insert(premadeCakeAddons).values(
              input.addonIds.map((addonId) => ({ cakeId: input.id, addonId })),
            );
          }
        }
        return { success: true };
      });
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(premadeCakes)
        .where(and(eq(premadeCakes.id, input), eq(premadeCakes.ownerId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Cost-of-goods-sold for a premade cake whose recipe has supplier-priced
   * ingredients. Returns null if the cake has no recipe linked, or if no
   * pricing data exists for any ingredient.
   */
  calculateMargin: publicProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return null;
      const cake = await ctx.db.query.premadeCakes.findFirst({
        where:   and(eq(premadeCakes.id, input), eq(premadeCakes.ownerId, ctx.user.id)),
        columns: { id: true, basePrice: true, recipeId: true },
      });
      if (!cake?.recipeId) return null;

      const recipe = await ctx.db.query.recipes.findFirst({
        where: and(eq(recipes.id, cake.recipeId), eq(recipes.ownerId, ctx.user.id)),
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

      let cogs = 0;
      let pricedAll = true;
      for (const ri of recipe.ingredients) {
        const sp = ri.ingredient.supplierPrices[0];
        if (!sp) { pricedAll = false; continue; }
        const unitCost = parseFloat(sp.pricePerUnit);
        const qty      = parseFloat(ri.quantity);
        if (!isNaN(unitCost) && !isNaN(qty)) cogs += unitCost * qty;
      }

      const sale   = parseFloat(cake.basePrice);
      const margin = sale > 0 ? ((sale - cogs) / sale) * 100 : null;

      return {
        salePrice:      sale,
        cogs:           parseFloat(cogs.toFixed(4)),
        marginPercent:  margin === null ? null : parseFloat(margin.toFixed(1)),
        marginAbsolute: parseFloat((sale - cogs).toFixed(4)),
        pricedAll,
        recipeName:     recipe.name,
      };
    }),
});

