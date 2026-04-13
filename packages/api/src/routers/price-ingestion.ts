import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  priceIngestionSessions,
  priceIngestionItems,
  marginSettings,
  notifications,
} from "@bakery/db";
import { priceIngestion } from "../services/price-ingestion";

const columnMappingSchema = z.object({
  nameCol:     z.number().int().min(0),
  priceCol:    z.number().int().min(0),
  unitCol:     z.number().int().min(0).optional(),
  quantityCol: z.number().int().min(0).optional(),
  hasHeader:   z.boolean().default(true),
});

export const priceIngestionRouter = createTRPCRouter({

  // ── Sessions ───────────────────────────────────────────────────────────────

  getSessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.priceIngestionSessions.findMany({
        where: eq(priceIngestionSessions.ownerId, ctx.user.id),
        orderBy: [desc(priceIngestionSessions.startedAt)],
        limit: input?.limit ?? 20,
      });
    }),

  getSession: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.query.priceIngestionSessions.findFirst({
        where: and(
          eq(priceIngestionSessions.id, input),
          eq(priceIngestionSessions.ownerId, ctx.user.id)
        ),
        with: {
          items: {
            with: { ingredient: true, supplier: true },
            orderBy: [desc(priceIngestionItems.matchScore)],
          },
        },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      return session;
    }),

  // ── CSV ingestion (text is sent directly — no file upload needed) ──────────

  ingestCSV: protectedProcedure
    .input(z.object({
      csvText:       z.string().min(1).max(500_000),
      fileName:      z.string().default("import.csv"),
      supplierId:    z.string().uuid(),
      columnMapping: columnMappingSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.isAnonymous) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Create an account to import supplier prices.",
        });
      }
      return priceIngestion.ingestCSV({
        csvText:       input.csvText,
        fileName:      input.fileName,
        columnMapping: input.columnMapping,
        supplierId:    input.supplierId,
        ownerId:       ctx.user.id,
      });
    }),

  // ── Apply confirmed items ──────────────────────────────────────────────────

  applyItems: protectedProcedure
    .input(z.object({
      sessionId:        z.string().uuid(),
      confirmedItemIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
      const session = await ctx.db.query.priceIngestionSessions.findFirst({
        where: and(
          eq(priceIngestionSessions.id, input.sessionId),
          eq(priceIngestionSessions.ownerId, ctx.user.id)
        ),
        columns: { id: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await priceIngestion.applyItems(
        input.sessionId,
        input.confirmedItemIds,
        ctx.user.id
      );

      // Trigger COGS recalc and margin check after applying prices
      const cogsResults = await priceIngestion.recalculateCOGS(ctx.user.id);
      await priceIngestion.checkMargins(ctx.user.id, cogsResults);

      // Optionally fire webhook if configured
      const settings = await ctx.db.query.marginSettings.findFirst({
        where: eq(marginSettings.ownerId, ctx.user.id),
      });
      if (settings?.webhookEnabled && settings.webhookUrl) {
        priceIngestion
          .dispatchWebhook(settings.webhookUrl, {
            event: "prices_applied",
            sessionId: input.sessionId,
            applied: result.applied,
            cogs: cogsResults,
          })
          .catch(() => { /* Webhook failure is non-fatal */ });
      }

      return result;
    }),

  // ── Item-level actions (confirm / reject / re-assign) ──────────────────────

  confirmItem: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(priceIngestionItems)
        .set({ confirmed: true, rejected: false })
        .where(eq(priceIngestionItems.id, input));
      return { success: true };
    }),

  rejectItem: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(priceIngestionItems)
        .set({ rejected: true, confirmed: false })
        .where(eq(priceIngestionItems.id, input));
      return { success: true };
    }),

  reassignItem: protectedProcedure
    .input(z.object({ itemId: z.string().uuid(), ingredientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(priceIngestionItems)
        .set({ ingredientId: input.ingredientId, confirmed: true, rejected: false, matchScore: "1.000" })
        .where(eq(priceIngestionItems.id, input.itemId));
      return { success: true };
    }),

  // ── Margin settings ────────────────────────────────────────────────────────

  getMarginSettings: protectedProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.query.marginSettings.findFirst({
      where: eq(marginSettings.ownerId, ctx.user.id),
    });
    return existing ?? {
      minMarginPct: "20",
      priceRiseThresholdPct: "5",
      webhookUrl: null,
      webhookEnabled: false,
    };
  }),

  upsertMarginSettings: protectedProcedure
    .input(z.object({
      minMarginPct:           z.string().regex(/^\d+(\.\d+)?$/),
      priceRiseThresholdPct:  z.string().regex(/^\d+(\.\d+)?$/),
      webhookUrl:             z.string().url().optional().nullable(),
      webhookEnabled:         z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.marginSettings.findFirst({
        where: eq(marginSettings.ownerId, ctx.user.id),
        columns: { id: true },
      });
      if (existing) {
        await ctx.db
          .update(marginSettings)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(marginSettings.ownerId, ctx.user.id));
      } else {
        await ctx.db.insert(marginSettings).values({ ...input, ownerId: ctx.user.id });
      }
      return { success: true };
    }),

  // ── Notifications ──────────────────────────────────────────────────────────

  getNotifications: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    return ctx.db.query.notifications.findMany({
      where: and(
        eq(notifications.ownerId, ctx.user.id),
        eq(notifications.read, false)
      ),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    });
  }),

  getUnreadCount: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return 0;
    const rows = await ctx.db.query.notifications.findMany({
      where: and(
        eq(notifications.ownerId, ctx.user.id),
        eq(notifications.read, false)
      ),
      columns: { id: true },
    });
    return rows.length;
  }),

  markRead: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.id, input), eq(notifications.ownerId, ctx.user.id)));
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.ownerId, ctx.user.id), eq(notifications.read, false)));
    return { success: true };
  }),

  // ── COGS recalculation (on-demand) ────────────────────────────────────────

  recalculateCOGS: protectedProcedure.query(async ({ ctx }) => {
    return priceIngestion.recalculateCOGS(ctx.user.id);
  }),
});
