/**
 * Quota check + usage recording for AI features.
 *
 * Lifecycle:
 *   1. Caller invokes `checkQuota(db, userId, feature)` before any AI call.
 *      → If the user has no subscriptions row yet, one is created lazily at
 *        the "free" tier. This is the single place where free-tier defaults
 *        are materialized.
 *      → Returns { allowed, used, limit, resetsAt }; caller refuses or
 *        proceeds based on `allowed`.
 *   2. Caller makes the Claude API call.
 *   3. Caller invokes `recordUsage(db, userId, feature, ...)` with whatever
 *      came back — including failed calls (which still consume quota to
 *      prevent retry abuse).
 *
 * Quota window: calendar month (UTC). The next reset is the first day of
 * the following month at 00:00 UTC. When Stripe ships, paid tiers will
 * track `current_period_end` instead — that's why the column is already
 * there but null today.
 */

import { sql, and, eq, gte } from "drizzle-orm";
import { aiUsage, subscriptions } from "@bakery/db";
import type { Database } from "@bakery/db";
import { getFeatureLimit, normalizeTier, type AiFeature, type TierId } from "./ai-tiers";

/**
 * First day of the current month at 00:00 UTC.
 * Quota counts every ai_usage row created on or after this moment.
 */
function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * First day of next month at 00:00 UTC — what the UI shows as "Resets on…".
 */
function startOfNextMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Get the user's tier; create a default free-tier subscriptions row if
 * one doesn't exist yet. Returns the tier string. Idempotent.
 */
export async function getOrCreateSubscriptionTier(
  db:      Database,
  ownerId: string,
): Promise<TierId> {
  const existing = await db.query.subscriptions.findFirst({
    where:    eq(subscriptions.ownerId, ownerId),
    columns:  { tier: true },
  });
  if (existing) return normalizeTier(existing.tier);

  await db.insert(subscriptions).values({ ownerId, tier: "free" }).onConflictDoNothing();
  return "free";
}

export interface QuotaCheck {
  allowed:   boolean;
  used:      number;
  limit:     number;
  resetsAt:  Date;
  tier:      TierId;
}

/**
 * Check whether the user has quota remaining for a feature this month.
 * Does NOT increment usage — caller must invoke recordUsage() after the
 * actual Claude call.
 */
export async function checkQuota(
  db:      Database,
  ownerId: string,
  feature: AiFeature,
): Promise<QuotaCheck> {
  const tier  = await getOrCreateSubscriptionTier(db, ownerId);
  const limit = getFeatureLimit(tier, feature);

  // Count usage for this feature in the current calendar month
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(
      eq(aiUsage.ownerId,  ownerId),
      eq(aiUsage.feature,  feature),
      gte(aiUsage.createdAt, startOfMonthUtc()),
    ));

  const used = count ?? 0;
  return {
    allowed:   used < limit,
    used,
    limit,
    resetsAt:  startOfNextMonthUtc(),
    tier,
  };
}

/**
 * Record one Claude API call's usage. Always called by the AI feature
 * routers, whether the call succeeded or errored — failed calls still
 * count against the quota so a user can't burn through a tier by
 * retrying broken requests.
 */
export async function recordUsage(
  db:      Database,
  ownerId: string,
  args: {
    feature:      AiFeature;
    inputTokens:  number;
    outputTokens: number;
    costCents:    number;
    outcome:      "ok" | "error";
  },
): Promise<void> {
  await db.insert(aiUsage).values({
    ownerId,
    feature:      args.feature,
    inputTokens:  args.inputTokens,
    outputTokens: args.outputTokens,
    costCents:    String(args.costCents),  // numeric column wants string
    outcome:      args.outcome,
  });
}

/**
 * Aggregate "usage this month" across all features for display. Used by
 * the quota indicator in the UI.
 */
export async function getMonthlyUsageSummary(
  db:      Database,
  ownerId: string,
): Promise<{
  tier:        TierId;
  resetsAt:    Date;
  byFeature: {
    caption:     { used: number; limit: number };
    weekly_plan: { used: number; limit: number };
    brand_voice: { used: number; limit: number };
  };
}> {
  const tier = await getOrCreateSubscriptionTier(db, ownerId);

  const rows = await db
    .select({
      feature: aiUsage.feature,
      count:   sql<number>`count(*)::int`,
    })
    .from(aiUsage)
    .where(and(
      eq(aiUsage.ownerId,    ownerId),
      gte(aiUsage.createdAt, startOfMonthUtc()),
    ))
    .groupBy(aiUsage.feature);

  const used: Record<string, number> = {};
  for (const r of rows) used[r.feature] = r.count ?? 0;

  return {
    tier,
    resetsAt: startOfNextMonthUtc(),
    byFeature: {
      caption:     { used: used.caption     ?? 0, limit: getFeatureLimit(tier, "caption") },
      weekly_plan: { used: used.weekly_plan ?? 0, limit: getFeatureLimit(tier, "weekly_plan") },
      brand_voice: { used: used.brand_voice ?? 0, limit: getFeatureLimit(tier, "brand_voice") },
    },
  };
}
