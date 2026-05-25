/**
 * Shopify Sync Service
 *
 * Bidirectional integration between the local catalog and a Shopify store.
 *
 * Push (Bakery → Shopify):
 *   - syncProductFromRecipe     : upsert a recipe as a Shopify product
 *   - syncProductFromPremadeCake: upsert a premade cake as a Shopify product
 *   - pushInventoryForRecipe    : recalculate max-available and push level
 *   - pushInventoryForRecipesUsingIngredient: fan out after a stock change
 *
 * "Max available" interpretation:
 *   The inventory we expose to Shopify is the maximum number of finished
 *   units we could produce *right now* given current ingredient stock.
 *   If any required ingredient runs out, the product drops to 0 and Shopify
 *   stops accepting orders. This prevents oversell without needing a
 *   separate finished-goods table.
 *
 * Errors are caught and logged; callers (e.g. inventoryService) treat the
 * push as fire-and-forget to keep local writes fast.
 */

import { eq, and, inArray } from "drizzle-orm";
import { db } from "@bakery/db";
import {
  recipes,
  recipeIngredients,
  ingredients,
  premadeCakes,
  shopifySettings,
  decryptToken,
} from "@bakery/db";

// ─── Shopify Admin API helper ────────────────────────────────────────────────

const API_VERSION = "2024-10";

async function shopifyFetch<T>(
  domain: string,
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `https://${domain}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Connection helper ───────────────────────────────────────────────────────

async function getConnectedSettings(ownerId: string) {
  const settings = await db.query.shopifySettings.findFirst({
    where: eq(shopifySettings.ownerId, ownerId),
  });
  if (!settings?.isConnected) return null;
  // Decrypt the access token here so downstream helpers (shopifyFetch,
  // getOrFetchLocationId, etc.) keep working with plaintext, as they did
  // before at-rest encryption. Single decryption point per request.
  return { ...settings, accessToken: decryptToken(settings.accessToken) };
}

/**
 * Fetch and cache the primary Shopify location ID. Inventory pushes target
 * a specific location; for single-location stores we auto-detect the first
 * active one and persist it.
 */
async function getOrFetchLocationId(settings: {
  ownerId: string;
  shopDomain: string;
  accessToken: string;
  shopifyLocationId: string | null;
}): Promise<string | null> {
  if (settings.shopifyLocationId) return settings.shopifyLocationId;

  try {
    const { locations } = await shopifyFetch<{
      locations: { id: number; active: boolean; name: string }[];
    }>(settings.shopDomain, settings.accessToken, "/locations.json");

    const primary = locations.find((l) => l.active) ?? locations[0];
    if (!primary) return null;

    const id = String(primary.id);
    await db.update(shopifySettings)
      .set({ shopifyLocationId: id, updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, settings.ownerId));

    return id;
  } catch (err) {
    console.error("[shopify-sync] Failed to fetch locations:", err);
    return null;
  }
}

// ─── Product upsert types ────────────────────────────────────────────────────

interface ShopifyProduct {
  id: number;
  variants: Array<{
    id: number;
    inventory_item_id: number;
  }>;
}

interface UpsertResult {
  productId:        string;
  variantId:        string;
  inventoryItemId:  string;
}

/**
 * Push a recipe to Shopify as a product. Creates or updates depending on
 * whether the recipe already has a shopifyProductId. Returns the IDs so the
 * caller can persist them.
 */
export async function syncProductFromRecipe(
  ownerId: string,
  recipeId: string,
): Promise<UpsertResult | null> {
  const settings = await getConnectedSettings(ownerId);
  if (!settings) return null;

  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.ownerId, ownerId)),
    with: { category: true },
  });
  if (!recipe) return null;

  const productPayload = {
    product: {
      title:        recipe.name,
      body_html:    buildBodyHtml(recipe.description, recipe.instructions, recipe.notes),
      product_type: recipe.category?.name ?? "Bakery",
      status:       recipe.isActive ? "active" : "draft",
      variants: [{
        title:                `${recipe.yieldAmount} ${recipe.yieldUnit}`,
        price:                recipe.sellingPrice ?? "0.00",
        requires_shipping:    true,
        taxable:              true,
        // "shopify" lets Shopify track inventory for us — required so
        // inventory_levels.set can affect anything
        inventory_management: "shopify",
      }],
    },
  };

  return upsertProduct(settings, recipe.shopifyProductId, productPayload, async (ids) => {
    await db.update(recipes)
      .set({
        shopifyProductId:       ids.productId,
        shopifyVariantId:       ids.variantId,
        shopifyInventoryItemId: ids.inventoryItemId,
        updatedAt:              new Date(),
      })
      .where(eq(recipes.id, recipeId));
  });
}

/**
 * Push a premade cake to Shopify as a product. Same shape as
 * syncProductFromRecipe but reads from premade_cakes.
 */
export async function syncProductFromPremadeCake(
  ownerId: string,
  cakeId: string,
): Promise<UpsertResult | null> {
  const settings = await getConnectedSettings(ownerId);
  if (!settings) return null;

  const cake = await db.query.premadeCakes.findFirst({
    where: and(eq(premadeCakes.id, cakeId), eq(premadeCakes.ownerId, ownerId)),
  });
  if (!cake) return null;

  const productPayload = {
    product: {
      title:        cake.name,
      body_html:    buildBodyHtml(cake.description, null, cake.allergens),
      product_type: "Cake",
      status:       cake.isActive ? "active" : "draft",
      variants: [{
        title:                "Default",
        price:                cake.basePrice,
        requires_shipping:    true,
        taxable:              true,
        inventory_management: "shopify",
      }],
    },
  };

  return upsertProduct(settings, cake.shopifyProductId, productPayload, async (ids) => {
    await db.update(premadeCakes)
      .set({
        shopifyProductId:       ids.productId,
        shopifyVariantId:       ids.variantId,
        shopifyInventoryItemId: ids.inventoryItemId,
        updatedAt:              new Date(),
      })
      .where(eq(premadeCakes.id, cakeId));
  });
}

// ─── Shared upsert ───────────────────────────────────────────────────────────

async function upsertProduct(
  settings: { shopDomain: string; accessToken: string },
  existingProductId: string | null,
  payload: object,
  onCreated: (ids: UpsertResult) => Promise<void>,
): Promise<UpsertResult | null> {
  if (existingProductId) {
    // Update path — Shopify's PUT /products/{id}.json reuses the same shape
    const { product } = await shopifyFetch<{ product: ShopifyProduct }>(
      settings.shopDomain,
      settings.accessToken,
      `/products/${existingProductId}.json`,
      { method: "PUT", body: JSON.stringify(payload) },
    );

    const variant = product.variants[0];
    if (!variant) return null;

    return {
      productId:       String(product.id),
      variantId:       String(variant.id),
      inventoryItemId: String(variant.inventory_item_id),
    };
  }

  // Create path — POST /products.json
  const { product } = await shopifyFetch<{ product: ShopifyProduct }>(
    settings.shopDomain,
    settings.accessToken,
    "/products.json",
    { method: "POST", body: JSON.stringify(payload) },
  );

  const variant = product.variants[0];
  if (!variant) return null;

  const ids: UpsertResult = {
    productId:       String(product.id),
    variantId:       String(variant.id),
    inventoryItemId: String(variant.inventory_item_id),
  };
  await onCreated(ids);
  return ids;
}

function buildBodyHtml(...parts: (string | null)[]): string {
  const cleaned = parts.filter(Boolean) as string[];
  if (cleaned.length === 0) return "";
  return cleaned
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ─── Inventory level push ────────────────────────────────────────────────────

/**
 * For a given recipe, calculate the maximum number of yield-units we could
 * produce given current ingredient stock, and push that to Shopify.
 *
 * Calculation: for each ingredient, max_runs = floor(stock / required).
 * Recipe-level max_runs = min over all ingredients. max_units = max_runs ×
 * yieldAmount. Optional ingredients are excluded.
 */
export async function pushInventoryForRecipe(
  ownerId: string,
  recipeId: string,
): Promise<{ ok: true; available: number } | { ok: false; reason: string }> {
  const settings = await getConnectedSettings(ownerId);
  if (!settings) return { ok: false, reason: "not_connected" };

  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.ownerId, ownerId)),
    with: {
      ingredients: { with: { ingredient: true } },
    },
  });
  if (!recipe) return { ok: false, reason: "recipe_not_found" };
  if (!recipe.shopifyInventoryItemId) {
    return { ok: false, reason: "not_synced_to_shopify" };
  }

  const yieldAmount = parseFloat(recipe.yieldAmount) || 1;

  // Calculate max runs across required ingredients
  let maxRuns = Infinity;
  for (const ri of recipe.ingredients) {
    if (ri.isOptional) continue;
    const required = parseFloat(ri.quantity);
    const stock    = parseFloat(ri.ingredient.currentStock ?? "0");
    if (required <= 0) continue;
    const runs = Math.floor(stock / required);
    if (runs < maxRuns) maxRuns = runs;
  }
  if (maxRuns === Infinity) maxRuns = 0;

  const available = Math.max(0, Math.floor(maxRuns * yieldAmount));

  const locationId = await getOrFetchLocationId(settings);
  if (!locationId) return { ok: false, reason: "no_location" };

  await shopifyFetch(
    settings.shopDomain,
    settings.accessToken,
    "/inventory_levels/set.json",
    {
      method: "POST",
      body: JSON.stringify({
        location_id:       Number(locationId),
        inventory_item_id: Number(recipe.shopifyInventoryItemId),
        available,
      }),
    },
  );

  return { ok: true, available };
}

/**
 * For a given premade cake, push inventory the same way. If the cake has a
 * linked recipe, we use the recipe-based calculation; otherwise we mark the
 * cake as having "999" available (effectively unlimited — pricing-only items
 * with no stock constraint).
 */
export async function pushInventoryForPremadeCake(
  ownerId: string,
  cakeId: string,
): Promise<{ ok: true; available: number } | { ok: false; reason: string }> {
  const settings = await getConnectedSettings(ownerId);
  if (!settings) return { ok: false, reason: "not_connected" };

  const cake = await db.query.premadeCakes.findFirst({
    where: and(eq(premadeCakes.id, cakeId), eq(premadeCakes.ownerId, ownerId)),
  });
  if (!cake) return { ok: false, reason: "cake_not_found" };
  if (!cake.shopifyInventoryItemId) {
    return { ok: false, reason: "not_synced_to_shopify" };
  }

  let available = 999;
  if (cake.recipeId) {
    const result = await pushInventoryForRecipe(ownerId, cake.recipeId);
    if (result.ok) {
      available = result.available;
    }
    // If the recipe-based push succeeded, the recipe's inventory item already
    // got the correct number. We still need to push to *this* cake's
    // inventory item separately because Shopify treats them as independent.
  }

  const locationId = await getOrFetchLocationId(settings);
  if (!locationId) return { ok: false, reason: "no_location" };

  await shopifyFetch(
    settings.shopDomain,
    settings.accessToken,
    "/inventory_levels/set.json",
    {
      method: "POST",
      body: JSON.stringify({
        location_id:       Number(locationId),
        inventory_item_id: Number(cake.shopifyInventoryItemId),
        available,
      }),
    },
  );

  return { ok: true, available };
}

/**
 * Fan-out: when an ingredient's stock changes, push fresh inventory levels
 * for every Shopify-linked recipe that uses it. Called as fire-and-forget
 * from inventoryService — errors are logged but do not block the local
 * mutation that triggered them.
 */
export async function pushInventoryForRecipesUsingIngredient(
  ownerId: string,
  ingredientId: string,
): Promise<void> {
  try {
    const settings = await getConnectedSettings(ownerId);
    if (!settings) return; // Not connected — nothing to do

    // Find every Shopify-linked recipe that uses this ingredient
    const affectedRecipes = await db
      .select({ recipeId: recipeIngredients.recipeId })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
      .where(and(
        eq(recipeIngredients.ingredientId, ingredientId),
        eq(recipes.ownerId, ownerId),
      ));

    const recipeIds = [...new Set(affectedRecipes.map((r) => r.recipeId))];

    // Filter to only those that have been synced to Shopify
    const syncedRecipes = await db.query.recipes.findMany({
      where: and(
        inArray(recipes.id, recipeIds),
        eq(recipes.ownerId, ownerId),
      ),
      columns: { id: true, shopifyInventoryItemId: true },
    });

    for (const r of syncedRecipes) {
      if (!r.shopifyInventoryItemId) continue;
      try {
        await pushInventoryForRecipe(ownerId, r.id);
      } catch (err) {
        console.error(`[shopify-sync] Failed to push recipe ${r.id}:`, err);
      }
    }

    // Also push any premade cakes whose linked recipe was affected
    const affectedCakes = await db.query.premadeCakes.findMany({
      where: and(
        inArray(premadeCakes.recipeId, recipeIds.length > 0 ? recipeIds : [""]),
        eq(premadeCakes.ownerId, ownerId),
      ),
      columns: { id: true, shopifyInventoryItemId: true },
    });

    for (const c of affectedCakes) {
      if (!c.shopifyInventoryItemId) continue;
      try {
        await pushInventoryForPremadeCake(ownerId, c.id);
      } catch (err) {
        console.error(`[shopify-sync] Failed to push cake ${c.id}:`, err);
      }
    }

    if (syncedRecipes.length > 0 || affectedCakes.length > 0) {
      await db.update(shopifySettings)
        .set({ lastInventorySyncAt: new Date(), updatedAt: new Date() })
        .where(eq(shopifySettings.ownerId, ownerId));
    }
  } catch (err) {
    // Never let a Shopify sync failure bubble up to the caller — local
    // inventory writes must remain fast and reliable.
    console.error("[shopify-sync] Fan-out failed:", err);
  }
}

/**
 * Bulk push: recalculate and push inventory for every synced recipe and
 * cake in a workspace. Used by the manual "Push inventory" button in
 * settings, and on first connect to seed Shopify with current levels.
 */
export async function pushAllInventory(
  ownerId: string,
): Promise<{ pushed: number; errors: string[] }> {
  const settings = await getConnectedSettings(ownerId);
  if (!settings) return { pushed: 0, errors: ["Not connected to Shopify"] };

  const errors: string[] = [];
  let pushed = 0;

  const syncedRecipes = await db.query.recipes.findMany({
    where: and(eq(recipes.ownerId, ownerId), eq(recipes.isActive, true)),
    columns: { id: true, name: true, shopifyInventoryItemId: true },
  });

  for (const r of syncedRecipes) {
    if (!r.shopifyInventoryItemId) continue;
    try {
      await pushInventoryForRecipe(ownerId, r.id);
      pushed++;
    } catch (err) {
      errors.push(`${r.name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const syncedCakes = await db.query.premadeCakes.findMany({
    where: and(eq(premadeCakes.ownerId, ownerId), eq(premadeCakes.isActive, true)),
    columns: { id: true, name: true, shopifyInventoryItemId: true },
  });

  for (const c of syncedCakes) {
    if (!c.shopifyInventoryItemId) continue;
    try {
      await pushInventoryForPremadeCake(ownerId, c.id);
      pushed++;
    } catch (err) {
      errors.push(`${c.name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  await db.update(shopifySettings)
    .set({ lastInventorySyncAt: new Date(), updatedAt: new Date() })
    .where(eq(shopifySettings.ownerId, ownerId));

  return { pushed, errors };
}
