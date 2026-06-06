import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@bakery/db";
import { shopifySettings, cakeOrders, recipes, premadeCakes, premadeCakeVariants, emailSettings, productionSchedules, shopifyIgnoredProducts, decryptToken } from "@bakery/db";
import { eq, and, inArray } from "drizzle-orm";
import { sendOrderConfirmation } from "@/lib/email";
import { checkRateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import {
  mapShopifyOrderToCakeOrderRows,
  buildRecipeTitleLookup,
  buildVariantTitleLookup,
  extractDueDate,
  type ShopifyOrderForMapping,
  type ShopifyLineItem,
} from "@bakery/api/lib/shopify-order-mapping";

// ── Types for Shopify order webhook payload ───────────────────────────────────

/**
 * Webhook payload — superset of ShopifyOrderForMapping (the mapping
 * helper) plus the email field we use directly here.
 */
interface ShopifyOrder extends ShopifyOrderForMapping {
  email: string;
  line_items: ShopifyLineItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate Shopify HMAC-SHA256 signature. */
async function validateHmac(body: string, hmacHeader: string | null, secret: string): Promise<boolean> {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topic      = request.headers.get("x-shopify-topic");

  // Rate-limit per shop domain (or IP if absent) BEFORE HMAC verification,
  // so a flood can't burn CPU on signature computation. 30 req/min/shop is
  // far above any legitimate Shopify webhook delivery rate for one store.
  const rlKey = shopDomain ?? `ip:${getClientIp(request)}`;
  const rl = await checkRateLimit("shopify-webhook", rlKey, 30, "1 m");
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds!);

  // We only handle orders/create (ignore all other topics gracefully)
  if (topic !== "orders/create") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Read the raw body once (needed for HMAC validation)
  const rawBody = await request.text();

  // Look up the owner by shop domain
  const settings = shopDomain
    ? await db.query.shopifySettings.findFirst({
        where: eq(shopifySettings.shopDomain, shopDomain),
      })
    : null;

  if (!settings) {
    console.error("[shopify-webhook] Unknown shop domain:", shopDomain);
    // Return 200 so Shopify doesn't keep retrying for unconfigured stores
    return NextResponse.json({ ok: false, reason: "shop not configured" });
  }

  // Validate HMAC. The webhook secret is mandatory — without it we cannot
  // distinguish a real Shopify delivery from a forged POST, so the only
  // safe response is to reject. Stores connected before completing the
  // webhook wizard will see deliveries fail until they finish setup; this
  // is intentional and surfaces the misconfiguration rather than silently
  // accepting unauthenticated payloads.
  if (!settings.webhookSecret) {
    console.error(
      "[shopify-webhook] No webhook secret configured for shop, rejecting:",
      shopDomain,
    );
    return new NextResponse("Webhook secret not configured", { status: 401 });
  }
  const valid = await validateHmac(rawBody, hmacHeader, decryptToken(settings.webhookSecret));
  if (!valid) {
    console.error("[shopify-webhook] Invalid HMAC for shop:", shopDomain);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Mark that we successfully received and authenticated a webhook from this
  // shop. The setup wizard polls this to confirm end-to-end delivery.
  await db.update(shopifySettings)
    .set({ lastWebhookReceivedAt: new Date(), updatedAt: new Date() })
    .where(eq(shopifySettings.ownerId, settings.ownerId));

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const ownerId            = settings.ownerId;
  const customerEmail      = order.email || order.customer?.email || null;
  const customerName       = order.customer
    ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || null
    : null;
  const dueDate            = extractDueDate(order);
  const shopifyOrderId     = String(order.id);
  const shopifyOrderNumber = order.name; // e.g. "#1042"

  // Check for duplicate (idempotency — Shopify may retry). Scope the
  // lookup to this owner: Shopify order IDs are 64-bit sequential ints
  // that can collide between stores (notably dev stores reset to 1001),
  // so a global ID match could silently drop another tenant's order.
  const existing = await db.query.cakeOrders.findFirst({
    where: and(
      eq(cakeOrders.ownerId,        ownerId),
      eq(cakeOrders.shopifyOrderId, shopifyOrderId),
    ),
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Load all recipes for this owner so we can try title-matching line
  // items. We need shopify_titles too so the matcher catches variants
  // registered via the "Create recipe from order" planner action.
  const ownerRecipes = await db.query.recipes.findMany({
    where: eq(recipes.ownerId, ownerId),
    columns: { id: true, name: true, shopifyTitles: true },
  });
  const recipeLookup = buildRecipeTitleLookup(ownerRecipes);

  // Load all premade cake variants for this owner via the parent cake's
  // ownerId. The matcher prefers a variant hit over a recipe hit when
  // the Shopify line item carries a variant_title.
  const ownerVariants = await db
    .select({ id: premadeCakeVariants.id, shopifyMatchTitle: premadeCakeVariants.shopifyMatchTitle })
    .from(premadeCakeVariants)
    .innerJoin(premadeCakes, eq(premadeCakeVariants.cakeId, premadeCakes.id))
    .where(eq(premadeCakes.ownerId, ownerId));
  const variantLookup = buildVariantTitleLookup(ownerVariants);

  // Load the per-workspace ignore list so we skip blocked Shopify products
  // even when they arrive in real time via the webhook.
  const ignoredRows = await db.query.shopifyIgnoredProducts.findMany({
    where: eq(shopifyIgnoredProducts.ownerId, ownerId),
    columns: { shopifyTitle: true },
  });
  const ignoredTitles = new Set(ignoredRows.map((r) => r.shopifyTitle.toLowerCase()));

  // Convert the Shopify payload to cake_orders rows via the shared mapping
  // helper. Bulk import (packages/api/src/routers/shopify.ts) uses the same
  // helper so webhook and import produce identical dashboard-visible rows.
  const { rows, allMatched } = mapShopifyOrderToCakeOrderRows(order, recipeLookup, ignoredTitles, variantLookup);
  const ordersToInsert = rows.map((r) => ({ ...r, ownerId }));

  let insertedOrders: { id: string; recipeId: string | null; premadeCakeVariantId: string | null; quantity: string; dueDate: string | null; customerName: string | null; notes: string | null }[] = [];
  if (ordersToInsert.length > 0) {
    insertedOrders = await db.insert(cakeOrders).values(ordersToInsert).returning({
      id:                   cakeOrders.id,
      recipeId:             cakeOrders.recipeId,
      premadeCakeVariantId: cakeOrders.premadeCakeVariantId,
      quantity:             cakeOrders.quantity,
      dueDate:              cakeOrders.dueDate,
      customerName:         cakeOrders.customerName,
      notes:                cakeOrders.notes,
    });
  }

  if (allMatched && insertedOrders.length > 0) {
    const ids = insertedOrders.map((o) => o.id);
    await db.update(cakeOrders)
      .set({ status: "planned", updatedAt: new Date() })
      .where(and(
        inArray(cakeOrders.id, ids),
        eq(cakeOrders.ownerId, ownerId),
      ));

    // Mirror the side-effect from cakeOrders.update: when a cake order moves
    // to "planned" we auto-create a production_schedules entry so the baker
    // sees the order on the scheduler. We can't call the tRPC router from
    // here so we replicate the logic inline.
    //
    // Variant-linked orders dereference to the parent cake's recipeId.
    // If the parent cake has no recipe linked yet, we skip auto-planning
    // for that row — the order is still inserted as "planned" but no
    // production schedule. User fixes by linking a recipe to the cake.
    for (const o of insertedOrders) {
      let effectiveRecipeId: string | null = o.recipeId;
      if (!effectiveRecipeId && o.premadeCakeVariantId) {
        const variant = await db
          .select({ recipeId: premadeCakes.recipeId, ownerId: premadeCakes.ownerId })
          .from(premadeCakeVariants)
          .innerJoin(premadeCakes, eq(premadeCakeVariants.cakeId, premadeCakes.id))
          .where(eq(premadeCakeVariants.id, o.premadeCakeVariantId))
          .limit(1);
        if (variant[0]?.ownerId === ownerId && variant[0]?.recipeId) {
          effectiveRecipeId = variant[0].recipeId;
        }
      }
      if (!effectiveRecipeId) continue;

      const existing = await db.query.productionSchedules.findFirst({
        where: and(
          eq(productionSchedules.cakeOrderId, o.id),
          eq(productionSchedules.ownerId, ownerId),
        ),
        columns: { id: true },
      });
      if (existing) continue;

      const recipe = await db.query.recipes.findFirst({
        where: and(eq(recipes.id, effectiveRecipeId), eq(recipes.ownerId, ownerId)),
        columns: { name: true, yieldAmount: true },
      });

      const scheduledDate = o.dueDate ?? new Date().toISOString().slice(0, 10);
      const recipeYield   = recipe?.yieldAmount ? parseFloat(recipe.yieldAmount) : 1;
      const orderQty      = parseFloat(o.quantity || "1");
      const batchCount    = recipeYield > 0 ? orderQty / recipeYield : orderQty;

      await db.insert(productionSchedules).values({
        ownerId,
        recipeId:    effectiveRecipeId,
        recipeName:  recipe?.name ?? null,
        scheduledDate,
        shift:       "morning",
        batchCount:  String(batchCount),
        notes:       `Shopify order ${shopifyOrderNumber} · ${o.customerName ?? "customer"}${o.notes ? ` — ${o.notes}` : ""}`.slice(0, 500),
        status:      "planned",
        cakeOrderId: o.id,
      });
    }
  }

  console.log(
    `[shopify-webhook] Created ${ordersToInsert.length} order(s) from ${shopifyOrderNumber}` +
    `${allMatched ? " · auto-planned" : " · pending review"} (shop: ${shopDomain})`
  );

  // Send order confirmation email if the owner has email notifications enabled
  if (customerEmail && ordersToInsert.length > 0) {
    const emailCfg = await db.query.emailSettings.findFirst({
      where: eq(emailSettings.ownerId, ownerId),
    });

    if (emailCfg?.sendConfirmations && emailCfg.resendApiKey) {
      try {
        await sendOrderConfirmation({
          customerName:       customerName,
          customerEmail,
          shopifyOrderNumber,
          items: order.line_items.map((i) => ({ title: i.title, quantity: i.quantity })),
          dueDate,
          notes:              order.note ?? null,
          fromName:           emailCfg.fromName,
          fromEmail:          emailCfg.fromEmail,
          resendApiKey:       decryptToken(emailCfg.resendApiKey),
        });
      } catch (err) {
        // Log but don't fail the webhook — order was already saved
        console.error("[shopify-webhook] Failed to send confirmation email:", err);
      }
    }
  }

  return NextResponse.json({ ok: true, created: ordersToInsert.length });
}
