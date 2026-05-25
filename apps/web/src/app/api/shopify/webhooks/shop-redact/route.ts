import { type NextRequest, NextResponse } from "next/server";
import { db, shopifySettings } from "@bakery/db";
import { eq } from "drizzle-orm";
import { getShopifyOAuthConfig, verifyWebhookHmac } from "@/lib/shopify-oauth";
import { checkRateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GDPR mandatory webhook: shop/redact.
 *
 * Sent 48 hours after the merchant uninstalls the app. We must purge any
 * data associated with that shop — for us that means removing the
 * shopifySettings row (which contains the access token, webhook secret,
 * and shop metadata). Customer/order/recipe data is the bakery owner's
 * own business data, not Shopify's, so it stays.
 */
export async function POST(req: NextRequest) {
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const rlKey = shopDomain ?? `ip:${getClientIp(req)}`;
  const rl = await checkRateLimit("shopify-webhook", rlKey, 30, "1 m");
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds!);

  const rawBody    = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  let cfg;
  try {
    cfg = getShopifyOAuthConfig();
  } catch {
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, cfg.apiSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  type Payload = { shop_id: number; shop_domain: string };
  let payload: Payload;
  try { payload = JSON.parse(rawBody) as Payload; }
  catch { return new NextResponse("Bad JSON", { status: 400 }); }

  // Prefer the header for lookup — body is also signed but header is the
  // canonical source for routing.
  const lookupDomain = shopDomain ?? payload.shop_domain;

  let purged = 0;
  if (lookupDomain) {
    const result = await db.delete(shopifySettings)
      .where(eq(shopifySettings.shopDomain, lookupDomain))
      .returning({ id: shopifySettings.id });
    purged = result.length;
  }

  console.log("[shopify-gdpr] shop/redact", {
    shop_domain: lookupDomain,
    purged_settings_rows: purged,
  });

  return NextResponse.json({ ok: true, purged });
}
