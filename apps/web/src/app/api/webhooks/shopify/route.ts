import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@bakery/db";
import { shopifySettings, cakeOrders, recipes, emailSettings } from "@bakery/db";
import { eq } from "drizzle-orm";
import { sendOrderConfirmation } from "@/lib/email";

// ── Types for Shopify order webhook payload ───────────────────────────────────

interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  variant_title: string | null;
}

interface ShopifyNoteAttribute {
  name: string;
  value: string;
}

interface ShopifyOrder {
  id: number;
  name: string;               // e.g. "#1042"
  email: string;
  financial_status: string;   // paid | pending | refunded | voided | ...
  line_items: ShopifyLineItem[];
  note: string | null;
  note_attributes: ShopifyNoteAttribute[];
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
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

/** Map Shopify financial_status → our paymentStatus enum. */
function mapPaymentStatus(status: string): "pending" | "paid" | "unpaid" | "refunded" {
  switch (status) {
    case "paid":               return "paid";
    case "refunded":
    case "partially_refunded":
    case "voided":             return "refunded";
    case "pending":
    case "authorized":
    case "partially_paid":     return "pending";
    default:                   return "unpaid";
  }
}

/**
 * Try to extract a delivery / due date from the order.
 * Shopify bakery orders often put the date in a note attribute.
 */
function extractDueDate(order: ShopifyOrder): string | null {
  const keywords = ["delivery_date", "pickup_date", "due_date", "collection_date", "date"];
  for (const attr of order.note_attributes ?? []) {
    if (keywords.some((k) => attr.name.toLowerCase().includes(k))) {
      // Normalise to YYYY-MM-DD if possible
      const d = new Date(attr.value);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return attr.value; // keep raw if we can't parse it
    }
  }
  // Scan the note field for ISO or DD/MM/YYYY patterns
  if (order.note) {
    const isoMatch = order.note.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const dmyMatch = order.note.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]!.padStart(2, "0")}-${dmyMatch[1]!.padStart(2, "0")}`;
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topic      = request.headers.get("x-shopify-topic");

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

  // Validate HMAC if a webhook secret is stored
  if (settings.webhookSecret) {
    const valid = await validateHmac(rawBody, hmacHeader, settings.webhookSecret);
    if (!valid) {
      console.error("[shopify-webhook] Invalid HMAC for shop:", shopDomain);
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const ownerId       = settings.ownerId;
  const customerName  = order.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
    : null;
  const customerEmail = order.email || order.customer?.email || null;
  const paymentStatus = mapPaymentStatus(order.financial_status);
  const dueDate       = extractDueDate(order);
  const shopifyOrderId     = String(order.id);
  const shopifyOrderNumber = order.name; // e.g. "#1042"

  // Check for duplicate (idempotency — Shopify may retry)
  const existing = await db.query.cakeOrders.findFirst({
    where: eq(cakeOrders.shopifyOrderId, shopifyOrderId),
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Load all recipes for this owner so we can try name-matching line items
  const ownerRecipes = await db.query.recipes.findMany({
    where: eq(recipes.ownerId, ownerId),
    columns: { id: true, name: true },
  });

  const noteLines: string[] = [];
  if (order.note) noteLines.push(order.note);

  const ordersToInsert = order.line_items.map((item) => {
    // Case-insensitive name match
    const matched = ownerRecipes.find(
      (r) => r.name.toLowerCase() === item.title.toLowerCase()
    );
    if (!matched) {
      noteLines.push(`Unlinked item: ${item.title}${item.variant_title ? ` (${item.variant_title})` : ""}`);
    }
    return {
      ownerId,
      customerName,
      customerEmail,
      recipeId:           matched?.id ?? null,
      quantity:           String(item.quantity),
      dueDate,
      status:             "pending" as const,
      paymentStatus,
      shopifyOrderId,
      shopifyOrderNumber,
      notes: [
        matched ? null : `Product: ${item.title}${item.variant_title ? ` — ${item.variant_title}` : ""}`,
        order.note ?? null,
      ].filter(Boolean).join("\n") || null,
    };
  });

  if (ordersToInsert.length > 0) {
    await db.insert(cakeOrders).values(ordersToInsert);
  }

  console.log(`[shopify-webhook] Created ${ordersToInsert.length} order(s) from ${shopifyOrderNumber} (shop: ${shopDomain})`);

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
          resendApiKey:       emailCfg.resendApiKey,
        });
      } catch (err) {
        // Log but don't fail the webhook — order was already saved
        console.error("[shopify-webhook] Failed to send confirmation email:", err);
      }
    }
  }

  return NextResponse.json({ ok: true, created: ordersToInsert.length });
}
