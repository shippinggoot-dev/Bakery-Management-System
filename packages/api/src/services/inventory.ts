/**
 * Inventory Service
 *
 * Core logic for:
 *   - FEFO/FIFO lot selection (First Expired / First In, First Out)
 *   - Stock deduction across multiple lots
 *   - Reorder alert generation (auto-draft purchase orders)
 *   - SSE broadcast (emits events picked up by the stream endpoint)
 */

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@bakery/db";
import {
  ingredients,
  lots,
  productionBatches,
  wasteLogs,
  stockMovements,
  purchaseOrders,
  purchaseOrderItems,
  ingredientSuppliers,
  recipeIngredients,
  recipes,
} from "@bakery/db";
import { pushInventoryForRecipesUsingIngredient } from "./shopify-sync";

// ─── SSE broadcast ────────────────────────────────────────────────────────────
// Global registry of active SSE response controllers, keyed by ownerId.
// Each entry is a Set of TextEncoder-based send functions.

type SendFn = (data: string) => void;
const sseClients = new Map<string, Set<SendFn>>();

export function registerSSEClient(ownerId: string, send: SendFn): () => void {
  if (!sseClients.has(ownerId)) sseClients.set(ownerId, new Set());
  sseClients.get(ownerId)!.add(send);
  return () => {
    sseClients.get(ownerId)?.delete(send);
    if (sseClients.get(ownerId)?.size === 0) sseClients.delete(ownerId);
  };
}

export function broadcastStockUpdate(ownerId: string, payload: object): void {
  const clients = sseClients.get(ownerId);
  if (!clients) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const send of clients) {
    try { send(message); } catch { /* client disconnected */ }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockStatus = "ok" | "low" | "critical" | "out";

export interface StockLevel {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  parLevel: number | null;
  reorderPoint: number | null;
  status: StockStatus;
  lots: { id: string; lotNumber: string | null; quantity: number; expiryDate: string | null; receivedAt: Date }[];
}

export interface DeductionResult {
  ingredientId: string;
  requested: number;
  deducted: number;
  lotsUsed: { lotId: string; quantity: number }[];
  insufficient: boolean;
}

// ─── Stock status calculation ─────────────────────────────────────────────────

export function calcStatus(
  current: number,
  parLevel: number | null,
  reorderPoint: number | null
): StockStatus {
  if (current <= 0) return "out";
  if (reorderPoint !== null && current <= reorderPoint) return "critical";
  if (parLevel !== null && current < parLevel * 0.5) return "low";
  return "ok";
}

// ─── Service class ────────────────────────────────────────────────────────────

export class InventoryService {
  constructor(private readonly database: typeof db) {}

  // ── Stock levels ──────────────────────────────────────────────────────────

  async getStockLevels(ownerId: string): Promise<StockLevel[]> {
    const ings = await this.database.query.ingredients.findMany({
      where: eq(ingredients.ownerId, ownerId),
      orderBy: (t, { asc }) => [asc(t.name)],
    });

    const allLots = await this.database.query.lots.findMany({
      where: and(
        inArray(lots.ingredientId, ings.map((i) => i.id)),
        eq(lots.status, "available")
      ),
      orderBy: [asc(lots.expiryDate), asc(lots.receivedAt)],
    });

    const lotsByIngredient = new Map<string, typeof allLots>();
    for (const lot of allLots) {
      const list = lotsByIngredient.get(lot.ingredientId) ?? [];
      list.push(lot);
      lotsByIngredient.set(lot.ingredientId, list);
    }

    return ings.map((ing) => {
      const ingLots = lotsByIngredient.get(ing.id) ?? [];
      const current = parseFloat(ing.currentStock ?? "0");
      const par     = ing.parLevel ? parseFloat(ing.parLevel) : null;
      const reorder = ing.reorderPoint ? parseFloat(ing.reorderPoint) : null;

      return {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        currentStock: current,
        parLevel: par,
        reorderPoint: reorder,
        status: calcStatus(current, par, reorder),
        lots: ingLots.map((l) => ({
          id: l.id,
          lotNumber: l.lotNumber,
          quantity: parseFloat(l.quantity),
          expiryDate: l.expiryDate,
          receivedAt: l.receivedAt,
        })),
      };
    });
  }

  // ── Receive a delivery (creates/updates a lot) ────────────────────────────

  async receiveDelivery(opts: {
    ownerId: string;
    ingredientId: string;
    supplierId: string | null;
    quantity: number;
    unit: string;
    lotNumber: string | null;
    expiryDate: string | null;
    purchaseOrderId: string | null;
    notes: string | null;
  }): Promise<{ lotId: string }> {
    const [lot] = await this.database
      .insert(lots)
      .values({
        ingredientId: opts.ingredientId,
        supplierId: opts.supplierId,
        lotNumber: opts.lotNumber,
        quantity: opts.quantity.toString(),
        unit: opts.unit,
        expiryDate: opts.expiryDate,
        status: "available",
        notes: opts.notes,
      })
      .returning();

    await this.updateIngredientStock(opts.ingredientId, opts.quantity, opts.ownerId);

    await this.database.insert(stockMovements).values({
      ownerId: opts.ownerId,
      ingredientId: opts.ingredientId,
      lotId: lot!.id,
      type: "receive",
      quantityDelta: opts.quantity.toString(),
      stockAfter: await this.getCurrentStock(opts.ingredientId),
      unit: opts.unit,
      referenceId: opts.purchaseOrderId ?? undefined,
      referenceType: opts.purchaseOrderId ? "purchase_order" : "manual",
      notes: opts.notes,
    });

    broadcastStockUpdate(opts.ownerId, { type: "stock_updated", ingredientId: opts.ingredientId });
    // Fire-and-forget Shopify inventory level push for any recipes that use
    // this ingredient. Errors are logged inside the function — they never
    // bubble back to the caller.
    void pushInventoryForRecipesUsingIngredient(opts.ownerId, opts.ingredientId);

    return { lotId: lot!.id };
  }

  // ── Record a production batch (FEFO deduction) ────────────────────────────

  async recordProduction(opts: {
    ownerId: string;
    recipeId: string;
    scaleFactor: number;
    notes: string | null;
  }): Promise<{ batchId: string; deductions: DeductionResult[]; reorderAlerts: string[] }> {
    // Load recipe + ingredients
    const recipe = await this.database.query.recipes.findFirst({
      where: and(eq(recipes.id, opts.recipeId), eq(recipes.ownerId, opts.ownerId)),
      with: { ingredients: { with: { ingredient: true } } },
    });
    if (!recipe) throw new Error("Recipe not found.");

    const deductions: DeductionResult[] = [];
    const reorderAlerts: string[] = [];

    // Insert batch record first
    const [batch] = await this.database
      .insert(productionBatches)
      .values({
        ownerId: opts.ownerId,
        recipeId: opts.recipeId,
        scaleFactor: opts.scaleFactor.toString(),
        yieldAmount: (parseFloat(recipe.yieldAmount) * opts.scaleFactor).toString(),
        yieldUnit: recipe.yieldUnit,
        notes: opts.notes,
      })
      .returning();

    // Deduct each ingredient
    for (const ri of recipe.ingredients) {
      const needed = parseFloat(ri.quantity) * opts.scaleFactor;
      const result = await this.deductStock({
        ownerId: opts.ownerId,
        ingredientId: ri.ingredientId,
        quantity: needed,
        unit: ri.unit,
        referenceId: batch!.id,
        referenceType: "production_batch",
      });
      deductions.push(result);

      // Check reorder after deduction
      const alert = await this.checkReorder(ri.ingredientId, opts.ownerId);
      if (alert) reorderAlerts.push(alert);
    }

    broadcastStockUpdate(opts.ownerId, {
      type: "production_recorded",
      batchId: batch!.id,
      recipeId: opts.recipeId,
    });

    return { batchId: batch!.id, deductions, reorderAlerts };
  }

  // ── FEFO/FIFO stock deduction ─────────────────────────────────────────────

  async deductStock(opts: {
    ownerId: string;
    ingredientId: string;
    quantity: number;
    unit: string;
    referenceId: string;
    referenceType: string;
  }): Promise<DeductionResult> {
    // Sort by expiry date ASC (FEFO), then received_at ASC (FIFO) as tiebreaker
    const availableLots = await this.database.query.lots.findMany({
      where: and(eq(lots.ingredientId, opts.ingredientId), eq(lots.status, "available")),
      orderBy: [asc(lots.expiryDate), asc(lots.receivedAt)],
    });

    let remaining = opts.quantity;
    const lotsUsed: { lotId: string; quantity: number }[] = [];

    for (const lot of availableLots) {
      if (remaining <= 0) break;
      const inLot = parseFloat(lot.quantity);
      const take  = Math.min(inLot, remaining);

      const newQty = (inLot - take).toFixed(4);
      const newStatus = parseFloat(newQty) <= 0 ? "consumed" : "available";

      await this.database
        .update(lots)
        .set({ quantity: newQty, status: newStatus, updatedAt: new Date() })
        .where(eq(lots.id, lot.id));

      await this.database.insert(stockMovements).values({
        ownerId: opts.ownerId,
        ingredientId: opts.ingredientId,
        lotId: lot.id,
        type: opts.referenceType === "production_batch" ? "produce" : "waste",
        quantityDelta: (-take).toString(),
        stockAfter: "0", // updated below after all lots
        unit: opts.unit,
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
      });

      lotsUsed.push({ lotId: lot.id, quantity: take });
      remaining -= take;
    }

    const deducted = opts.quantity - remaining;
    await this.updateIngredientStock(opts.ingredientId, -deducted, opts.ownerId);

    // Back-fill stockAfter on the movements we just created
    const stockAfter = await this.getCurrentStock(opts.ingredientId);
    await this.database
      .update(stockMovements)
      .set({ stockAfter })
      .where(and(
        eq(stockMovements.referenceId, opts.referenceId),
        eq(stockMovements.ingredientId, opts.ingredientId)
      ));

    broadcastStockUpdate(opts.ownerId, { type: "stock_updated", ingredientId: opts.ingredientId });
    // Fire-and-forget Shopify inventory level push for any recipes that use
    // this ingredient. Errors are logged inside the function — they never
    // bubble back to the caller.
    void pushInventoryForRecipesUsingIngredient(opts.ownerId, opts.ingredientId);

    return {
      ingredientId: opts.ingredientId,
      requested: opts.quantity,
      deducted,
      lotsUsed,
      insufficient: remaining > 0,
    };
  }

  // ── Log waste ─────────────────────────────────────────────────────────────

  async logWaste(opts: {
    ownerId: string;
    ingredientId: string;
    quantity: number;
    unit: string;
    reason: string;
    notes: string | null;
  }): Promise<{ wasteId: string; reorderAlert: string | null }> {
    // Pick the earliest expiring lot (FEFO) for waste too
    const lot = await this.database.query.lots.findFirst({
      where: and(eq(lots.ingredientId, opts.ingredientId), eq(lots.status, "available")),
      orderBy: [asc(lots.expiryDate), asc(lots.receivedAt)],
    });

    const [wasteLog] = await this.database
      .insert(wasteLogs)
      .values({
        ownerId: opts.ownerId,
        ingredientId: opts.ingredientId,
        lotId: lot?.id ?? null,
        quantity: opts.quantity.toString(),
        unit: opts.unit,
        reason: opts.reason,
        notes: opts.notes,
      })
      .returning();

    // Deduct stock
    await this.deductStock({
      ownerId: opts.ownerId,
      ingredientId: opts.ingredientId,
      quantity: opts.quantity,
      unit: opts.unit,
      referenceId: wasteLog!.id,
      referenceType: "waste_log",
    });

    const reorderAlert = await this.checkReorder(opts.ingredientId, opts.ownerId);

    broadcastStockUpdate(opts.ownerId, { type: "waste_logged", ingredientId: opts.ingredientId });

    return { wasteId: wasteLog!.id, reorderAlert };
  }

  // ── Adjust stock manually ─────────────────────────────────────────────────

  async adjustStock(opts: {
    ownerId: string;
    ingredientId: string;
    newQuantity: number;
    unit: string;
    notes: string | null;
  }): Promise<void> {
    const current = parseFloat(await this.getCurrentStock(opts.ingredientId));
    const delta   = opts.newQuantity - current;

    await this.database
      .update(ingredients)
      .set({ currentStock: opts.newQuantity.toString(), updatedAt: new Date() })
      .where(eq(ingredients.id, opts.ingredientId));

    await this.database.insert(stockMovements).values({
      ownerId: opts.ownerId,
      ingredientId: opts.ingredientId,
      type: "recount",
      quantityDelta: delta.toString(),
      stockAfter: opts.newQuantity.toString(),
      unit: opts.unit,
      referenceType: "manual",
      notes: opts.notes,
    });

    broadcastStockUpdate(opts.ownerId, { type: "stock_updated", ingredientId: opts.ingredientId });
    // Fire-and-forget Shopify inventory level push for any recipes that use
    // this ingredient. Errors are logged inside the function — they never
    // bubble back to the caller.
    void pushInventoryForRecipesUsingIngredient(opts.ownerId, opts.ingredientId);
  }

  // ── Reorder check → auto draft PO ────────────────────────────────────────

  async checkReorder(ingredientId: string, ownerId: string): Promise<string | null> {
    const ing = await this.database.query.ingredients.findFirst({
      where: eq(ingredients.id, ingredientId),
      columns: { id: true, name: true, currentStock: true, reorderPoint: true },
    });
    if (!ing?.reorderPoint) return null;
    if (parseFloat(ing.currentStock ?? "0") > parseFloat(ing.reorderPoint)) return null;

    // Check if a draft PO already exists for this ingredient
    const existingItems = await this.database.query.purchaseOrderItems.findFirst({
      where: eq(purchaseOrderItems.ingredientId, ingredientId),
      with: {
        purchaseOrder: {
          columns: { status: true, ownerId: true },
        },
      },
    });
    const hasDraft = existingItems?.purchaseOrder?.status === "draft"
      && existingItems?.purchaseOrder?.ownerId === ownerId;
    if (hasDraft) return null;

    // Find preferred supplier
    const preferred = await this.database.query.ingredientSuppliers.findFirst({
      where: and(
        eq(ingredientSuppliers.ingredientId, ingredientId),
        eq(ingredientSuppliers.isPreferred, true)
      ),
    });
    if (!preferred) return null;

    // Create draft PO
    const [po] = await this.database
      .insert(purchaseOrders)
      .values({
        ownerId,
        supplierId: preferred.supplierId,
        status: "draft",
        notes: `Auto-generated: ${ing.name} hit reorder point`,
      })
      .returning();

    const reorderQty = ing.reorderPoint
      ? (parseFloat(ing.reorderPoint) * 3).toString()
      : "1";

    await this.database.insert(purchaseOrderItems).values({
      purchaseOrderId: po!.id,
      ingredientId,
      quantity: reorderQty,
      unit: (await this.database.query.ingredients.findFirst({
        where: eq(ingredients.id, ingredientId),
        columns: { unit: true },
      }))?.unit ?? "g",
    });

    broadcastStockUpdate(ownerId, { type: "reorder_created", poId: po!.id, ingredientId });

    return po!.id;
  }

  // ── Weekly waste report ───────────────────────────────────────────────────

  async getWasteReport(ownerId: string, weeksBack = 1) {
    const since = new Date();
    since.setDate(since.getDate() - weeksBack * 7);

    const logs = await this.database.query.wasteLogs.findMany({
      where: and(eq(wasteLogs.ownerId, ownerId)),
      with: { ingredient: true },
      orderBy: (t, { desc }) => [desc(t.loggedAt)],
    });

    const filtered = logs.filter((l) => l.loggedAt >= since);

    // Aggregate by ingredient + reason
    const byIngredient = new Map<string, { name: string; unit: string; total: number; byReason: Record<string, number> }>();
    for (const log of filtered) {
      const qty = parseFloat(log.quantity);
      const key = log.ingredientId;
      if (!byIngredient.has(key)) {
        byIngredient.set(key, { name: log.ingredient.name, unit: log.unit, total: 0, byReason: {} });
      }
      const entry = byIngredient.get(key)!;
      entry.total += qty;
      entry.byReason[log.reason] = (entry.byReason[log.reason] ?? 0) + qty;
    }

    return {
      from: since.toISOString(),
      to: new Date().toISOString(),
      totalEntries: filtered.length,
      byIngredient: [...byIngredient.entries()].map(([id, v]) => ({ ingredientId: id, ...v })),
      byReason: filtered.reduce<Record<string, number>>((acc, l) => {
        acc[l.reason] = (acc[l.reason] ?? 0) + parseFloat(l.quantity);
        return acc;
      }, {}),
    };
  }

  // ── Barcode lookup ────────────────────────────────────────────────────────

  async lookupBarcode(barcode: string, ownerId: string) {
    // Try SKU in ingredient_suppliers
    const bySku = await this.database.query.ingredientSuppliers.findFirst({
      where: eq(ingredientSuppliers.sku, barcode),
      with: { ingredient: true },
    });
    if (bySku?.ingredient && bySku.ingredient.ownerId === ownerId) return bySku.ingredient;

    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async updateIngredientStock(ingredientId: string, delta: number, _ownerId: string): Promise<void> {
    const ing = await this.database.query.ingredients.findFirst({
      where: eq(ingredients.id, ingredientId),
      columns: { currentStock: true },
    });
    const current = parseFloat(ing?.currentStock ?? "0");
    const next    = Math.max(0, current + delta);
    await this.database
      .update(ingredients)
      .set({ currentStock: next.toFixed(4), updatedAt: new Date() })
      .where(eq(ingredients.id, ingredientId));
  }

  private async getCurrentStock(ingredientId: string): Promise<string> {
    const ing = await this.database.query.ingredients.findFirst({
      where: eq(ingredients.id, ingredientId),
      columns: { currentStock: true },
    });
    return ing?.currentStock ?? "0";
  }
}

export const inventoryService = new InventoryService(db);
