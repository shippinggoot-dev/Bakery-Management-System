/**
 * AI assistant router — quota visibility + upgrade flow placeholder.
 *
 * Step 4 of the social planner feature delivers the *foundation* for AI
 * features. The actual generation endpoints (caption / weekly plan / brand
 * voice) come in steps 5-7 and will live in this same router.
 *
 * Endpoints today:
 *   - getQuotaUsage    — what the user has used vs their tier's monthly limit
 *   - getConfigStatus  — whether AI is wired up at all (env var present?)
 *   - startUpgrade     — returns the URL the "Upgrade" button should navigate
 *                        to. Today: a mailto: link. When Stripe ships: a
 *                        Stripe Checkout session URL. The UI does not need
 *                        to change when that switch happens.
 */

import { z } from "zod";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, nonAnonymousProcedure } from "../trpc";
import { recipes, premadeCakes, brandVoice, instagramPosts } from "@bakery/db";
import { checkQuota, recordUsage, getMonthlyUsageSummary } from "../lib/ai-quota";
import {
  isClaudeConfigured,
  generateCaption,
  learnBrandVoice,
  generateWeeklyPlan,
  MIN_CAPTIONS_FOR_VOICE_ANALYSIS,
} from "../lib/ai-client";
import { calculateCostCents } from "../lib/ai-cost";

// ─── Norwegian holiday helper ────────────────────────────────────────────────
// Static map for the most relevant dates a Norwegian baker cares about. Easier
// to maintain than a full Easter-computation library, and the dates rarely
// change. Update annually or when a new year approaches.

const NORWEGIAN_HOLIDAYS: Record<string, { en: string; nb: string }> = {
  // 2026
  "2026-01-01": { en: "New Year's Day",         nb: "Nyttårsdag" },
  "2026-02-08": { en: "Mother's Day",            nb: "Morsdag" },
  "2026-04-02": { en: "Maundy Thursday",         nb: "Skjærtorsdag" },
  "2026-04-03": { en: "Good Friday",             nb: "Langfredag" },
  "2026-04-05": { en: "Easter Sunday",           nb: "1. påskedag" },
  "2026-04-06": { en: "Easter Monday",           nb: "2. påskedag" },
  "2026-05-01": { en: "Labour Day",              nb: "Arbeidernes dag" },
  "2026-05-14": { en: "Ascension Day",           nb: "Kristi himmelfartsdag" },
  "2026-05-17": { en: "Constitution Day",        nb: "Grunnlovsdag" },
  "2026-05-24": { en: "Pentecost Sunday",        nb: "1. pinsedag" },
  "2026-05-25": { en: "Pentecost Monday",        nb: "2. pinsedag" },
  "2026-11-08": { en: "Father's Day",            nb: "Farsdag" },
  "2026-12-24": { en: "Christmas Eve",           nb: "Julaften" },
  "2026-12-25": { en: "Christmas Day",           nb: "1. juledag" },
  "2026-12-26": { en: "Boxing Day",              nb: "2. juledag" },
  "2026-12-31": { en: "New Year's Eve",          nb: "Nyttårsaften" },
};

function holidayFor(date: string, language: "en" | "nb"): string | null {
  const h = NORWEGIAN_HOLIDAYS[date];
  return h ? h[language] : null;
}

/** Format YYYY-MM-DD in UTC — same key the holidays map uses */
function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Contact email shown in the upgrade-placeholder flow. Configurable via env
 * so it can be set per-environment without code changes. Falls back to a
 * generic placeholder so the system doesn't error if the var is unset —
 * the user just sees "[set SUPPORT_EMAIL]" and knows to configure it.
 */
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "[set SUPPORT_EMAIL]";

export const aiAssistantRouter = createTRPCRouter({

  /**
   * Returns the user's AI quota usage for the current calendar month, plus
   * the limits for their tier. UI uses this to render the quota indicator
   * and to grey out AI buttons when limits are hit.
   */
  getQuotaUsage: protectedProcedure.query(async ({ ctx }) => {
    return getMonthlyUsageSummary(ctx.db, ctx.user.id);
  }),

  /**
   * Whether AI features are configured at the platform level. The UI calls
   * this to decide whether to show "AI not configured" messaging on AI
   * buttons. Returning a boolean rather than throwing means non-AI parts
   * of the social planner keep working even when the key is absent.
   */
  getConfigStatus: protectedProcedure.query(() => {
    return { configured: isClaudeConfigured() };
  }),

  /**
   * The upgrade flow. Today: returns a mailto: URL the UI redirects to.
   * Tomorrow: returns a Stripe Checkout session URL via the same shape.
   * The UI just calls window.location.href = url — same code, different
   * destination.
   */
  startUpgrade: protectedProcedure
    .input(z.object({
      // Future: pass the tier or price ID the user wants. Today we accept
      // it but only use it to construct the email body.
      targetTier: z.enum(["pro"]).default("pro"),
    }))
    .mutation(async ({ ctx, input }) => {
      const subject = `Upgrade request — ${input.targetTier} tier`;
      const body    = [
        `Hi,`,
        ``,
        `I'd like to upgrade to the ${input.targetTier} tier for AI features.`,
        ``,
        `Account: ${ctx.user.email ?? ctx.user.id}`,
      ].join("\n");

      const url = `mailto:${SUPPORT_EMAIL}`
        + `?subject=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`;

      return {
        provider: "mailto" as const,  // future: "stripe"
        url,
      };
    }),

  /**
   * Generate an Instagram caption for a product the user picks from their
   * catalog. Costs 1 quota point. Returns the generated caption + hashtags
   * for the UI to display in a preview; the user must explicitly accept
   * before it lands in their composer (or saved draft).
   *
   * Failure handling:
   *   - Quota exhausted   → throws FORBIDDEN, no usage recorded
   *   - AI not configured → throws PRECONDITION_FAILED, no usage recorded
   *   - Product not found → throws NOT_FOUND, no usage recorded
   *   - Claude call fails → records usage row as outcome="error" (so the
   *     user pays for the attempt — prevents retry abuse on flaky network)
   *     and re-throws INTERNAL_SERVER_ERROR
   */
  generateCaption: nonAnonymousProcedure
    .input(z.object({
      productType: z.enum(["recipe", "premade"]),
      productId:   z.string().uuid(),
      /** UI passes the user's current locale so Claude responds in the right language */
      language:    z.enum(["en", "nb"]).default("en"),
      /** Optional one-word or short-phrase steer */
      toneHint:    z.string().max(80).optional(),
      /** Bakery name for the prompt — UI passes from user's personalization setting */
      bakeryName:  z.string().min(1).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Configuration check — surface this as "not configured" so the UI
      //    can show a clear setup message rather than a generic error.
      if (!isClaudeConfigured()) {
        throw new TRPCError({
          code:    "PRECONDITION_FAILED",
          message: "AI features are not configured on this server.",
        });
      }

      // 2. Quota check — refuse before spending any tokens.
      const quota = await checkQuota(ctx.db, ctx.user.id, "caption");
      if (!quota.allowed) {
        throw new TRPCError({
          code:    "FORBIDDEN",
          message: `Monthly caption limit reached (${quota.used}/${quota.limit}). Resets ${quota.resetsAt.toISOString().slice(0, 10)}.`,
        });
      }

      // 3. Load the product the user picked. Two table shapes; normalize
      //    into the inputs the caption helper expects.
      let productInputs: {
        name:        string;
        description: string | null;
        priceKr:     string | null;
        allergens:   string[];
      };

      if (input.productType === "recipe") {
        const recipe = await ctx.db.query.recipes.findFirst({
          where: and(eq(recipes.id, input.productId), eq(recipes.ownerId, ctx.user.id)),
          columns: { name: true, description: true, sellingPrice: true },
        });
        if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found." });
        productInputs = {
          name:        recipe.name,
          description: recipe.description,
          priceKr:     recipe.sellingPrice,
          // Recipes' allergens require a join to ingredient_allergens — too
          // heavy for v1. The user can edit the caption if allergens are
          // safety-critical for their audience.
          allergens:   [],
        };
      } else {
        const cake = await ctx.db.query.premadeCakes.findFirst({
          where: and(eq(premadeCakes.id, input.productId), eq(premadeCakes.ownerId, ctx.user.id)),
          columns: { name: true, description: true, basePrice: true, allergens: true },
        });
        if (!cake) throw new TRPCError({ code: "NOT_FOUND", message: "Premade cake not found." });
        productInputs = {
          name:        cake.name,
          description: cake.description,
          priceKr:     cake.basePrice,
          allergens:   cake.allergens
            ? cake.allergens.split(",").map((a) => a.trim()).filter(Boolean)
            : [],
        };
      }

      // 4. Load brand voice if the user has learned one (step 6 wires this).
      //    Missing brand voice is normal — generateCaption falls back to a
      //    sensible default.
      const voiceRow = await ctx.db.query.brandVoice.findFirst({
        where: eq(brandVoice.ownerId, ctx.user.id),
        columns: { voiceDescription: true },
      });

      // 5. Make the AI call. Wrap in try/finally so usage is recorded
      //    regardless of outcome — failures still consume quota.
      try {
        const result = await generateCaption({
          bakeryName: input.bakeryName,
          language:   input.language,
          brandVoice: voiceRow?.voiceDescription ?? null,
          product:    productInputs,
          toneHint:   input.toneHint,
        });

        await recordUsage(ctx.db, ctx.user.id, {
          feature:      "caption",
          inputTokens:  result.usage.inputTokens + result.usage.cacheReadInputTokens + result.usage.cacheCreationInputTokens,
          outputTokens: result.usage.outputTokens,
          costCents:    calculateCostCents(result.usage),
          outcome:      "ok",
        });

        return result.data;
      } catch (err) {
        // Best-effort usage record on failure. Even if Claude itself never
        // billed us (network error before send), recording the attempt
        // prevents the user from spamming the endpoint.
        await recordUsage(ctx.db, ctx.user.id, {
          feature:      "caption",
          inputTokens:  0,
          outputTokens: 0,
          costCents:    0,
          outcome:      "error",
        }).catch(() => { /* swallow — primary error is more important */ });

        const msg = err instanceof Error ? err.message : "AI generation failed.";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  /**
   * Read the bakery's current learned brand voice. Returns null if no voice
   * has been learned yet (in which case generateCaption falls back to the
   * sensible default in ai-client.ts).
   *
   * Also reports how many past captions the user has — the UI uses this to
   * decide whether to enable / disable the "Refresh brand voice" button.
   */
  getBrandVoice: protectedProcedure.query(async ({ ctx }) => {
    const [voiceRow, postsCountRow] = await Promise.all([
      ctx.db.query.brandVoice.findFirst({
        where: eq(brandVoice.ownerId, ctx.user.id),
      }),
      ctx.db
        .select({ count: instagramPosts.id })
        .from(instagramPosts)
        .where(and(
          eq(instagramPosts.ownerId, ctx.user.id),
          eq(instagramPosts.status, "posted"),
          isNotNull(instagramPosts.caption),
        ))
        .limit(50),  // we only need to know "is it ≥ MIN", not the exact count
    ]);

    const captionCount = postsCountRow.length;
    const exampleCaptions = (voiceRow?.exampleCaptions ?? []) as string[];

    return {
      voiceDescription: voiceRow?.voiceDescription ?? null,
      exampleCaptions,
      generatedAt:      voiceRow?.generatedAt      ?? null,
      updatedAt:        voiceRow?.updatedAt        ?? null,
      captionCount,
      minRequired:      MIN_CAPTIONS_FOR_VOICE_ANALYSIS,
      eligible:         captionCount >= MIN_CAPTIONS_FOR_VOICE_ANALYSIS,
    };
  }),

  /**
   * Analyze the bakery's recent posted captions and store the learned voice.
   * Costs 1 brand_voice quota point. Subsequent generateCaption calls will
   * automatically pick up the new voice (already wired — no caption code
   * change needed).
   */
  learnBrandVoice: nonAnonymousProcedure
    .input(z.object({
      language:   z.enum(["en", "nb"]).default("en"),
      bakeryName: z.string().min(1).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isClaudeConfigured()) {
        throw new TRPCError({
          code:    "PRECONDITION_FAILED",
          message: "AI features are not configured on this server.",
        });
      }

      const quota = await checkQuota(ctx.db, ctx.user.id, "brand_voice");
      if (!quota.allowed) {
        throw new TRPCError({
          code:    "FORBIDDEN",
          message: `Monthly brand voice limit reached (${quota.used}/${quota.limit}). Resets ${quota.resetsAt.toISOString().slice(0, 10)}.`,
        });
      }

      // Load the 20 most recent successfully-posted captions
      const recentPosts = await ctx.db.query.instagramPosts.findMany({
        where: and(
          eq(instagramPosts.ownerId, ctx.user.id),
          eq(instagramPosts.status, "posted"),
          isNotNull(instagramPosts.caption),
        ),
        orderBy: [desc(instagramPosts.postedAt)],
        limit:   20,
        columns: { caption: true },
      });

      const captions = recentPosts
        .map((p) => p.caption?.trim() ?? "")
        .filter((c) => c.length > 0);

      if (captions.length < MIN_CAPTIONS_FOR_VOICE_ANALYSIS) {
        throw new TRPCError({
          code:    "PRECONDITION_FAILED",
          message: `Need at least ${MIN_CAPTIONS_FOR_VOICE_ANALYSIS} posted captions to analyze your voice. You have ${captions.length}.`,
        });
      }

      try {
        const result = await learnBrandVoice({
          bakeryName: input.bakeryName,
          language:   input.language,
          captions,
        });

        // Upsert the brand voice row
        await ctx.db
          .insert(brandVoice)
          .values({
            ownerId:          ctx.user.id,
            voiceDescription: result.data.voiceDescription,
            exampleCaptions:  result.data.exampleCaptions,
            generatedAt:      new Date(),
          })
          .onConflictDoUpdate({
            target: brandVoice.ownerId,
            set: {
              voiceDescription: result.data.voiceDescription,
              exampleCaptions:  result.data.exampleCaptions,
              generatedAt:      new Date(),
              updatedAt:        new Date(),
            },
          });

        await recordUsage(ctx.db, ctx.user.id, {
          feature:      "brand_voice",
          inputTokens:  result.usage.inputTokens + result.usage.cacheReadInputTokens + result.usage.cacheCreationInputTokens,
          outputTokens: result.usage.outputTokens,
          costCents:    calculateCostCents(result.usage),
          outcome:      "ok",
        });

        return {
          voiceDescription: result.data.voiceDescription,
          exampleCaptions:  result.data.exampleCaptions,
          analyzedCount:    captions.length,
        };
      } catch (err) {
        await recordUsage(ctx.db, ctx.user.id, {
          feature:      "brand_voice",
          inputTokens:  0,
          outputTokens: 0,
          costCents:    0,
          outcome:      "error",
        }).catch(() => { /* swallow */ });

        const msg = err instanceof Error ? err.message : "Brand voice analysis failed.";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  /**
   * Generate a 7-day content plan for an upcoming week. Pulls the bakery's
   * catalog (active items only), recent post history, brand voice (if
   * learned), and Norwegian holiday context, then asks Claude to propose
   * a daily post for the target week.
   *
   * Costs 1 weekly_plan quota point (= 4× a single caption — reflected only
   * in the cost calculation, not in the quota system; the quota system
   * treats each feature independently).
   *
   * Returns the 7 proposed posts plus a mapping of suggested product names
   * back to catalog UUIDs (when the model picked a real product) so the
   * UI's "Accept" action can create drafts with proper recipe links.
   */
  generateWeeklyPlan: nonAnonymousProcedure
    .input(z.object({
      language:   z.enum(["en", "nb"]).default("en"),
      bakeryName: z.string().min(1).max(80),
      /** First date of the target week, YYYY-MM-DD (must be in the future or today) */
      weekStart:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isClaudeConfigured()) {
        throw new TRPCError({
          code:    "PRECONDITION_FAILED",
          message: "AI features are not configured on this server.",
        });
      }

      const quota = await checkQuota(ctx.db, ctx.user.id, "weekly_plan");
      if (!quota.allowed) {
        throw new TRPCError({
          code:    "FORBIDDEN",
          message: `Monthly plan limit reached (${quota.used}/${quota.limit}). Resets ${quota.resetsAt.toISOString().slice(0, 10)}.`,
        });
      }

      // Build the 7-day window from weekStart in UTC
      const startUtc = new Date(`${input.weekStart}T00:00:00Z`);
      if (isNaN(startUtc.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid weekStart date." });
      }
      const weekdayNames = input.language === "nb"
        ? ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"]
        : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const week = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startUtc.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = ymdUtc(d);
        return {
          date:    dateStr,
          weekday: weekdayNames[d.getUTCDay()]!,
          holiday: holidayFor(dateStr, input.language),
        };
      });

      // Load catalog — active items only, capped at 30 to bound token usage
      const [recipeRows, premadeRows, voiceRow, recentPosts] = await Promise.all([
        ctx.db.query.recipes.findMany({
          where:    eq(recipes.ownerId, ctx.user.id),
          columns:  { id: true, name: true, description: true, sellingPrice: true },
          orderBy:  [desc(recipes.updatedAt)],
          limit:    30,
        }),
        ctx.db.query.premadeCakes.findMany({
          where: and(
            eq(premadeCakes.ownerId, ctx.user.id),
            eq(premadeCakes.isActive, true),
          ),
          columns: { id: true, name: true, description: true, basePrice: true },
          orderBy: [desc(premadeCakes.updatedAt)],
          limit:   30,
        }),
        ctx.db.query.brandVoice.findFirst({
          where: eq(brandVoice.ownerId, ctx.user.id),
          columns: { voiceDescription: true },
        }),
        ctx.db.query.instagramPosts.findMany({
          where: and(
            eq(instagramPosts.ownerId, ctx.user.id),
            eq(instagramPosts.status, "posted"),
            isNotNull(instagramPosts.caption),
          ),
          orderBy: [desc(instagramPosts.postedAt)],
          limit:   10,
          columns: { caption: true },
        }),
      ]);

      const catalog = [
        ...recipeRows.map((r) => ({
          name:        r.name,
          description: r.description,
          priceKr:     r.sellingPrice,
          kind:        "recipe" as const,
        })),
        ...premadeRows.map((p) => ({
          name:        p.name,
          description: p.description,
          priceKr:     p.basePrice,
          kind:        "premade" as const,
        })),
      ];

      if (catalog.length === 0) {
        throw new TRPCError({
          code:    "PRECONDITION_FAILED",
          message: "Add at least one recipe or premade cake to your catalog before generating a plan.",
        });
      }

      const recentCaptions = recentPosts
        .map((p) => p.caption?.trim() ?? "")
        .filter((c) => c.length > 0);

      try {
        const result = await generateWeeklyPlan({
          bakeryName:  input.bakeryName,
          language:    input.language,
          brandVoice:  voiceRow?.voiceDescription ?? null,
          catalog,
          recentCaptions,
          week,
        });

        await recordUsage(ctx.db, ctx.user.id, {
          feature:      "weekly_plan",
          inputTokens:  result.usage.inputTokens + result.usage.cacheReadInputTokens + result.usage.cacheCreationInputTokens,
          outputTokens: result.usage.outputTokens,
          costCents:    calculateCostCents(result.usage),
          outcome:      "ok",
        });

        // Resolve productName references back to catalog UUIDs so the UI's
        // "Accept" action can create drafts with the right recipe link.
        // Case-insensitive exact name match; null when Claude picked a name
        // that doesn't exist (or chose a non-product theme).
        const nameToProduct = new Map<string, { id: string; type: "recipe" | "premade" }>();
        for (const r of recipeRows)  nameToProduct.set(r.name.toLowerCase(), { id: r.id, type: "recipe"  });
        for (const p of premadeRows) nameToProduct.set(p.name.toLowerCase(), { id: p.id, type: "premade" });

        const posts = result.data.posts.map((p) => {
          const product = p.productName ? nameToProduct.get(p.productName.toLowerCase()) ?? null : null;
          return {
            date:           p.date,
            theme:          p.theme,
            suggestedTime:  p.suggestedTime,
            captionDraft:   p.captionDraft,
            hashtags:       p.hashtags,
            rationale:      p.rationale,
            productName:    p.productName,
            productId:      product?.id   ?? null,
            productType:    product?.type ?? null,
          };
        });

        return { posts };
      } catch (err) {
        await recordUsage(ctx.db, ctx.user.id, {
          feature:      "weekly_plan",
          inputTokens:  0,
          outputTokens: 0,
          costCents:    0,
          outcome:      "error",
        }).catch(() => { /* swallow */ });

        const msg = err instanceof Error ? err.message : "Weekly plan generation failed.";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),
});
