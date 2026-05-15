import { type NextRequest, NextResponse } from "next/server";
import { db, shopifySettings, customers } from "@bakery/db";
import { eq, and, ilike } from "drizzle-orm";
import { getShopifyOAuthConfig, verifyWebhookHmac } from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

/**
 * GDPR mandatory webhook: customers/data_request.
 *
 * Sent by Shopify when an EU merchant's customer invokes their right of
 * access. The merchant has 30 days to produce the customer's data; this
 * endpoint just records the request — Tim handles fulfilment manually
 * (small-business product, low volume, no automated export pipeline yet).
 */
export async function POST(req: NextRequest) {
  const rawBody    = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain");

  let cfg;
  try {
    cfg = getShopifyOAuthConfig();
  } catch {
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, cfg.apiSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  type Payload = {
    shop_domain: string;
    customer: { id: number; email?: string; phone?: string };
    orders_requested?: number[];
  };
  let payload: Payload;
  try { payload = JSON.parse(rawBody) as Payload; }
  catch { return new NextResponse("Bad JSON", { status: 400 }); }

  // Look up which bakery owner this shop belongs to, so a human follow-up
  // knows who needs to fulfil the request.
  const settings = shopDomain
    ? await db.query.shopifySettings.findFirst({
        where: eq(shopifySettings.shopDomain, shopDomain),
        columns: { ownerId: true },
      })
    : null;

  // Best-effort: pull the customer's current data from our DB so Tim can
  // forward it to the merchant. We don't expose it here; we only log
  // that the request happened.
  let foundLocalRows = 0;
  if (settings && payload.customer.email) {
    const found = await db.query.customers.findMany({
      where: and(
        eq(customers.ownerId, settings.ownerId),
        ilike(customers.email, payload.customer.email.toLowerCase()),
      ),
      columns: { id: true },
    });
    foundLocalRows = found.length;
  }

  console.log("[shopify-gdpr] customers/data_request", {
    shop_domain: shopDomain,
    customer_id: payload.customer.id,
    email:       payload.customer.email ?? null,
    owner_id:    settings?.ownerId ?? null,
    local_rows:  foundLocalRows,
  });

  return NextResponse.json({ ok: true });
}
