import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, ilike, or, gte, lte } from "drizzle-orm";
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
  generateCardNumber,
  getOwnerTiers,
  awardPoints,
  redeemReward,
  evaluateSegment,
  checkAndCreateRewards,
} from "../services/loyalty";

export const customersRouter = createTRPCRouter({

  // ── Registration ────────────────────────────────────────────────────────────

  register: protectedProcedure
    .input(z.object({
      firstName:           z.string().min(1),
      lastName:            z.string().min(1),
      phone:               z.string().optional().nullable(),
      email:               z.string().email().optional().nullable(),
      birthday:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      dietaryRequirements: z.array(z.enum(["gluten_free", "vegan", "nut_free"])).optional(),
      favouriteCategory:   z.enum(["bread", "pastry", "cakes"]).optional().nullable(),
      loyaltyOptIn:        z.boolean().default(false),
      marketingOptIn:      z.boolean().default(false),
      notes:               z.string().optional().nullable(),
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
    .input(z.object({ query: z.string().min(1) }))
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
      search:          z.string().optional(),
      tier:            z.enum(["bronze", "silver", "gold"]).optional(),
      dietaryReq:      z.string().optional(),
      minPoints:       z.number().optional(),
      sort:            z.enum(["name", "points", "lastVisit", "spend"]).default("name"),
      limit:           z.number().min(1).max(200).default(50),
      offset:          z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: ReturnType<typeof eq>[] = [eq(customers.ownerId, ctx.user.id) as ReturnType<typeof eq>];
      if (input?.tier) conditions.push(eq(customers.tier, input.tier) as ReturnType<typeof eq>);

      const results = await ctx.db.query.customers.findMany({
        where: and(...conditions),
        orderBy: [desc(customers.createdAt)],
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });

      let filtered = results;
      if (input?.search) {
        const q = input.search.toLowerCase();
        filtered = results.filter((c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.cardNumber.toLowerCase().includes(q)
        );
      }
      if (input?.minPoints !== undefined) {
        filtered = filtered.filter((c) => c.points >= input.minPoints!);
      }
      if (input?.dietaryReq) {
        filtered = filtered.filter((c) => {
          const reqs: string[] = c.dietaryRequirements ? JSON.parse(c.dietaryRequirements) : [];
          return reqs.includes(input.dietaryReq!);
        });
      }

      // Sort
      const sort = input?.sort ?? "name";
      if (sort === "points")    filtered.sort((a, b) => b.points - a.points);
      if (sort === "spend")     filtered.sort((a, b) => parseFloat(b.totalSpend) - parseFloat(a.totalSpend));
      if (sort === "lastVisit") filtered.sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0));
      if (sort === "name")      filtered.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

      return filtered;
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
      firstName:           z.string().min(1).optional(),
      lastName:            z.string().min(1).optional(),
      phone:               z.string().nullable().optional(),
      email:               z.string().email().nullable().optional(),
      birthday:            z.string().nullable().optional(),
      dietaryRequirements: z.array(z.string()).nullable().optional(),
      favouriteCategory:   z.string().nullable().optional(),
      loyaltyOptIn:        z.boolean().optional(),
      marketingOptIn:      z.boolean().optional(),
      notes:               z.string().nullable().optional(),
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
      }).where(eq(customers.id, id)).returning();

      return updated!;
    }),

  // ── Award points (POS sale) ──────────────────────────────────────────────────

  awardPoints: protectedProcedure
    .input(z.object({
      customerId:       z.string().uuid(),
      amount:           z.number().positive(),
      currency:         z.string().default("NOK"),
      items:            z.string().optional().nullable(),
      notes:            z.string().optional().nullable(),
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
      name:       z.string().min(1),
      slug:       z.string().min(1),
      minPoints:  z.number().min(0),
      multiplier: z.string().regex(/^\d+(\.\d+)?$/),
      color:      z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      perks:      z.array(z.string()).optional(),
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

  getSegments: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.customerSegments.findMany({
      where: eq(customerSegments.ownerId, ctx.user.id),
      orderBy: [desc(customerSegments.updatedAt)],
    });
  }),

  createSegment: protectedProcedure
    .input(z.object({
      name:        z.string().min(1),
      description: z.string().optional().nullable(),
      criteria:    z.object({
        tier:               z.string().optional(),
        minPoints:          z.number().optional(),
        maxDaysSinceVisit:  z.number().optional(),
        dietaryRequirement: z.string().optional(),
        minLifetimeSpend:   z.number().optional(),
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
