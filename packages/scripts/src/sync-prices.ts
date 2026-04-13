/**
 * sync-prices.ts
 *
 * Reads a CSV file of ingredient prices and updates supplier prices in the
 * database.  When a price changes by more than THRESHOLD_PCT, a price alert
 * is created so the owner sees it in the Price Alerts page.
 *
 * Usage:
 *   pnpm --filter @bakery/scripts sync-prices \
 *     --owner <owner-user-id>  \
 *     --file  prices.csv       \
 *     [--threshold 5]          # default 5 %
 *
 * CSV format (with header row):
 *   ingredient_name,price_per_unit,unit,supplier_name
 *
 * Example:
 *   Wheat Flour,12.50,kg,Bergen Mel AS
 *   Butter,85.00,kg,Tine Grossist
 *   Eggs,4.50,piece,Rema 1000 Fana
 *
 * Notes:
 * - ingredient_name is matched case-insensitively against the owner's
 *   ingredients.
 * - supplier_name is matched case-insensitively; the supplier is created if it
 *   does not already exist.
 * - A price alert is written whenever |change| >= threshold_pct.
 * - All amounts are in NOK (Norwegian kroner) by default.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

// Load .env.local from the web app (same as the db client does)
config({ path: resolve(__dirname, "../../../apps/web/.env.local") });

import { db } from "@bakery/db";
import {
  ingredients,
  suppliers,
  supplierPrices,
  priceAlerts,
} from "@bakery/db";
import { eq, and, ilike } from "drizzle-orm";

// ── CLI argument parsing ─────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const ownerId       = getArg("--owner");
const csvPath       = getArg("--file");
const thresholdStr  = getArg("--threshold") ?? "5";
const thresholdPct  = parseFloat(thresholdStr) / 100;

if (!ownerId || !csvPath) {
  console.error("Usage: sync-prices --owner <user-id> --file <path-to-csv> [--threshold 5]");
  process.exit(1);
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

interface CsvRow {
  ingredientName: string;
  pricePerUnit:   number;
  unit:           string;
  supplierName:   string;
}

function parseCsv(filePath: string): CsvRow[] {
  const text  = readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Skip header row if present
  const dataLines = lines[0]?.toLowerCase().startsWith("ingredient") ? lines.slice(1) : lines;

  return dataLines.map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 4) {
      throw new Error(`Line ${i + 2}: expected 4 columns (ingredient_name,price_per_unit,unit,supplier_name), got ${cols.length}`);
    }
    const price = parseFloat(cols[1]!);
    if (isNaN(price) || price < 0) {
      throw new Error(`Line ${i + 2}: invalid price "${cols[1]}"`);
    }
    return {
      ingredientName: cols[0]!,
      pricePerUnit:   price,
      unit:           cols[2]!,
      supplierName:   cols[3]!,
    };
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nPrice sync — owner: ${ownerId}`);
  console.log(`CSV file:  ${csvPath}`);
  console.log(`Threshold: ${thresholdPct * 100}%\n`);

  let rows: CsvRow[];
  try {
    rows = parseCsv(csvPath!);
  } catch (err) {
    console.error(`Failed to parse CSV: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`Parsed ${rows.length} row(s) from CSV.\n`);

  const stats = { updated: 0, unchanged: 0, created: 0, alerts: 0, errors: 0 };

  for (const row of rows) {
    try {
      // ── 1. Find ingredient ───────────────────────────────────────────────
      const ingredient = await db.query.ingredients.findFirst({
        where: and(
          eq(ingredients.ownerId, ownerId!),
          ilike(ingredients.name, row.ingredientName)
        ),
        columns: { id: true, name: true },
      });

      if (!ingredient) {
        console.warn(`  SKIP  "${row.ingredientName}" — ingredient not found for this owner`);
        stats.errors++;
        continue;
      }

      // ── 2. Find or create supplier ───────────────────────────────────────
      let supplier = await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.ownerId, ownerId!),
          ilike(suppliers.name, row.supplierName)
        ),
        columns: { id: true, name: true },
      });

      if (!supplier) {
        const [created] = await db.insert(suppliers).values({
          ownerId: ownerId!,
          name:    row.supplierName,
          isActive: true,
        }).returning({ id: suppliers.id, name: suppliers.name });
        supplier = created!;
        console.log(`  NEW   Supplier "${row.supplierName}" created`);
      }

      // ── 3. Find existing supplier price ─────────────────────────────────
      const existing = await db.query.supplierPrices.findFirst({
        where: and(
          eq(supplierPrices.supplierId, supplier.id),
          eq(supplierPrices.ingredientId, ingredient.id)
        ),
      });

      const newPriceStr = row.pricePerUnit.toFixed(2);

      // ── 4. Detect price change ───────────────────────────────────────────
      if (existing) {
        const oldPrice = parseFloat(existing.pricePerUnit);
        const newPrice = row.pricePerUnit;
        const change   = Math.abs((newPrice - oldPrice) / oldPrice);

        if (oldPrice === newPrice) {
          console.log(`  SAME  "${ingredient.name}" — ${newPriceStr} ${row.unit} (no change)`);
          stats.unchanged++;
          continue;
        }

        if (change >= thresholdPct) {
          // Create a price alert
          await db.insert(priceAlerts).values({
            ingredientId:   ingredient.id,
            ingredientName: ingredient.name,
            oldPriceNok:    existing.pricePerUnit,
            newPriceNok:    newPriceStr,
            oldStore:       supplier.name,
            newStore:       supplier.name,
          });
          const direction = newPrice > oldPrice ? "▲" : "▼";
          console.log(`  ALERT "${ingredient.name}" ${direction} ${existing.pricePerUnit} → ${newPriceStr} ${row.unit} (${(change * 100).toFixed(1)}%)`);
          stats.alerts++;
        } else {
          console.log(`  OK    "${ingredient.name}" ${existing.pricePerUnit} → ${newPriceStr} ${row.unit} (below threshold)`);
        }

        // Update the existing price record
        await db.update(supplierPrices)
          .set({ pricePerUnit: newPriceStr, unit: row.unit, updatedAt: new Date() })
          .where(eq(supplierPrices.id, existing.id));
        stats.updated++;
      } else {
        // No existing price — create new supplier price record
        await db.insert(supplierPrices).values({
          supplierId:   supplier.id,
          ingredientId: ingredient.id,
          pricePerUnit: newPriceStr,
          unit:         row.unit,
          isPreferred:  false,
        });
        console.log(`  NEW   "${ingredient.name}" — ${newPriceStr} ${row.unit} from ${supplier.name}`);
        stats.created++;
      }
    } catch (err) {
      console.error(`  ERROR "${row.ingredientName}": ${err instanceof Error ? err.message : err}`);
      stats.errors++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────`);
  console.log(`  Updated:   ${stats.updated}`);
  console.log(`  Created:   ${stats.created}`);
  console.log(`  Unchanged: ${stats.unchanged}`);
  console.log(`  Alerts:    ${stats.alerts}`);
  console.log(`  Errors:    ${stats.errors}`);
  console.log(`─────────────────────────────────────────────────\n`);

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
