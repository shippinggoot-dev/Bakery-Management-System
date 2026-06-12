import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { feedback, FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@bakery/db";
import { isSuperAdmin } from "../lib/permissions";

const CategoryEnum = z.enum(FEEDBACK_CATEGORIES);
const StatusEnum   = z.enum(FEEDBACK_STATUSES);

/**
 * Fire-and-forget Discord webhook ping. Sends only the minimum needed for
 * the admin to know something arrived; the actual content lives in the DB.
 * Failures are swallowed — feedback must still be saved even if Discord
 * is down or the webhook URL is misconfigured.
 */
async function notifyDiscord(args: {
  category: string;
  submittedByEmail: string | null;
  adminUrl: string;
}) {
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const colour: Record<string, number> = {
    bug:      0xE74C3C, // red
    idea:     0xF1C40F, // yellow
    question: 0x3498DB, // blue
    other:    0x95A5A6, // grey
  };

  const payload = {
    embeds: [{
      title: `New ${args.category} feedback`,
      description: `From: **${args.submittedByEmail ?? "anonymous"}**\n\n[Open in admin →](${args.adminUrl})`,
      color: colour[args.category] ?? 0x95A5A6,
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch {
    // Discord is best-effort. The feedback row is already saved.
  }
}

function assertSuperAdmin(ctx: { user: { id: string; email: string | null; isAnonymous: boolean } }) {
  if (!isSuperAdmin(ctx.user)) {
    // 404 rather than 403 — don't leak the existence of admin endpoints.
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const feedbackRouter = createTRPCRouter({

  /**
   * Submit feedback. Open to any authenticated user — including anonymous
   * demo users, because they might hit bugs too. Storage upload happens
   * client-side; this endpoint just records the path.
   */
  submit: protectedProcedure
    .input(z.object({
      category:       CategoryEnum,
      message:        z.string().trim().min(1).max(5000),
      pageUrl:        z.string().max(500).optional(),
      language:       z.string().max(10).optional(),
      userAgent:      z.string().max(500).optional(),
      screenshotPath: z.string().max(500).nullable().optional(),
      attachmentPath: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(feedback).values({
        submittedBy:       ctx.user.id,
        submittedByEmail:  ctx.user.email,
        category:          input.category,
        message:           input.message,
        pageUrl:           input.pageUrl ?? null,
        language:          input.language ?? null,
        userAgent:         input.userAgent ?? null,
        screenshotPath:    input.screenshotPath ?? null,
        attachmentPath:    input.attachmentPath ?? null,
      }).returning();

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.SHOPIFY_APP_URL ||
        "https://bakery-management-system-web.vercel.app";

      void notifyDiscord({
        category:         input.category,
        submittedByEmail: ctx.user.email,
        adminUrl:         `${appUrl}/feedback`,
      });

      return { id: row!.id };
    }),

  /** List all feedback for the super admin triage page. */
  list: protectedProcedure
    .input(z.object({
      status: StatusEnum.optional(),
      limit:  z.number().int().min(1).max(200).default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      assertSuperAdmin(ctx);
      const { status, limit = 100 } = input ?? {};
      return ctx.db.query.feedback.findMany({
        where:   status ? eq(feedback.status, status) : undefined,
        orderBy: [desc(feedback.createdAt)],
        limit,
      });
    }),

  /** Update status (handled / dismissed / back to new). */
  setStatus: protectedProcedure
    .input(z.object({
      id:     z.string().uuid(),
      status: StatusEnum,
    }))
    .mutation(async ({ ctx, input }) => {
      assertSuperAdmin(ctx);
      await ctx.db.update(feedback)
        .set({
          status:    input.status,
          handledAt: input.status === "new" ? null : new Date(),
        })
        .where(eq(feedback.id, input.id));
    }),

  /** Convenience flag for the floating button — does the caller see the admin page? */
  amSuperAdmin: protectedProcedure.query(({ ctx }) => isSuperAdmin(ctx.user)),
});
