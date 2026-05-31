/**
 * Quota tier definitions — the source of truth for what each subscription
 * level can do. Centralized here so adding a "pro" tier later is one edit:
 * append a new entry and the rest of the system picks it up automatically.
 *
 * Free tier numbers were chosen to keep worst-case per-user monthly cost
 * under €0.20 using Claude Sonnet 4.6 — see ai-cost.ts for the math.
 */

export type TierId = "free" | "pro";

export interface TierQuota {
  /** AI caption generations per calendar month */
  captions:    number;
  /** AI weekly content plan generations per calendar month */
  weeklyPlans: number;
  /** Brand voice analysis runs per calendar month */
  brandVoice:  number;
}

export const TIERS: Record<TierId, TierQuota> = {
  free: {
    captions:    10,
    weeklyPlans: 1,
    brandVoice:  1,
  },
  // Placeholder for the future paid tier. Not sellable yet — no Stripe
  // integration. When upgrade flow is wired up, this row goes live.
  pro: {
    captions:    100,
    weeklyPlans: 4,
    brandVoice:  4,
  },
};

export type AiFeature = "caption" | "weekly_plan" | "brand_voice";

/** Map a feature to the field name on the tier quota object. */
const FEATURE_TO_QUOTA_FIELD: Record<AiFeature, keyof TierQuota> = {
  caption:      "captions",
  weekly_plan:  "weeklyPlans",
  brand_voice:  "brandVoice",
};

/** Get the monthly limit for a feature on a given tier. */
export function getFeatureLimit(tier: TierId, feature: AiFeature): number {
  return TIERS[tier][FEATURE_TO_QUOTA_FIELD[feature]];
}

/** Coerce an unknown tier string back into a known TierId; default to "free". */
export function normalizeTier(tier: string | null | undefined): TierId {
  if (tier === "pro") return "pro";
  return "free";
}
