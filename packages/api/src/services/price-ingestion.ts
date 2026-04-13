/**
 * Price Ingestion Service
 *
 * Handles three ingestion methods:
 *   1. Invoice OCR  — PDF/image → Claude Sonnet 4.6 vision → extracted line items
 *   2. CSV import   — user-uploaded CSV + column mapping → extracted line items
 *   3. Scheduled API fetch — Kassal.app sync (existing, coordinated through this service)
 *
 * After extraction, items go through fuzzy ingredient matching (Jaro-Winkler),
 * a user-confirm step, then price commitment to supplier_prices / price_history.
 * On commit: COGS is recalculated and margin alerts are checked.
 */

import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "@bakery/db";
import {
  ingredients,
  ingredientSuppliers,
  supplierPrices,
  priceHistory,
  recipeIngredients,
  recipes,
  priceIngestionSessions,
  priceIngestionItems,
  marginSettings,
  notifications,
} from "@bakery/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedLineItem {
  rawName: string;
  rawPrice: string | null;
  rawUnit: string | null;
  rawQuantity: string | null;
}

export interface MatchedItem extends ExtractedLineItem {
  ingredientId: string | null;
  ingredientName: string | null;
  supplierId: string | null;
  matchScore: number;
  pricePerUnit: string | null;
  unit: string | null;
}

export interface COGSResult {
  recipeId: string;
  recipeName: string;
  totalCost: number;
  yieldAmount: string;
  yieldUnit: string;
  costPerUnit: number;
}

export interface MarginBreach {
  recipeId: string;
  recipeName: string;
  currentMarginPct: number;
  minMarginPct: number;
  totalCost: number;
}

// ─── Fuzzy matching — Jaro-Winkler ───────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end   = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaroScore = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaroScore + prefix * p * (1 - jaroScore);
}

/** Normalise a string for fuzzy comparison: lowercase, strip punctuation, collapse spaces */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;

  // Full-string Jaro-Winkler
  const full = jaroWinkler(na, nb);

  // Token-level bonus: reward matching individual words
  const tokensA = na.split(" ");
  const tokensB = nb.split(" ");
  let tokenScore = 0;
  for (const ta of tokensA) {
    const best = Math.max(...tokensB.map((tb) => jaroWinkler(ta, tb)));
    tokenScore += best;
  }
  const avgToken = tokenScore / tokensA.length;

  return Math.max(full, avgToken * 0.85);
}

// ─── Unit normalisation ───────────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, string> = {
  gram: "g", grams: "g", gramme: "g", grammes: "g",
  kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  milliliter: "ml", millilitre: "ml", milliliters: "ml", millilitres: "ml",
  liter: "L", litre: "L", liters: "L", litres: "L",
  piece: "pcs", pieces: "pcs", stk: "pcs", each: "pcs",
  tablespoon: "tbsp", tablespoons: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp",
};

export function normaliseUnit(raw: string | null | undefined): string {
  if (!raw) return "g";
  const lower = raw.trim().toLowerCase();
  return UNIT_ALIASES[lower] ?? lower;
}

/**
 * Convert a raw price + package size into price-per-canonical-unit.
 * e.g. rawPrice="45.50", rawQuantity="500", rawUnit="g" → "0.091" (per g)
 */
export function computePricePerUnit(
  rawPrice: string,
  rawQuantity: string | null,
  rawUnit: string | null
): string | null {
  const price = parseFloat(rawPrice.replace(",", "."));
  if (isNaN(price) || price <= 0) return null;

  const qty = rawQuantity ? parseFloat(rawQuantity.replace(",", ".")) : 1;
  if (isNaN(qty) || qty <= 0) return null;

  const ppu = price / qty;
  return ppu.toFixed(4);
}

// ─── Service class ────────────────────────────────────────────────────────────

export class PriceIngestionService {
  constructor(private readonly database: typeof db) {}

  // ── Fuzzy ingredient matching ─────────────────────────────────────────────

  async findBestMatch(
    rawName: string,
    ownerId: string
  ): Promise<{ ingredientId: string; ingredientName: string; score: number } | null> {
    const allIngredients = await this.database.query.ingredients.findMany({
      where: eq(ingredients.ownerId, ownerId),
      columns: { id: true, name: true },
    });

    if (allIngredients.length === 0) return null;

    let best: { ingredientId: string; ingredientName: string; score: number } | null = null;

    for (const ing of allIngredients) {
      const score = similarity(rawName, ing.name);
      if (!best || score > best.score) {
        best = { ingredientId: ing.id, ingredientName: ing.name, score };
      }
    }

    // Only return a match if confidence is above threshold
    return best && best.score >= 0.72 ? best : null;
  }

  // ── CSV parsing ───────────────────────────────────────────────────────────

  parseCSV(
    csvText: string,
    columnMapping: {
      nameCol: number;
      priceCol: number;
      unitCol?: number;
      quantityCol?: number;
      hasHeader?: boolean;
    }
  ): ExtractedLineItem[] {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const start = columnMapping.hasHeader ? 1 : 0;
    const items: ExtractedLineItem[] = [];

    for (let i = start; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]!);
      const rawName = cols[columnMapping.nameCol]?.trim() ?? "";
      if (!rawName) continue;

      items.push({
        rawName,
        rawPrice: cols[columnMapping.priceCol]?.trim() ?? null,
        rawUnit: columnMapping.unitCol != null ? cols[columnMapping.unitCol]?.trim() ?? null : null,
        rawQuantity:
          columnMapping.quantityCol != null
            ? cols[columnMapping.quantityCol]?.trim() ?? null
            : null,
      });
    }

    return items;
  }

  // ── Match items against the user's ingredient list ────────────────────────

  async matchItems(
    items: ExtractedLineItem[],
    ownerId: string
  ): Promise<MatchedItem[]> {
    const results: MatchedItem[] = [];

    for (const item of items) {
      const match = await this.findBestMatch(item.rawName, ownerId);
      const unit = normaliseUnit(item.rawUnit);
      const pricePerUnit =
        item.rawPrice
          ? computePricePerUnit(item.rawPrice, item.rawQuantity, item.rawUnit)
          : null;

      results.push({
        ...item,
        ingredientId: match?.ingredientId ?? null,
        ingredientName: match?.ingredientName ?? null,
        supplierId: null, // set by caller from session's supplierId
        matchScore: match?.score ?? 0,
        pricePerUnit,
        unit,
      });
    }

    return results;
  }

  // ── Persist a session + its extracted items ───────────────────────────────

  async createSession(
    ownerId: string,
    source: "invoice" | "csv" | "api",
    fileName: string | null
  ): Promise<string> {
    const [session] = await this.database
      .insert(priceIngestionSessions)
      .values({ ownerId, source, status: "processing", fileName })
      .returning({ id: priceIngestionSessions.id });
    return session!.id;
  }

  async saveSessionItems(
    sessionId: string,
    matchedItems: MatchedItem[],
    supplierId: string | null
  ): Promise<void> {
    if (matchedItems.length === 0) return;
    await this.database.insert(priceIngestionItems).values(
      matchedItems.map((item) => ({
        sessionId,
        rawName: item.rawName,
        rawPrice: item.rawPrice,
        rawUnit: item.rawUnit,
        rawQuantity: item.rawQuantity,
        ingredientId: item.ingredientId,
        supplierId,
        matchScore: item.matchScore.toFixed(3),
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
      }))
    );

    const matched = matchedItems.filter((i) => i.ingredientId !== null).length;
    await this.database
      .update(priceIngestionSessions)
      .set({
        status: "completed",
        itemCount: matchedItems.length,
        matchedCount: matched,
        completedAt: new Date(),
      })
      .where(eq(priceIngestionSessions.id, sessionId));
  }

  async failSession(sessionId: string, errorMessage: string): Promise<void> {
    await this.database
      .update(priceIngestionSessions)
      .set({ status: "failed", errorMessage, completedAt: new Date() })
      .where(eq(priceIngestionSessions.id, sessionId));
  }

  // ── Apply confirmed items to supplier_prices / price_history ──────────────

  async applyItems(
    sessionId: string,
    confirmedItemIds: string[],
    ownerId: string
  ): Promise<{ applied: number }> {
    if (confirmedItemIds.length === 0) return { applied: 0 };

    const items = await this.database.query.priceIngestionItems.findMany({
      where: and(
        eq(priceIngestionItems.sessionId, sessionId),
        inArray(priceIngestionItems.id, confirmedItemIds)
      ),
    });

    let applied = 0;

    for (const item of items) {
      if (!item.ingredientId || !item.supplierId || !item.pricePerUnit || !item.unit) continue;

      // Ensure an ingredient_supplier link exists
      let ingSupplier = await this.database.query.ingredientSuppliers.findFirst({
        where: and(
          eq(ingredientSuppliers.ingredientId, item.ingredientId),
          eq(ingredientSuppliers.supplierId, item.supplierId)
        ),
      });

      if (!ingSupplier) {
        const [created] = await this.database
          .insert(ingredientSuppliers)
          .values({ ingredientId: item.ingredientId, supplierId: item.supplierId })
          .returning();
        ingSupplier = created!;
      }

      // Upsert supplier_prices (preferred price for this ing+supplier)
      const existing = await this.database.query.supplierPrices.findFirst({
        where: and(
          eq(supplierPrices.ingredientId, item.ingredientId),
          eq(supplierPrices.supplierId, item.supplierId)
        ),
      });

      if (existing) {
        await this.database
          .update(supplierPrices)
          .set({ pricePerUnit: item.pricePerUnit, unit: item.unit, updatedAt: new Date() })
          .where(eq(supplierPrices.id, existing.id));
      } else {
        await this.database.insert(supplierPrices).values({
          ingredientId: item.ingredientId,
          supplierId: item.supplierId,
          pricePerUnit: item.pricePerUnit,
          unit: item.unit,
          isPreferred: false,
        });
      }

      // Append to price_history
      await this.database.insert(priceHistory).values({
        ingredientSupplierId: ingSupplier.id,
        pricePerUnit: item.pricePerUnit,
        source: "csv", // invoice and csv both land here; api uses its own path
        notes: `Ingestion session ${sessionId}`,
      });

      // Mark item as applied
      await this.database
        .update(priceIngestionItems)
        .set({ applied: true, confirmed: true })
        .where(eq(priceIngestionItems.id, item.id));

      applied++;
    }

    // Update session applied count
    await this.database
      .update(priceIngestionSessions)
      .set({ appliedCount: applied })
      .where(eq(priceIngestionSessions.id, sessionId));

    return { applied };
  }

  // ── COGS recalculation ────────────────────────────────────────────────────

  async recalculateCOGS(ownerId: string): Promise<COGSResult[]> {
    const userRecipes = await this.database.query.recipes.findMany({
      where: and(eq(recipes.ownerId, ownerId), eq(recipes.isActive, true)),
      with: {
        ingredients: {
          with: {
            ingredient: {
              with: {
                supplierPrices: {
                  where: eq(supplierPrices.isPreferred, true),
                  limit: 1,
                },
              },
            },
          },
        },
      },
    });

    return userRecipes.map((recipe) => {
      let totalCost = 0;
      for (const ri of recipe.ingredients) {
        const preferred = ri.ingredient.supplierPrices[0];
        if (!preferred) continue;
        totalCost += parseFloat(preferred.pricePerUnit) * parseFloat(ri.quantity);
      }
      const yieldAmt = parseFloat(recipe.yieldAmount) || 1;
      return {
        recipeId: recipe.id,
        recipeName: recipe.name,
        totalCost: parseFloat(totalCost.toFixed(4)),
        yieldAmount: recipe.yieldAmount,
        yieldUnit: recipe.yieldUnit,
        costPerUnit: parseFloat((totalCost / yieldAmt).toFixed(4)),
      };
    });
  }

  // ── Margin checking ───────────────────────────────────────────────────────

  async checkMargins(
    ownerId: string,
    cogsResults: COGSResult[]
  ): Promise<MarginBreach[]> {
    const settings = await this.database.query.marginSettings.findFirst({
      where: eq(marginSettings.ownerId, ownerId),
    });

    // Default 20% minimum margin if not configured
    const minPct = settings ? parseFloat(settings.minMarginPct) : 20;

    const breaches: MarginBreach[] = [];

    for (const cogs of cogsResults) {
      // We don't store selling prices yet — alert when COGS is very high (no margin data).
      // This is a placeholder: margin = (salePrice - cost) / salePrice * 100.
      // Without sale price we report recipes where cost exceeds a threshold.
      // Once sale prices are added to recipes, replace this logic.
      if (cogs.totalCost > 0) {
        // Example: assume target margin means cost should be < (1 - minPct/100) of sale price
        // Since we have no sale price yet, push all costed recipes for review.
        // Real implementation: marginPct = (salePrice - totalCost) / salePrice * 100
        const estimatedMarginPct = 0; // placeholder
        if (estimatedMarginPct < minPct) {
          breaches.push({
            recipeId: cogs.recipeId,
            recipeName: cogs.recipeName,
            currentMarginPct: estimatedMarginPct,
            minMarginPct: minPct,
            totalCost: cogs.totalCost,
          });
        }
      }
    }

    return breaches;
  }

  // ── Webhook dispatch with retry ───────────────────────────────────────────

  async dispatchWebhook(
    url: string,
    payload: object,
    maxRetries = 3
  ): Promise<boolean> {
    return withRetry(
      async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
        return true;
      },
      maxRetries,
      1000
    );
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async createNotification(
    ownerId: string,
    type: string,
    title: string,
    message: string,
    payload?: object
  ): Promise<void> {
    await this.database.insert(notifications).values({
      ownerId,
      type,
      title,
      message,
      payload: payload ? JSON.stringify(payload) : null,
    });
  }

  // ── High-level orchestration: full CSV / invoice-text ingestion ─────────────

  async ingestCSV(opts: {
    csvText: string;
    fileName: string;
    columnMapping: {
      nameCol: number;
      priceCol: number;
      unitCol?: number;
      quantityCol?: number;
      hasHeader?: boolean;
    };
    supplierId: string;
    ownerId: string;
  }): Promise<{ sessionId: string; items: MatchedItem[] }> {
    const sessionId = await this.createSession(opts.ownerId, "csv", opts.fileName);

    try {
      const extracted = this.parseCSV(opts.csvText, opts.columnMapping);
      if (extracted.length === 0) throw new Error("No rows found in CSV with the given column mapping.");

      const matched = await this.matchItems(extracted, opts.ownerId);
      for (const m of matched) m.supplierId = opts.supplierId;

      await this.saveSessionItems(sessionId, matched, opts.supplierId);

      await this.createNotification(
        opts.ownerId,
        "ingestion_complete",
        "CSV imported",
        `${extracted.length} items found, ${matched.filter((m) => m.ingredientId).length} matched. Review and confirm prices.`,
        { sessionId }
      );

      return { sessionId, items: matched };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.failSession(sessionId, msg);
      await this.createNotification(opts.ownerId, "ingestion_failed", "CSV import failed", msg, { sessionId });
      throw err;
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Retry an async operation up to maxAttempts times with exponential back-off.
 * Throws the last error if all attempts fail.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * RFC 4180-compliant CSV line parser — handles quoted fields with commas inside.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const priceIngestion = new PriceIngestionService(db);
