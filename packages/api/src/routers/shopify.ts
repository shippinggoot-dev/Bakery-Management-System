import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, nonAnonymousProcedure } from "../trpc";
import { shopifySettings, recipes, premadeCakes, premadeCakeVariants, customers, cakeOrders, productionSchedules, shopifyIgnoredProducts, encryptToken, decryptToken } from "@bakery/db";
import {
  syncProductFromRecipe,
  syncProductFromPremadeCake,
  pushAllInventory,
} from "../services/shopify-sync";
import {
  mapShopifyOrderToCakeOrderRows,
  buildRecipeTitleLookup,
  buildVariantTitleLookup,
  type ShopifyOrderForMapping,
  type ShopifyLineItem,
} from "../lib/shopify-order-mapping";

// ── Shopify Admin API helper ──────────────────────────────────────────────────

const API_VERSION = "2024-10";

/**
 * Stable error codes shared with the client. The client maps each to a
 * localized message. Codes prefix the TRPCError message so they survive
 * the wire (e.g. "[NOT_MYSHOPIFY] www.sucre.no"). Anything not prefixed
 * falls through to a generic error message.
 */
export const SHOPIFY_ERROR_CODES = {
  AUTH_FAILED:    "AUTH_FAILED",
  MISSING_SCOPES: "MISSING_SCOPES",
  CANNOT_REACH:   "CANNOT_REACH",
} as const;

function shopifyError(code: keyof typeof SHOPIFY_ERROR_CODES, detail: string): TRPCError {
  return new TRPCError({
    code:    "BAD_REQUEST",
    message: `[${code}] ${detail}`,
  });
}

async function shopifyFetch<T>(
  domain: string,
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `https://${domain}/admin/api/${API_VERSION}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    // Network-level failure — DNS, connection refused, etc.
    throw shopifyError(
      "CANNOT_REACH",
      err instanceof Error ? err.message : "network error",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw shopifyError("AUTH_FAILED", `${res.status}: ${body || res.statusText}`);
    }
    if (res.status === 403) {
      throw shopifyError("MISSING_SCOPES", `${res.status}: ${body || res.statusText}`);
    }
    if (res.status === 404) {
      throw shopifyError("CANNOT_REACH", `${res.status}: ${body || res.statusText}`);
    }
    throw new Error(`Shopify API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Return a masked preview of the token — safe to send to the client. */
function maskToken(token: string): string {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 6)}••••••••••••${token.slice(-4)}`;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const shopifyRouter = createTRPCRouter({

  /** Returns the owner's Shopify connection (token masked). */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!row) return null;
    return {
      id:           row.id,
      shopDomain:   row.shopDomain,
      shopName:     row.shopName,
      shopEmail:    row.shopEmail,
      isConnected:  row.isConnected,
      syncProducts: row.syncProducts,
      syncOrders:   row.syncOrders,
      lastSyncAt:   row.lastSyncAt,
      tokenPreview:           maskToken(decryptToken(row.accessToken)),
      lastCustomerImportAt:   row.lastCustomerImportAt,
      lastOrderImportAt:      row.lastOrderImportAt,
      lastInventorySyncAt:    row.lastInventorySyncAt,
      shopifyLocationId:      row.shopifyLocationId,
      /** Whether the user has saved a webhook signing secret — drives the
       *  "Set up automatic orders" / "Active" state on the settings page. */
      webhookConfigured:      !!row.webhookSecret,
      lastWebhookReceivedAt:  row.lastWebhookReceivedAt,
    };
  }),

  // Note: the manual `connect` mutation has been removed in favour of the
  // OAuth flow served by /api/shopify/oauth/start + /callback. The callback
  // writes directly to shopifySettings after exchanging the code for an
  // access token, so there's no need for a credential-accepting endpoint.

  /** Update sync preferences without re-entering credentials. */
  updatePreferences: nonAnonymousProcedure
    .input(z.object({
      syncProducts: z.boolean(),
      syncOrders:   z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(shopifySettings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(shopifySettings.ownerId, ctx.user.id));
      return { success: true };
    }),

  /** Remove the Shopify connection. */
  disconnect: nonAnonymousProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(shopifySettings)
      .where(eq(shopifySettings.ownerId, ctx.user.id));
    return { success: true };
  }),

  // ── Ignored-product list ─────────────────────────────────────────────────
  //
  // Per-workspace block list. Future webhook + bulk import deliveries skip
  // any line item whose title is on this list. Use cases: gift cards,
  // deposits, merchandise, anything Shopify sells that shouldn't appear in
  // the BMS fulfillment queue.

  /** List ignored Shopify product titles for this workspace. */
  listIgnoredProducts: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.shopifyIgnoredProducts.findMany({
      where: eq(shopifyIgnoredProducts.ownerId, ctx.user.id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }),

  /**
   * Add a Shopify product title to the ignore list. Future imports skip
   * it. Idempotent — calling twice with the same title is a no-op.
   */
  ignoreProduct: nonAnonymousProcedure
    .input(z.object({
      shopifyTitle: z.string().min(1).max(255),
      reason:       z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(shopifyIgnoredProducts)
        .values({
          ownerId:      ctx.user.id,
          shopifyTitle: input.shopifyTitle.trim(),
          reason:       input.reason?.trim() || null,
        })
        .onConflictDoNothing({
          target: [shopifyIgnoredProducts.ownerId, shopifyIgnoredProducts.shopifyTitle],
        });
      return { ok: true };
    }),

  /** Remove a title from the ignore list — future imports will pick it up. */
  unignoreProduct: nonAnonymousProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(shopifyIgnoredProducts)
        .where(and(
          eq(shopifyIgnoredProducts.id,      input),
          eq(shopifyIgnoredProducts.ownerId, ctx.user.id),
        ));
      return { ok: true };
    }),

  /**
   * Push active recipes AND premade cakes to Shopify as products.
   *
   * Upsert: if the local row already has a shopifyProductId, the matching
   * Shopify product is *updated* (title, description, price, status). If
   * not, a new Shopify product is created and the IDs are persisted back
   * locally so the next sync updates rather than duplicates.
   *
   * Status maps from `isActive`: active local row → active Shopify product;
   * inactive → draft. (Drafts are hidden from the storefront.)
   */
  syncProducts: nonAnonymousProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");

    const ownerRecipes = await ctx.db.query.recipes.findMany({
      where: and(eq(recipes.ownerId, ctx.user.id), eq(recipes.isActive, true)),
      columns: { id: true, name: true },
    });

    const ownerCakes = await ctx.db.query.premadeCakes.findMany({
      where: and(eq(premadeCakes.ownerId, ctx.user.id), eq(premadeCakes.isActive, true)),
      columns: { id: true, name: true },
    });

    let synced = 0;
    const errors: string[] = [];

    for (const r of ownerRecipes) {
      try {
        const result = await syncProductFromRecipe(ctx.user.id, r.id);
        if (result) synced++;
      } catch (err) {
        errors.push(`Recipe "${r.name}": ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    for (const c of ownerCakes) {
      try {
        const result = await syncProductFromPremadeCake(ctx.user.id, c.id);
        if (result) synced++;
      } catch (err) {
        errors.push(`Cake "${c.name}": ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    await ctx.db.update(shopifySettings)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, ctx.user.id));

    return {
      synced,
      total: ownerRecipes.length + ownerCakes.length,
      errors,
    };
  }),

  /**
   * Backwards-compatibility alias for the older syncRecipes name. The UI
   * still calls this in some places — both names point at the same upsert.
   */
  syncRecipes: nonAnonymousProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");

    const ownerRecipes = await ctx.db.query.recipes.findMany({
      where: and(eq(recipes.ownerId, ctx.user.id), eq(recipes.isActive, true)),
      columns: { id: true, name: true },
    });

    let synced = 0;
    const errors: string[] = [];

    for (const r of ownerRecipes) {
      try {
        const result = await syncProductFromRecipe(ctx.user.id, r.id);
        if (result) synced++;
      } catch (err) {
        errors.push(`${r.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    await ctx.db.update(shopifySettings)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, ctx.user.id));

    return { synced, total: ownerRecipes.length, errors };
  }),

  /**
   * Manually push current inventory levels for every Shopify-linked recipe
   * and cake. Useful after a fresh connect, after bulk receiving, or to
   * recover from any push that errored out previously.
   */
  pushInventory: nonAnonymousProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");
    return pushAllInventory(ctx.user.id);
  }),

  /**
   * List Shopify locations and let the user pick the primary. Multi-location
   * stores need this; single-location stores have it auto-detected on first
   * inventory push.
   */
  getLocations: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) return [];

    const url = `https://${settings.shopDomain}/admin/api/2024-10/locations.json`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": decryptToken(settings.accessToken),
      },
    });
    if (!res.ok) return [];

    const json = await res.json() as {
      locations: { id: number; name: string; active: boolean }[];
    };
    return json.locations.map((l) => ({
      id:     String(l.id),
      name:   l.name,
      active: l.active,
    }));
  }),

  /** Set the primary Shopify location for inventory pushes. */
  setLocation: nonAnonymousProcedure
    .input(z.object({ locationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(shopifySettings)
        .set({ shopifyLocationId: input.locationId, updatedAt: new Date() })
        .where(eq(shopifySettings.ownerId, ctx.user.id));
      return { ok: true };
    }),

  /**
   * Import Shopify customers into the local customers table.
   * Matches by email — skips customers that already exist.
   * New customers receive a generated loyalty card number.
   */
  importCustomers: nonAnonymousProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");

    type ShopifyCustomer = {
      id: number;
      email?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      total_spent: string;
    };

    const { customers: shopifyCustomers } = await shopifyFetch<{ customers: ShopifyCustomer[] }>(
      settings.shopDomain,
      decryptToken(settings.accessToken),
      "/customers.json?limit=250"
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sc of shopifyCustomers) {
      try {
        const email = sc.email?.toLowerCase().trim() || null;
        const firstName = sc.first_name?.trim() || "Unknown";
        const lastName  = sc.last_name?.trim()  || "Customer";

        // Skip if already in the database (match by email within this owner's data)
        if (email) {
          const existing = await ctx.db.query.customers.findFirst({
            where: (c, { and, eq: eqFn, ilike }) =>
              and(eqFn(c.ownerId, ctx.user.id), ilike(c.email, email)),
            columns: { id: true },
          });
          if (existing) { skipped++; continue; }
        }

        // Generate a unique card number for this owner
        const count = await ctx.db.$count(customers, eq(customers.ownerId, ctx.user.id));
        const seq   = (count + 1).toString().padStart(6, "0");
        const cardNumber = `BAK-${seq}`;

        await ctx.db.insert(customers).values({
          ownerId:      ctx.user.id,
          cardNumber,
          firstName,
          lastName,
          email,
          phone:        sc.phone?.trim() || null,
          loyaltyOptIn: false,
          totalSpend:   sc.total_spent || "0",
        });
        created++;
      } catch (err) {
        errors.push(
          `${sc.email ?? `#${sc.id}`}: ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    await ctx.db.update(shopifySettings)
      .set({ lastCustomerImportAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, ctx.user.id));

    return { created, skipped, total: shopifyCustomers.length, errors };
  }),

  /**
   * Import Shopify orders into the local cake_orders table — same shape
   * the real-time webhook produces. Fetches only orders created after
   * the last import (incremental). For each order:
   *   - Skip if a cake_orders row with this shopifyOrderId already exists
   *     (covers webhook + import overlap on the same store).
   *   - Create one cake_orders row per Shopify line item with recipe-name
   *     matching, due-date extraction, and per-unit salePrice.
   *   - When every line item resolved to a recipe, auto-flip the orders to
   *     "planned" and create production_schedules entries — same behaviour
   *     as the webhook so the dashboard's "Orders this week" / "Top seller"
   *     / "Shopify activity" tiles populate identically regardless of
   *     whether the order arrived live or via the bulk import.
   */
  importOrders: nonAnonymousProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");

    type ShopifyOrderResponse = ShopifyOrderForMapping & {
      total_price: string;
      currency:    string;
      created_at:  string;
      line_items:  ShopifyLineItem[];
    };

    // Fetch orders since the last import (or all if first run)
    const sinceParam = settings.lastOrderImportAt
      ? `&created_at_min=${settings.lastOrderImportAt.toISOString()}`
      : "";

    const { orders: shopifyOrders } = await shopifyFetch<{ orders: ShopifyOrderResponse[] }>(
      settings.shopDomain,
      decryptToken(settings.accessToken),
      `/orders.json?status=any&limit=250${sinceParam}`
    );

    // Load recipes once and build the title-aware lookup map the mapper
    // expects. shopify_titles is included so recipes the user created
    // via the planner "Create recipe from order" flow match their variants.
    const ownerRecipes = await ctx.db.query.recipes.findMany({
      where: eq(recipes.ownerId, ctx.user.id),
      columns: { id: true, name: true, shopifyTitles: true },
    });
    const recipeLookup = buildRecipeTitleLookup(ownerRecipes);

    // Phase 2: load premade cake variants too, joined through the parent
    // cake for ownership filtering. The matcher prefers a variant hit
    // over a recipe hit when the line item carries a variant_title.
    const ownerVariants = await ctx.db
      .select({ id: premadeCakeVariants.id, shopifyMatchTitle: premadeCakeVariants.shopifyMatchTitle })
      .from(premadeCakeVariants)
      .innerJoin(premadeCakes, eq(premadeCakeVariants.cakeId, premadeCakes.id))
      .where(eq(premadeCakes.ownerId, ctx.user.id));
    const variantLookup = buildVariantTitleLookup(ownerVariants);

    // Load the per-workspace ignore list so we skip blocked Shopify
    // products at import time. Stored case-sensitively but matched
    // case-insensitively, same as the recipe title lookup.
    const ignoredRows = await ctx.db.query.shopifyIgnoredProducts.findMany({
      where: eq(shopifyIgnoredProducts.ownerId, ctx.user.id),
      columns: { shopifyTitle: true },
    });
    const ignoredTitles = new Set(ignoredRows.map((r) => r.shopifyTitle.toLowerCase()));

    let imported   = 0;
    let skipped    = 0;
    let autoPlanned = 0;
    const errors: string[] = [];

    for (const order of shopifyOrders) {
      try {
        const shopifyOrderId = String(order.id);

        // Idempotency — skip orders that already exist (re-runs, or orders
        // that came in via the webhook and the import both).
        const dupe = await ctx.db.query.cakeOrders.findFirst({
          where: and(
            eq(cakeOrders.ownerId,        ctx.user.id),
            eq(cakeOrders.shopifyOrderId, shopifyOrderId),
          ),
          columns: { id: true },
        });
        if (dupe) { skipped++; continue; }

        const { rows, allMatched } = mapShopifyOrderToCakeOrderRows(order, recipeLookup, ignoredTitles, variantLookup);
        if (rows.length === 0) { skipped++; continue; }

        const ordersToInsert = rows.map((r) => ({ ...r, ownerId: ctx.user.id }));
        const inserted = await ctx.db
          .insert(cakeOrders)
          .values(ordersToInsert)
          .returning({
            id:                   cakeOrders.id,
            recipeId:             cakeOrders.recipeId,
            premadeCakeVariantId: cakeOrders.premadeCakeVariantId,
            quantity:             cakeOrders.quantity,
            dueDate:              cakeOrders.dueDate,
          });

        imported++;

        // Auto-plan when every line item resolved to a recipe or variant.
        // Variant rows dereference to the parent cake's recipeId; rows
        // whose parent cake has no recipe yet are skipped (the order is
        // still "planned" but no production schedule is created).
        if (allMatched && inserted.length > 0) {
          const ids = inserted.map((o) => o.id);
          await ctx.db
            .update(cakeOrders)
            .set({ status: "planned", updatedAt: new Date() })
            .where(and(
              inArray(cakeOrders.id, ids),
              eq(cakeOrders.ownerId, ctx.user.id),
            ));

          // Mirror the webhook's production-schedule side effect.
          for (const o of inserted) {
            let effectiveRecipeId: string | null = o.recipeId;
            if (!effectiveRecipeId && o.premadeCakeVariantId) {
              // Variant override wins; fall back to the parent cake's recipe.
              const variant = await ctx.db
                .select({
                  variantRecipeId: premadeCakeVariants.recipeId,
                  cakeRecipeId:    premadeCakes.recipeId,
                  ownerId:         premadeCakes.ownerId,
                })
                .from(premadeCakeVariants)
                .innerJoin(premadeCakes, eq(premadeCakeVariants.cakeId, premadeCakes.id))
                .where(eq(premadeCakeVariants.id, o.premadeCakeVariantId))
                .limit(1);
              if (variant[0]?.ownerId === ctx.user.id) {
                effectiveRecipeId = variant[0].variantRecipeId ?? variant[0].cakeRecipeId ?? null;
              }
            }
            if (!effectiveRecipeId) continue;

            const existingSchedule = await ctx.db.query.productionSchedules.findFirst({
              where: and(
                eq(productionSchedules.cakeOrderId, o.id),
                eq(productionSchedules.ownerId,     ctx.user.id),
              ),
              columns: { id: true },
            });
            if (existingSchedule) continue;

            const recipe = await ctx.db.query.recipes.findFirst({
              where: and(eq(recipes.id, effectiveRecipeId), eq(recipes.ownerId, ctx.user.id)),
              columns: { name: true, yieldAmount: true },
            });
            const scheduledDate = o.dueDate ?? new Date().toISOString().slice(0, 10);
            const recipeYield   = recipe?.yieldAmount ? parseFloat(recipe.yieldAmount) : 1;
            const orderQty      = parseFloat(o.quantity || "1");
            const batchCount    = recipeYield > 0 ? orderQty / recipeYield : orderQty;

            await ctx.db.insert(productionSchedules).values({
              ownerId:     ctx.user.id,
              recipeId:    effectiveRecipeId,
              recipeName:  recipe?.name ?? null,
              scheduledDate,
              shift:       "morning",
              batchCount:  String(batchCount),
              notes:       `Shopify import ${order.name}`.slice(0, 500),
              status:      "planned",
              cakeOrderId: o.id,
            });
          }
          autoPlanned++;
        }
      } catch (err) {
        errors.push(
          `Order ${order.name}: ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    await ctx.db.update(shopifySettings)
      .set({ lastOrderImportAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, ctx.user.id));

    return {
      imported,
      skipped,
      autoPlanned,
      total: shopifyOrders.length,
      errors,
    };
  }),

  /** Save the Shopify webhook signing secret for this store. */
  updateWebhookSecret: nonAnonymousProcedure
    .input(z.object({ webhookSecret: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(shopifySettings)
        .set({ webhookSecret: encryptToken(input.webhookSecret), updatedAt: new Date() })
        .where(eq(shopifySettings.ownerId, ctx.user.id));
      return { ok: true };
    }),

  /**
   * Returns the timestamp of the most recently received Shopify webhook
   * for this owner. Polled by the setup-wizard test step to confirm the
   * webhook is actually being delivered.
   */
  checkRecentWebhook: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
      columns: { lastWebhookReceivedAt: true },
    });
    return { lastReceivedAt: row?.lastWebhookReceivedAt ?? null };
  }),

  /**
   * Fetch the last 60 days of Shopify orders for review.
   * Returns a lightweight summary — does not write anything to the database.
   */
  previewOrders: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) return [];

    const since = new Date();
    since.setDate(since.getDate() - 60);

    type ShopifyOrder = {
      id: number;
      name: string;
      total_price: string;
      currency: string;
      created_at: string;
      financial_status: string;
      customer?: { email?: string; first_name?: string; last_name?: string };
      line_items: Array<{ title: string; quantity: number; price: string }>;
    };

    const { orders } = await shopifyFetch<{ orders: ShopifyOrder[] }>(
      settings.shopDomain,
      decryptToken(settings.accessToken),
      `/orders.json?created_at_min=${since.toISOString()}&status=any&limit=50`
    );

    return orders.map((o) => ({
      id:       String(o.id),
      name:     o.name,
      total:    o.total_price,
      currency: o.currency,
      date:     o.created_at,
      status:   o.financial_status,
      customer: o.customer
        ? `${o.customer.first_name ?? ""} ${o.customer.last_name ?? ""}`.trim() || o.customer.email || "Guest"
        : "Guest",
      items: o.line_items.map((l) => `${l.quantity}× ${l.title}`).join(", "),
    }));
  }),
});
