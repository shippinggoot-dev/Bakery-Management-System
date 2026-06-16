import { z } from "zod";
import { eq, and, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { socialPosts } from "@bakery/db";
import { assertSupabaseImageUrl } from "../lib/image-validation";

/**
 * Wraps assertSupabaseImageUrl to produce a tRPC-shaped error rather than
 * a raw Error. Returns the asserted URL for downstream use.
 */
function validateOrThrow(rawUrl: string): string {
  try {
    return assertSupabaseImageUrl(rawUrl).toString();
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: err instanceof Error ? err.message : "Invalid image URL.",
    });
  }
}

const statusSchema             = z.enum(["draft", "planned", "posted"]);
const userEditableStatusSchema = z.enum(["draft", "planned"]);

/**
 * Status of a social post in the user's planning flow:
 *   draft   — composed, no plan date yet
 *   planned — scheduled_for is set; reminder appears when that date arrives
 *   posted  — user clicked "I posted it"; posted_at recorded
 */
export const socialPostsRouter = createTRPCRouter({

  /**
   * List posts for calendar / drafts view. Optionally filter by status or
   * by scheduledFor date range. UI is responsible for grouping the results.
   */
  list: protectedProcedure
    .input(z.object({
      status: statusSchema.optional(),
      from:   z.date().optional(),
      to:     z.date().optional(),
      limit:  z.number().min(1).max(500).default(200),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: SQL[] = [eq(socialPosts.ownerId, ctx.user.id)];
      if (input?.status) conditions.push(eq(socialPosts.status, input.status));
      if (input?.from)   conditions.push(gte(socialPosts.scheduledFor, input.from));
      if (input?.to)     conditions.push(lte(socialPosts.scheduledFor, input.to));

      return ctx.db.query.socialPosts.findMany({
        where:   and(...conditions),
        orderBy: [desc(socialPosts.scheduledFor), desc(socialPosts.createdAt)],
        limit:   input?.limit ?? 200,
      });
    }),

  /**
   * Count posts that the user planned for today (local time, but interpreted
   * server-side as a 24h UTC window — close enough for a "ping the user"
   * signal). Used by the nav badge and dashboard banner.
   */
  todayPlannedCount: protectedProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const rows = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(socialPosts)
      .where(and(
        eq(socialPosts.ownerId, ctx.user.id),
        eq(socialPosts.status, "planned"),
        gte(socialPosts.scheduledFor, start),
        lte(socialPosts.scheduledFor, end),
      ));
    return rows[0]?.count ?? 0;
  }),

  /**
   * Create a post. If scheduledFor is provided and in the future the status
   * starts as "planned"; otherwise it stays "draft" until the user adds a
   * plan date.
   */
  create: protectedProcedure
    .input(z.object({
      imageUrl:     z.string().url().optional().nullable(),
      caption:      z.string().max(2200).optional().nullable(),
      scheduledFor: z.date().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.scheduledFor && input.scheduledFor.getTime() < Date.now()) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: "Planned time must be in the future.",
        });
      }
      const safeImageUrl = input.imageUrl ? validateOrThrow(input.imageUrl) : null;
      const status = input.scheduledFor ? "planned" : "draft";
      const [post] = await ctx.db.insert(socialPosts).values({
        ownerId:      ctx.user.id,
        imageUrl:     safeImageUrl,
        caption:      input.caption ?? null,
        scheduledFor: input.scheduledFor ?? null,
        status,
      }).returning();
      return post;
    }),

  /**
   * Edit a post. Only allowed while in an editable state (draft, planned).
   * Posted entries are immutable — users can delete and recreate if they
   * really need to fix one.
   *
   * If scheduledFor changes between null and a date, status auto-flips
   * between "draft" and "planned" unless the caller passed an explicit
   * status override.
   */
  update: protectedProcedure
    .input(z.object({
      id:           z.string().uuid(),
      imageUrl:     z.string().url().optional().nullable(),
      caption:      z.string().max(2200).optional().nullable(),
      scheduledFor: z.date().optional().nullable(),
      status:       userEditableStatusSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;

      if (patch.scheduledFor && patch.scheduledFor.getTime() < Date.now()) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: "Planned time must be in the future.",
        });
      }

      if (patch.imageUrl) {
        patch.imageUrl = validateOrThrow(patch.imageUrl);
      }

      const inferredStatus: { status?: "draft" | "planned" } =
        patch.scheduledFor !== undefined && patch.status === undefined
          ? { status: patch.scheduledFor ? "planned" : "draft" }
          : {};

      const [updated] = await ctx.db
        .update(socialPosts)
        .set({ ...patch, ...inferredStatus, updatedAt: new Date() })
        .where(and(
          eq(socialPosts.id, id),
          eq(socialPosts.ownerId, ctx.user.id),
          sql`status IN ('draft','planned')`,
        ))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code:    "NOT_FOUND",
          message: "Post not found or already marked as posted.",
        });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(socialPosts)
        .where(and(
          eq(socialPosts.id, input),
          eq(socialPosts.ownerId, ctx.user.id),
        ));
      return { ok: true };
    }),

  /**
   * User confirms they have posted the content on their social network of
   * choice. Flips the row to "posted" and records posted_at. The brand-voice
   * AI feature reads these rows to learn the user's captioning style.
   */
  markPosted: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(socialPosts)
        .set({
          status:    "posted",
          postedAt:  new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(socialPosts.id, input),
          eq(socialPosts.ownerId, ctx.user.id),
          sql`status IN ('draft','planned')`,
        ))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code:    "NOT_FOUND",
          message: "Post not found or already marked as posted.",
        });
      }
      return updated;
    }),
});
