import { z } from "zod";
import { eq, and, gte, lte, desc, inArray, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, nonAnonymousProcedure } from "../trpc";
import {
  instagramConnections,
  instagramPosts,
  instagramDrafts,
  encryptToken,
} from "@bakery/db";
import { publishToInstagram } from "../lib/instagram-publish";
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

const draftStatusSchema = z.enum(["draft", "scheduled", "published", "failed"]);
const userEditableStatusSchema = z.enum(["draft", "scheduled"]);

export const instagramRouter = createTRPCRouter({

  // ── Connection management ──────────────────────────────────────────────────

  getConnection: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.instagramConnections.findFirst({
      where: eq(instagramConnections.ownerId, ctx.user.id),
    });
    if (!row) return { connected: false as const };
    return {
      connected:   true as const,
      igUserId:    row.igUserId,
      igUsername:  row.igUsername,
      pageName:    row.pageName,
      expiresAt:   row.tokenExpiresAt,
    };
  }),

  /** Called by the OAuth callback API route after token exchange. */
  saveConnection: nonAnonymousProcedure
    .input(z.object({
      igUserId:       z.string(),
      igUsername:     z.string().nullable(),
      pageId:         z.string().nullable(),
      pageName:       z.string().nullable(),
      accessToken:    z.string(),
      tokenExpiresAt: z.date().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const encryptedAccessToken = encryptToken(input.accessToken);
      await ctx.db
        .insert(instagramConnections)
        .values({
          ownerId:        ctx.user.id,
          igUserId:       input.igUserId,
          igUsername:     input.igUsername,
          pageId:         input.pageId,
          pageName:       input.pageName,
          accessToken:    encryptedAccessToken,
          tokenExpiresAt: input.tokenExpiresAt,
        })
        .onConflictDoUpdate({
          target: instagramConnections.ownerId,
          set: {
            igUserId:       input.igUserId,
            igUsername:     input.igUsername,
            pageId:         input.pageId,
            pageName:       input.pageName,
            accessToken:    encryptedAccessToken,
            tokenExpiresAt: input.tokenExpiresAt,
            updatedAt:      new Date(),
          },
        });
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(instagramConnections)
      .where(eq(instagramConnections.ownerId, ctx.user.id));
  }),

  // ── Instant publishing (existing UI contract preserved) ─────────────────────

  /**
   * Post immediately, without going through a draft. Kept for backward
   * compatibility with the original /social composer that calls createPost
   * directly. New code should prefer createDraft + publishDraftNow.
   */
  createPost: nonAnonymousProcedure
    .input(z.object({
      imageUrl: z.string().url(),
      caption:  z.string().max(2200),
    }))
    .mutation(async ({ ctx, input }) => {
      const safeUrl = validateOrThrow(input.imageUrl);
      const result = await publishToInstagram({
        ownerId:  ctx.user.id,
        imageUrl: safeUrl,
        caption:  input.caption,
      });
      if (result.status === "failed") {
        throw new TRPCError({
          code:    "INTERNAL_SERVER_ERROR",
          message: result.errorMessage ?? "Post failed.",
        });
      }
      return { igMediaId: result.igMediaId };
    }),

  getPosts: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.instagramPosts.findMany({
      where: eq(instagramPosts.ownerId, ctx.user.id),
      orderBy: [desc(instagramPosts.createdAt)],
      limit: 20,
    });
  }),

  // ── Drafts & scheduling ────────────────────────────────────────────────────

  /**
   * List drafts for calendar / drafts view. Optionally filter by status or by
   * scheduledFor date range. Returns ALL matching rows; UI is responsible for
   * presenting them grouped (drafts vs scheduled vs published vs failed).
   */
  listDrafts: protectedProcedure
    .input(z.object({
      status: draftStatusSchema.optional(),
      from:   z.date().optional(),
      to:     z.date().optional(),
      limit:  z.number().min(1).max(500).default(200),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: SQL[] = [eq(instagramDrafts.ownerId, ctx.user.id)];
      if (input?.status) conditions.push(eq(instagramDrafts.status, input.status));
      if (input?.from)   conditions.push(gte(instagramDrafts.scheduledFor, input.from));
      if (input?.to)     conditions.push(lte(instagramDrafts.scheduledFor, input.to));

      return ctx.db.query.instagramDrafts.findMany({
        where:   and(...conditions),
        orderBy: [desc(instagramDrafts.scheduledFor), desc(instagramDrafts.createdAt)],
        limit:   input?.limit ?? 200,
      });
    }),

  /**
   * Create a draft. If scheduledFor is provided and in the future, status
   * starts as "scheduled" and the cron worker will pick it up at that time.
   * If scheduledFor is null, status starts as "draft" — user can add a
   * schedule later via updateDraft.
   */
  createDraft: protectedProcedure
    .input(z.object({
      imageUrl:     z.string().url().optional().nullable(),
      caption:      z.string().max(2200).optional().nullable(),
      scheduledFor: z.date().optional().nullable(),
      platforms:    z.array(z.string()).max(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Refuse past-dated schedules — user almost certainly didn't mean it.
      if (input.scheduledFor && input.scheduledFor.getTime() < Date.now()) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: "Scheduled time must be in the future.",
        });
      }
      const safeImageUrl = input.imageUrl ? validateOrThrow(input.imageUrl) : null;
      const status = input.scheduledFor ? "scheduled" : "draft";
      const [draft] = await ctx.db.insert(instagramDrafts).values({
        ownerId:      ctx.user.id,
        imageUrl:     safeImageUrl,
        caption:      input.caption ?? null,
        scheduledFor: input.scheduledFor ?? null,
        status,
        platforms:    input.platforms ?? ["instagram"],
      }).returning();
      return draft;
    }),

  /**
   * Edit a draft. Only allowed while the draft is in an editable state
   * (draft, scheduled, failed). Published or in-flight (publishing) drafts
   * are immutable from the user side.
   *
   * If scheduledFor changes between null and a date, status auto-flips
   * between "draft" and "scheduled" unless the caller passed an explicit
   * status override.
   */
  updateDraft: protectedProcedure
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
          message: "Scheduled time must be in the future.",
        });
      }

      // Validate replacement imageUrl (if provided) against the Supabase
      // bucket allowlist. Null is a deliberate clear and stays as-is.
      if (patch.imageUrl) {
        patch.imageUrl = validateOrThrow(patch.imageUrl);
      }

      // Infer status from scheduledFor change when the caller didn't specify
      const inferredStatus: { status?: "draft" | "scheduled" } =
        patch.scheduledFor !== undefined && patch.status === undefined
          ? { status: patch.scheduledFor ? "scheduled" : "draft" }
          : {};

      const [updated] = await ctx.db
        .update(instagramDrafts)
        .set({ ...patch, ...inferredStatus, updatedAt: new Date() })
        .where(and(
          eq(instagramDrafts.id, id),
          eq(instagramDrafts.ownerId, ctx.user.id),
          inArray(instagramDrafts.status, ["draft", "scheduled", "failed"]),
        ))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code:    "NOT_FOUND",
          message: "Draft not found or no longer editable.",
        });
      }
      return updated;
    }),

  deleteDraft: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(instagramDrafts)
        .where(and(
          eq(instagramDrafts.id, input),
          eq(instagramDrafts.ownerId, ctx.user.id),
        ));
      return { ok: true };
    }),

  /**
   * Publish a draft immediately, bypassing its schedule. Used for "post
   * now" actions from the drafts list. On success, status flips to
   * "published" and igMediaId is recorded.
   *
   * Concurrency safety: claims the row atomically by flipping status to
   * "publishing" in an UPDATE...RETURNING gated on the previous status
   * being draft/scheduled/failed. If the cron worker (or another tab)
   * already claimed it, the update returns no row and we refuse — this
   * is what prevents double-publish.
   */
  publishDraftNow: nonAnonymousProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      // Validate BEFORE the atomic claim. If the imageUrl/caption check ran
      // after the claim, a failed validation would revert status to "draft"
      // even when the draft was originally "scheduled" — silently killing
      // the user's schedule. The tiny race window between this SELECT and
      // the UPDATE below is acceptable because only the row's owner can
      // mutate it.
      const draft = await ctx.db.query.instagramDrafts.findFirst({
        where: and(
          eq(instagramDrafts.id, input),
          eq(instagramDrafts.ownerId, ctx.user.id),
          inArray(instagramDrafts.status, ["draft", "scheduled", "failed"]),
        ),
      });
      if (!draft) {
        throw new TRPCError({
          code:    "NOT_FOUND",
          message: "Draft not found or already published.",
        });
      }
      if (!draft.imageUrl || !draft.caption) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: "Draft needs both an image and a caption before posting.",
        });
      }

      const [claimed] = await ctx.db
        .update(instagramDrafts)
        .set({ status: "publishing", updatedAt: new Date() })
        .where(and(
          eq(instagramDrafts.id, input),
          eq(instagramDrafts.ownerId, ctx.user.id),
          inArray(instagramDrafts.status, ["draft", "scheduled", "failed"]),
        ))
        .returning();

      if (!claimed) {
        throw new TRPCError({
          code:    "NOT_FOUND",
          message: "Draft is already being published.",
        });
      }

      const result = await publishToInstagram({
        ownerId:  ctx.user.id,
        imageUrl: draft.imageUrl,
        caption:  draft.caption,
      });

      await ctx.db
        .update(instagramDrafts)
        .set({
          status:       result.status === "posted" ? "published" : "failed",
          igMediaId:    result.igMediaId,
          publishedAt:  result.status === "posted" ? new Date() : null,
          errorMessage: result.errorMessage,
          updatedAt:    new Date(),
        })
        .where(eq(instagramDrafts.id, claimed.id));

      if (result.status === "failed") {
        throw new TRPCError({
          code:    "INTERNAL_SERVER_ERROR",
          message: result.errorMessage ?? "Publish failed.",
        });
      }
      return { igMediaId: result.igMediaId };
    }),
});
