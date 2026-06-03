import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc, desc, ilike, like, or, gte } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  customers,
  loyaltyTiers,
  loyaltyTransactions,
  rewards,
  customerSegments,
  customerSales,
  type SegmentCriteria,
} from "@bakery/db";
import {
  shortText,
  longText,
  emailField,
  phoneField,
  searchQuery,
  nonNegativeDecimalString,
  stripLikeWildcards,
} from "../lib/validation";
import {
  generateCardNumber,
  getOwnerTiers,
  awardPoints,
  recordSale,
  redeemReward,
  evaluateSegment,
  checkAndCreateRewards,
} from "../services/loyalty";

export const customersRouter = createTRPCRouter({

  // ── Registration ────────────────────────────────────────────────────────────

  register: protectedProcedure
    .input(z.object({
      firstName:           shortText({ min: 1 }),
      lastName:            shortText({ min: 1 }),
      phone:               phoneField().optional().nullable(),
      email:               emailField().optional().nullable(),
      birthday:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      dietaryRequirements: z.array(z.enum(["gluten_free", "vegan", "nut_free"])).max(10).optional(),
      favouriteCategory:   z.enum(["bread", "pastry", "cakes"]).optional().nullable(),
      loyaltyOptIn:        z.boolean().default(false),
      marketingOptIn:      z.boolean().default(false),
      notes:               longText().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.phone && !input.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Phone or email is required." });
      }

      // Duplicate check
      const conditions = [eq(customers.ownerId, ctx.user.id)];
      if (input.phone) conditions.push(eq(customers.phone, input.phone));
      const existing = input.phone
        ? await ctx.db.query.customers.findFirst({ where: and(...conditions) })
        : null;
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A customer with this phone already exists." });

      const cardNumber = await generateCardNumber(ctx.user.id);

      const [customer] = await ctx.db.insert(customers).values({
        ownerId:             ctx.user.id,
        cardNumber,
        firstName:           input.firstName,
        lastName:            input.lastName,
        phone:               input.phone ?? null,
        email:               input.email ?? null,
        birthday:            input.birthday ?? null,
        dietaryRequirements: input.dietaryRequirements ? JSON.stringify(input.dietaryRequirements) : null,
        favouriteCategory:   input.favouriteCategory ?? null,
        loyaltyOptIn:        input.loyaltyOptIn,
        marketingOptIn:      input.marketingOptIn,
        consentTimestamp:    input.loyaltyOptIn || input.marketingOptIn ? new Date() : null,
        notes:               input.notes ?? null,
      }).returning();

      return customer!;
    }),

  // ── Quick lookup — for POS staff (phone or card number) ─────────────────────

  lookup: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const q = input.query.trim();
      const result = await ctx.db.query.customers.findFirst({
        where: and(
          eq(customers.ownerId, ctx.user.id),
          or(
            eq(customers.phone, q),
            eq(customers.cardNumber, q),
            eq(customers.email, q),
          ),
        ),
        with: {
          rewards: {
            where: and(eq(rewards.status, "pending"), gte(rewards.validUntil, new Date())),
            orderBy: [desc(rewards.validUntil)],
            limit: 5,
          },
        },
      });
      return result ?? null;
    }),

  // ── CRM: list all customers with filters ─────────────────────────────────────

  getAll: protectedProcedure
    .input(z.object({
      search:          searchQuery().optional(),
      tier:            z.enum(["bronze", "silver", "gold"]).optional(),
      dietaryReq:      z.enum(["gluten_free", "vegan", "nut_free"]).optional(),
      minPoints:       z.number().int().min(0).max(1_000_000).optional(),
      sort:            z.enum(["name", "points", "lastVisit", "spend"]).default("name"),
      limit:           z.number().min(1).max(200).default(50),
      offset:          z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: ReturnType<typeof eq>[] = [eq(customers.ownerId, ctx.user.id) as ReturnType<typeof eq>];

      if (input?.tier)      conditions.push(eq(customers.tier, input.tier) as ReturnType<typeof eq>);
      if (input?.minPoints) conditions.push(gte(customers.points, input.minPoints) as ReturnType<typeof eq>);
      if (input?.dietaryReq) {
        // dietaryRequirements is stored as JSON array e.g. '["gluten_free","vegan"]'.
        // Zod constrains dietaryReq to the known enum values, so this pattern
        // match cannot inject LIKE wildcards.
        conditions.push(like(customers.dietaryRequirements, `%"${input.dietaryReq}"%`) as ReturnType<typeof eq>);
      }
      if (input?.search) {
        // Strip LIKE wildcards from user input — prevents a malicious
        // "%%%%a%%%%" query from forcing a quadratic table scan.
        const safe = stripLikeWildcards(input.search);
        const q = `%${safe}%`;
        conditions.push(or(
          ilike(customers.firstName, q),
          ilike(customers.lastName, q),
          ilike(customers.phone, q),
          ilike(customers.email, q),
          ilike(customers.cardNumber, q),
        ) as ReturnType<typeof eq>);
      }

      const sort = input?.sort ?? "name";
      const orderBy =
        sort === "points"    ? [desc(customers.points)] :
        sort === "spend"     ? [desc(customers.totalSpend)] :
        sort === "lastVisit" ? [desc(customers.lastVisitAt)] :
                               [asc(customers.firstName), asc(customers.lastName)];

      return ctx.db.query.customers.findMany({
        where: and(...conditions),
        orderBy,
        limit:  input?.limit  ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  // ── Individual customer profile ───────────────────────────────────────────────

  getById: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const customer = await ctx.db.query.customers.findFirst({
        where: and(eq(customers.id, input), eq(customers.ownerId, ctx.user.id)),
        with: {
          loyaltyTransactions: {
            orderBy: [desc(loyaltyTransactions.createdAt)],
            limit: 50,
          },
          rewards: {
            orderBy: [desc(rewards.createdAt)],
            limit: 20,
          },
          sales: {
            orderBy: [desc(customerSales.soldAt)],
            limit: 30,
          },
        },
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
      return customer;
    }),

  // ── Update customer ───────────────────────────────────────────────────────────

  update: protectedProcedure
    .input(z.object({
      id:                  z.string().uuid(),
      firstName:           shortText({ min: 1 }).optional(),
      lastName:            shortText({ min: 1 }).optional(),
      phone:               phoneField().nullable().optional(),
      email:               emailField().nullable().optional(),
      birthday:            z.string().max(32).nullable().optional(),
      dietaryRequirements: z.array(z.string().max(64)).max(10).nullable().optional(),
      favouriteCategory:   shortText().nullable().optional(),
      loyaltyOptIn:        z.boolean().optional(),
      marketingOptIn:      z.boolean().optional(),
      notes:               longText().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dietaryRequirements, ...rest } = input;
      const existing = await ctx.db.query.customers.findFirst({
        where: and(eq(customers.id, id), eq(customers.ownerId, ctx.user.id)),
        columns: { id: true, loyaltyOptIn: true, marketingOptIn: true, consentTimestamp: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const consentGiven =
        (rest.loyaltyOptIn && !existing.loyaltyOptIn) ||
        (rest.marketingOptIn && !existing.marketingOptIn);

      const [updated] = await ctx.db.update(customers).set({
        ...rest,
        dietaryRequirements: dietaryRequirements !== undefined
          ? (dietaryRequirements ? JSON.stringify(dietaryRequirements) : null)
          : undefined,
        consentTimestamp: consentGiven ? new Date() : existing.consentTimestamp,
        updatedAt: new Date(),
      }).where(and(eq(customers.id, id), eq(customers.ownerId, ctx.user.id))).returning();

      return updated!;
    }),

  // ── Award points (POS sale) ──────────────────────────────────────────────────

  awardPoints: protectedProcedure
    .input(z.object({
      customerId:       z.string().uuid(),
      amount:           z.number().positive().finite().max(10_000_000),
      currency:         z.string().max(8).default("NOK"),
      items:            longText().optional().nullable(),
      notes:            longText().optional().nullable(),
      rewardRedeemedId: z.string().uuid().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return awardPoints({
        ownerId:          ctx.user.id,
        customerId:       input.customerId,
        amount:           input.amount,
        currency:         input.currency,
        items:            input.items ?? null,
        notes:            input.notes ?? null,
        rewardRedeemedId: input.rewardRedeemedId ?? null,
      });
    }),

  /**
   * Record a sale with structured line items. Lines linked to a recipe (or a
   * premade cake whose backing recipe resolves) deduct stock via FEFO. If a
   * customerId is supplied, loyalty points are awarded on the total. For
   * cash sales, pass customerId: null.
   */
  recordSale: protectedProcedure
    .input(z.object({
      customerId:       z.string().uuid().nullable(),
      currency:         z.string().max(8).default("NOK"),
      notes:            longText().optional().nullable(),
      rewardRedeemedId: z.string().uuid().optional().nullable(),
      items: z.array(z.object({
        description:    shortText({ min: 1 }),
        recipeId:       z.string().uuid().optional().nullable(),
        premadeCakeId:  z.string().uuid().optional().nullable(),
        quantity:       z.number().positive().finite().max(1_000_000),
        unitPrice:      z.number().finite().nullable(),
      })).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      return recordSale({
        ownerId:          ctx.user.id,
        customerId:       input.customerId,
        currency:         input.currency,
        items:            input.items,
        notes:            input.notes ?? null,
        rewardRedeemedId: input.rewardRedeemedId ?? null,
      });
    }),

  // ── Redeem reward ─────────────────────────────────────────────────────────────

  redeemReward: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), rewardId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await redeemReward({ ownerId: ctx.user.id, ...input });
    }),

  // ── Run reward checks manually ────────────────────────────────────────────────

  runRewardChecks: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input: customerId }) => {
      const c = await ctx.db.query.customers.findFirst({
        where: and(eq(customers.id, customerId), eq(customers.ownerId, ctx.user.id)),
        columns: { points: true, lifetimePoints: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await checkAndCreateRewards(customerId, ctx.user.id, c.lifetimePoints, c.points);
    }),

  // ── Loyalty tiers ─────────────────────────────────────────────────────────────

  getTiers: protectedProcedure.query(async ({ ctx }) => {
    return getOwnerTiers(ctx.user.id);
  }),

  upsertTier: protectedProcedure
    .input(z.object({
      id:         z.string().uuid().optional(),
      name:       shortText({ min: 1 }),
      slug:       z.string().min(1).max(64),
      minPoints:  z.number().int().min(0).max(10_000_000),
      multiplier: nonNegativeDecimalString(),
      color:      z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      perks:      z.array(shortText()).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, perks, ...rest } = input;
      const data = { ...rest, perks: perks ? JSON.stringify(perks) : null, ownerId: ctx.user.id };
      if (id) {
        const [updated] = await ctx.db.update(loyaltyTiers).set({ ...data, updatedAt: new Date() }).where(and(eq(loyaltyTiers.id, id), eq(loyaltyTiers.ownerId, ctx.user.id))).returning();
        return updated!;
      }
      const [created] = await ctx.db.insert(loyaltyTiers).values(data).returning();
      return created!;
    }),

  deleteTier: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(loyaltyTiers).where(and(eq(loyaltyTiers.id, input), eq(loyaltyTiers.ownerId, ctx.user.id)));
    }),

  // ── Segments ─────────────────────────────────────────────────────────────────

  getSegments: protectedProcedure
    .input(z.object({
      limit:  z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit  = input?.limit  ?? 25;
      const offset = input?.offset ?? 0;

      const rows = await ctx.db.query.customerSegments.findMany({
        where: eq(customerSegments.ownerId, ctx.user.id),
        orderBy: [desc(customerSegments.updatedAt)],
        limit:  limit + 1,
        offset,
      });

      const hasMore = rows.length > limit;
      return { segments: hasMore ? rows.slice(0, limit) : rows, hasMore };
    }),

  createSegment: protectedProcedure
    .input(z.object({
      name:        shortText({ min: 1 }),
      description: longText().optional().nullable(),
      criteria:    z.object({
        tier:               shortText().optional(),
        minPoints:          z.number().int().min(0).max(10_000_000).optional(),
        maxDaysSinceVisit:  z.number().int().min(0).max(36500).optional(),
        dietaryRequirement: shortText().optional(),
        minLifetimeSpend:   z.number().min(0).finite().max(1_000_000_000).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const [seg] = await ctx.db.insert(customerSegments).values({
        ownerId:     ctx.user.id,
        name:        input.name,
        description: input.description ?? null,
        criteria:    JSON.stringify(input.criteria),
      }).returning();

      await evaluateSegment(seg!.id, ctx.user.id);
      return seg!;
    }),

  refreshSegment: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const seg = await ctx.db.query.customerSegments.findFirst({
        where: and(eq(customerSegments.id, input), eq(customerSegments.ownerId, ctx.user.id)),
      });
      if (!seg) throw new TRPCError({ code: "NOT_FOUND" });
      const memberIds = await evaluateSegment(input, ctx.user.id);
      return { memberCount: memberIds.length };
    }),

  deleteSegment: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(customerSegments).where(and(eq(customerSegments.id, input), eq(customerSegments.ownerId, ctx.user.id)));
    }),

  getSegmentMembers: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const seg = await ctx.db.query.customerSegments.findFirst({
        where: and(eq(customerSegments.id, input), eq(customerSegments.ownerId, ctx.user.id)),
        with: {
          members: {
            with: { customer: true },
            limit: 200,
          },
        },
      });
      if (!seg) throw new TRPCError({ code: "NOT_FOUND" });
      return seg.members.map((m) => m.customer);
    }),
});
