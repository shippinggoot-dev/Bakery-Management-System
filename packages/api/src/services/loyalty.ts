/**
 * Loyalty Service
 *
 * Handles:
 *   - Points award on sale (with tier multiplier)
 *   - Tier upgrade checks
 *   - Automated rewards: birthday, milestone (every 100 pts), reengagement (30-day lapse)
 *   - Reward redemption
 *   - Card number generation
 *   - Segment evaluation
 */

import { eq, and, desc, gte, lt, isNull, or, inArray } from "drizzle-orm";
import { db } from "@bakery/db";
import {
  customers,
  loyaltyTiers,
  loyaltyTransactions,
  rewards,
  customerSales,
  customerSaleItems,
  customerSegments,
  customerSegmentMembers,
  premadeCakes,
  type SegmentCriteria,
} from "@bakery/db";
import { inventoryService, type DeductionResult } from "./inventory";

// ─── Default tier config (used when owner has no custom tiers) ────────────────

const DEFAULT_TIERS = [
  { name: "Bronze", slug: "bronze", minPoints: 0,    multiplier: "1.0", color: "#CD7F32", perks: JSON.stringify(["Welcome gift on first visit"]) },
  { name: "Silver", slug: "silver", minPoints: 500,  multiplier: "1.5", color: "#C0C0C0", perks: JSON.stringify(["5% discount on every purchase", "Early access to specials"]) },
  { name: "Gold",   slug: "gold",   minPoints: 1500, multiplier: "2.0", color: "#FFD700", perks: JSON.stringify(["10% discount on every purchase", "Free birthday cake slice", "Priority custom orders"]) },
];

// ─── Card number generation ───────────────────────────────────────────────────

export async function generateCardNumber(ownerId: string): Promise<string> {
  const count = await db.$count(customers, eq(customers.ownerId, ownerId));
  const seq   = (count + 1).toString().padStart(6, "0");
  return `BAK-${seq}`;
}

// ─── Get tiers for owner (falls back to defaults if none configured) ──────────

export async function getOwnerTiers(ownerId: string) {
  const tiers = await db.query.loyaltyTiers.findMany({
    where: eq(loyaltyTiers.ownerId, ownerId),
    orderBy: [desc(loyaltyTiers.minPoints)], // highest first → easy to match
  });
  if (tiers.length > 0) return tiers;

  // Seed defaults on first use
  const seeded = await db
    .insert(loyaltyTiers)
    .values(DEFAULT_TIERS.map((t) => ({ ...t, ownerId })))
    .returning();
  return seeded.sort((a, b) => b.minPoints - a.minPoints);
}

// ─── Tier resolution ──────────────────────────────────────────────────────────

function resolveTierFromList(tiers: { slug: string; minPoints: number }[], lifetimePoints: number): string {
  // tiers must be sorted highest minPoints first
  const matched = tiers.find((t) => lifetimePoints >= t.minPoints);
  return matched?.slug ?? "bronze";
}

export async function resolveTier(ownerId: string, lifetimePoints: number): Promise<string> {
  const tiers = await getOwnerTiers(ownerId);
  return resolveTierFromList(tiers, lifetimePoints);
}

// ─── Award points for a sale ─────────────────────────────────────────────────

export async function awardPoints(opts: {
  ownerId: string;
  customerId: string;
  amount: number;      // monetary amount
  currency: string;
  items: string | null;
  notes: string | null;
  rewardRedeemedId?: string | null;
}): Promise<{ saleId: string; pointsAwarded: number; newBalance: number; tierUpgraded: string | null }> {
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, opts.customerId), eq(customers.ownerId, opts.ownerId)),
  });
  if (!customer) throw new Error("Customer not found.");

  // Get multiplier for current tier
  const tiers   = await getOwnerTiers(opts.ownerId);
  const tierRow = tiers.find((t) => t.slug === customer.tier) ?? tiers[tiers.length - 1];
  const multiplier = parseFloat(tierRow?.multiplier ?? "1.0");

  const rawPoints    = Math.floor(opts.amount * multiplier);
  const newPoints    = customer.points + rawPoints;
  const newLifetime  = customer.lifetimePoints + rawPoints;
  const newSpend     = (parseFloat(customer.totalSpend) + opts.amount).toFixed(2);

  // Insert sale record
  const [sale] = await db.insert(customerSales).values({
    ownerId:          opts.ownerId,
    customerId:       opts.customerId,
    amount:           opts.amount.toFixed(2),
    currency:         opts.currency,
    items:            opts.items,
    pointsAwarded:    rawPoints,
    rewardRedeemedId: opts.rewardRedeemedId ?? null,
    notes:            opts.notes,
  }).returning();

  // Resolve new tier — reuse already-fetched tiers, no second DB round-trip
  const newTier      = resolveTierFromList(tiers, newLifetime);
  const tierUpgraded = newTier !== customer.tier ? newTier : null;

  // Update customer
  await db.update(customers).set({
    points:        newPoints,
    lifetimePoints: newLifetime,
    totalSpend:    newSpend,
    tier:          newTier,
    lastVisitAt:   new Date(),
    updatedAt:     new Date(),
  }).where(eq(customers.id, opts.customerId));

  // Write ledger entry
  await db.insert(loyaltyTransactions).values({
    ownerId:       opts.ownerId,
    customerId:    opts.customerId,
    type:          "earn",
    pointsDelta:   rawPoints,
    balanceAfter:  newPoints,
    referenceId:   sale!.id,
    referenceType: "sale",
    description:   `Earned ${rawPoints} pts on ${opts.currency} ${opts.amount.toFixed(2)} purchase`,
  });

  // Run automated reward checks
  await checkAndCreateRewards(opts.customerId, opts.ownerId, newLifetime, newPoints);

  return { saleId: sale!.id, pointsAwarded: rawPoints, newBalance: newPoints, tierUpgraded };
}

// ─── Record a sale with line items + inventory deduction ─────────────────────

export interface SaleItemInput {
  description:   string;
  recipeId?:     string | null;
  premadeCakeId?: string | null;
  quantity:      number;
  unitPrice:     number | null;
}

export interface RecordSaleResult {
  saleId:         string;
  amount:         number;
  pointsAwarded:  number;
  newBalance:     number;
  tierUpgraded:   string | null;
  deductions:     { ingredientId: string; requested: number; deducted: number; insufficient: boolean }[];
  reorderAlerts:  string[];
}

/**
 * Record a sale with structured line items.
 *
 * Behaviour:
 *   1. Insert customer_sales row (customerId may be null for cash sales)
 *   2. Insert customer_sale_items rows
 *   3. For each line with a recipeId (directly or via a linked premadeCake),
 *      call inventoryService.recordProduction so stock deducts via FEFO and
 *      reorder alerts fire automatically
 *   4. If customerId is set, award loyalty points on the total amount
 *
 * Items without a recipe link record revenue but do not touch stock — there
 * is nothing to deduct because they aren't tracked as ingredients.
 */
export async function recordSale(opts: {
  ownerId:    string;
  customerId: string | null;
  currency:   string;
  items:      SaleItemInput[];
  notes:      string | null;
  rewardRedeemedId?: string | null;
}): Promise<RecordSaleResult> {
  if (opts.items.length === 0) {
    throw new Error("Sale must have at least one line item.");
  }

  // Resolve any premade-cake-only items to their backing recipe so deduction
  // can fire. We do this once up-front so the database call is a single batch.
  const premadeIds = opts.items
    .filter((i) => i.premadeCakeId && !i.recipeId)
    .map((i) => i.premadeCakeId!);

  const premadeMap = new Map<string, { recipeId: string | null; basePrice: string }>();
  if (premadeIds.length > 0) {
    const cakes = await db.query.premadeCakes.findMany({
      where: and(
        inArray(premadeCakes.id, premadeIds),
        eq(premadeCakes.ownerId, opts.ownerId),
      ),
      columns: { id: true, recipeId: true, basePrice: true },
    });
    for (const c of cakes) premadeMap.set(c.id, { recipeId: c.recipeId, basePrice: c.basePrice });
  }

  // Compute totals
  let amount = 0;
  const linesWithTotals = opts.items.map((item, idx) => {
    const lineTotal = item.unitPrice !== null ? item.unitPrice * item.quantity : 0;
    amount += lineTotal;
    return { item, lineTotal, sortOrder: idx };
  });

  const itemsBlob = opts.items
    .map((i) => `${i.quantity}× ${i.description}`)
    .join(", ")
    .slice(0, 1000);

  // ── 1. Create the parent sale row ──────────────────────────────────────────
  const [sale] = await db.insert(customerSales).values({
    ownerId:          opts.ownerId,
    customerId:       opts.customerId,
    amount:           amount.toFixed(2),
    currency:         opts.currency,
    items:            itemsBlob,
    pointsAwarded:    0, // updated below if customer is set
    rewardRedeemedId: opts.rewardRedeemedId ?? null,
    notes:            opts.notes,
  }).returning();

  // ── 2. Insert line items ───────────────────────────────────────────────────
  if (linesWithTotals.length > 0) {
    await db.insert(customerSaleItems).values(
      linesWithTotals.map(({ item, lineTotal, sortOrder }) => ({
        saleId:        sale!.id,
        description:   item.description,
        recipeId:      item.recipeId      ?? null,
        premadeCakeId: item.premadeCakeId ?? null,
        quantity:      String(item.quantity),
        unitPrice:     item.unitPrice !== null ? item.unitPrice.toFixed(2) : null,
        lineTotal:     lineTotal.toFixed(2),
        sortOrder,
      }))
    );
  }

  // ── 3. Deduct stock for each recipe-linked line ────────────────────────────
  const allDeductions: DeductionResult[] = [];
  const reorderAlerts: string[]          = [];

  for (const { item } of linesWithTotals) {
    const recipeId = item.recipeId
      ?? (item.premadeCakeId ? premadeMap.get(item.premadeCakeId)?.recipeId ?? null : null);
    if (!recipeId) continue;

    const result = await inventoryService.recordProduction({
      ownerId:     opts.ownerId,
      recipeId,
      // Each unit sold = one yield-unit of the recipe
      // (e.g. 1 cake = 1× yield, 6 cookies = 6× yield depending on recipe.yieldUnit)
      // We use quantity directly as the scale factor here.
      scaleFactor: item.quantity,
      notes:       `POS sale: ${item.description}`,
    });
    allDeductions.push(...result.deductions);
    reorderAlerts.push(...result.reorderAlerts);
  }

  // ── 4. Award loyalty points if a customer is on file ───────────────────────
  let pointsAwarded = 0;
  let newBalance    = 0;
  let tierUpgraded: string | null = null;

  if (opts.customerId && amount > 0) {
    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.id, opts.customerId), eq(customers.ownerId, opts.ownerId)),
    });
    if (!customer) throw new Error("Customer not found.");

    const tiers = await getOwnerTiers(opts.ownerId);
    const tierRow = tiers.find((t) => t.slug === customer.tier) ?? tiers[tiers.length - 1];
    const multiplier = parseFloat(tierRow?.multiplier ?? "1.0");

    pointsAwarded     = Math.floor(amount * multiplier);
    newBalance        = customer.points + pointsAwarded;
    const newLifetime = customer.lifetimePoints + pointsAwarded;
    const newSpend    = (parseFloat(customer.totalSpend) + amount).toFixed(2);
    const newTier     = resolveTierFromList(tiers, newLifetime);
    tierUpgraded      = newTier !== customer.tier ? newTier : null;

    await db.update(customerSales)
      .set({ pointsAwarded })
      .where(eq(customerSales.id, sale!.id));

    await db.update(customers).set({
      points:         newBalance,
      lifetimePoints: newLifetime,
      totalSpend:     newSpend,
      tier:           newTier,
      lastVisitAt:    new Date(),
      updatedAt:      new Date(),
    }).where(eq(customers.id, opts.customerId));

    await db.insert(loyaltyTransactions).values({
      ownerId:       opts.ownerId,
      customerId:    opts.customerId,
      type:          "earn",
      pointsDelta:   pointsAwarded,
      balanceAfter:  newBalance,
      referenceId:   sale!.id,
      referenceType: "sale",
      description:   `Earned ${pointsAwarded} pts on ${opts.currency} ${amount.toFixed(2)} purchase`,
    });

    await checkAndCreateRewards(opts.customerId, opts.ownerId, newLifetime, newBalance);
  }

  return {
    saleId:        sale!.id,
    amount:        parseFloat(amount.toFixed(2)),
    pointsAwarded,
    newBalance,
    tierUpgraded,
    deductions:    allDeductions.map((d) => ({
      ingredientId: d.ingredientId,
      requested:    d.requested,
      deducted:     d.deducted,
      insufficient: d.insufficient,
    })),
    reorderAlerts,
  };
}

// ─── Automated reward checks ─────────────────────────────────────────────────

export async function checkAndCreateRewards(
  customerId: string,
  ownerId: string,
  lifetimePoints: number,
  currentPoints: number,
): Promise<void> {
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
    columns: { birthday: true, lastVisitAt: true, loyaltyOptIn: true },
  });
  if (!customer?.loyaltyOptIn) return;

  await Promise.all([
    checkBirthdayReward(customerId, ownerId, customer.birthday),
    checkMilestoneReward(customerId, ownerId, lifetimePoints),
    checkReengagementReward(customerId, ownerId, customer.lastVisitAt),
  ]);
}

async function checkBirthdayReward(
  customerId: string,
  ownerId: string,
  birthday: string | null,
): Promise<void> {
  if (!birthday) return;

  const today   = new Date();
  const [, mm, dd] = birthday.split("-").map(Number) as [number, number, number];
  const thisYear = new Date(today.getFullYear(), mm - 1, dd);
  const diff     = Math.abs(today.getTime() - thisYear.getTime()) / 86_400_000;
  if (diff > 7) return;

  // Check no active birthday reward this year
  const existing = await db.query.rewards.findFirst({
    where: and(
      eq(rewards.customerId, customerId),
      eq(rewards.type, "birthday"),
      gte(rewards.validFrom, new Date(today.getFullYear(), 0, 1)), // this calendar year
    ),
  });
  if (existing) return;

  const validUntil = new Date(thisYear);
  validUntil.setDate(validUntil.getDate() + 7);

  await db.insert(rewards).values({
    ownerId,
    customerId,
    type:        "birthday",
    description: "Happy Birthday! Enjoy 10% off your next purchase.",
    discountPct: 10,
    status:      "pending",
    validFrom:   new Date(),
    validUntil,
  });
}

async function checkMilestoneReward(
  customerId: string,
  ownerId: string,
  lifetimePoints: number,
): Promise<void> {
  // Milestone every 100 lifetime points
  const milestone = Math.floor(lifetimePoints / 100);
  if (milestone === 0) return;

  // Count how many milestone rewards already exist
  const existing = await db.query.rewards.findMany({
    where: and(eq(rewards.customerId, customerId), eq(rewards.type, "milestone")),
    columns: { id: true },
  });
  if (existing.length >= milestone) return;

  // Create one new milestone reward
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  await db.insert(rewards).values({
    ownerId,
    customerId,
    type:                "milestone",
    description:         `Congrats on ${milestone * 100} points! Redeem for a free item.`,
    freeItemDescription: "One free bakery item of your choice (up to 50 NOK value)",
    status:              "pending",
    validFrom:           new Date(),
    validUntil,
  });
}

async function checkReengagementReward(
  customerId: string,
  ownerId: string,
  lastVisitAt: Date | null,
): Promise<void> {
  if (!lastVisitAt) return;
  const daysSince = (Date.now() - lastVisitAt.getTime()) / 86_400_000;
  if (daysSince < 30) return;

  // Only one active reengagement at a time
  const existing = await db.query.rewards.findFirst({
    where: and(
      eq(rewards.customerId, customerId),
      eq(rewards.type, "reengagement"),
      eq(rewards.status, "pending"),
    ),
  });
  if (existing) return;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 14);

  await db.insert(rewards).values({
    ownerId,
    customerId,
    type:        "reengagement",
    description: "We miss you! Come back for 15% off your next visit.",
    discountPct: 15,
    status:      "pending",
    validFrom:   new Date(),
    validUntil,
  });
}

// ─── Redeem reward ────────────────────────────────────────────────────────────

export async function redeemReward(opts: {
  ownerId: string;
  rewardId: string;
  customerId: string;
}): Promise<void> {
  const reward = await db.query.rewards.findFirst({
    where: and(
      eq(rewards.id, opts.rewardId),
      eq(rewards.ownerId, opts.ownerId),
      eq(rewards.customerId, opts.customerId),
    ),
  });
  if (!reward) throw new Error("Reward not found.");
  if (reward.status === "redeemed") throw new Error("Reward already redeemed.");
  if (reward.validUntil < new Date()) throw new Error("Reward has expired.");

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, opts.customerId),
    columns: { points: true },
  });
  if (!customer) throw new Error("Customer not found.");

  const cost = reward.pointsRequired;
  if (cost > 0 && customer.points < cost) throw new Error("Insufficient points.");

  const newBalance = customer.points - cost;

  await db.update(rewards).set({ status: "redeemed", redeemedAt: new Date() }).where(eq(rewards.id, opts.rewardId));

  if (cost > 0) {
    await db.update(customers).set({ points: newBalance, updatedAt: new Date() }).where(eq(customers.id, opts.customerId));
    await db.insert(loyaltyTransactions).values({
      ownerId:       opts.ownerId,
      customerId:    opts.customerId,
      type:          "redeem",
      pointsDelta:   -cost,
      balanceAfter:  newBalance,
      referenceId:   opts.rewardId,
      referenceType: "reward",
      description:   `Redeemed reward: ${reward.description}`,
    });
  }
}

// ─── Segment evaluation ───────────────────────────────────────────────────────

export async function evaluateSegment(
  segmentId: string,
  ownerId: string,
): Promise<string[]> {
  const segment = await db.query.customerSegments.findFirst({
    where: and(eq(customerSegments.id, segmentId), eq(customerSegments.ownerId, ownerId)),
  });
  if (!segment) throw new Error("Segment not found.");

  const criteria = JSON.parse(segment.criteria) as SegmentCriteria;
  const allCustomers = await db.query.customers.findMany({
    where: eq(customers.ownerId, ownerId),
  });

  const now = Date.now();
  const matched = allCustomers.filter((c) => {
    if (criteria.tier && c.tier !== criteria.tier) return false;
    if (criteria.minPoints !== undefined && c.points < criteria.minPoints) return false;
    if (criteria.minLifetimeSpend !== undefined && parseFloat(c.totalSpend) < criteria.minLifetimeSpend) return false;
    if (criteria.maxDaysSinceVisit !== undefined) {
      if (!c.lastVisitAt) return false;
      const days = (now - c.lastVisitAt.getTime()) / 86_400_000;
      if (days > criteria.maxDaysSinceVisit) return false;
    }
    if (criteria.dietaryRequirement) {
      const dietaryReqs: string[] = c.dietaryRequirements ? JSON.parse(c.dietaryRequirements) : [];
      if (!dietaryReqs.includes(criteria.dietaryRequirement)) return false;
    }
    return true;
  });

  const customerIds = matched.map((c) => c.id);

  // Refresh membership table
  await db.delete(customerSegmentMembers).where(eq(customerSegmentMembers.segmentId, segmentId));
  if (customerIds.length > 0) {
    await db.insert(customerSegmentMembers).values(
      customerIds.map((id) => ({ segmentId, customerId: id }))
    );
  }
  await db.update(customerSegments)
    .set({ memberCount: customerIds.length, updatedAt: new Date() })
    .where(eq(customerSegments.id, segmentId));

  return customerIds;
}
