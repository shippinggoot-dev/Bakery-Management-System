import { type NextRequest, NextResponse } from "next/server";
import { db, shopifySettings } from "@bakery/db";
import { eq } from "drizzle-orm";
import {
  getShopifyOAuthConfig,
  isValidShopDomain,
  verifyOAuthHmac,
  verifyState,
  OAUTH_STATE_COOKIE,
} from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

function fail(origin: string, code: string) {
  return NextResponse.redirect(
    `${origin}/settings?shopify_error=${encodeURIComponent(code)}`,
    { status: 303 },
  );
}

/**
 * Shopify OAuth callback. Reached after the merchant approves the install
 * on Shopify's side. Shopify appends `?code=&hmac=&shop=&state=&timestamp=`.
 *
 * Order of checks (each one is a potential attack vector if skipped):
 *   1. Shop domain is a real myshopify.com domain.
 *   2. HMAC of the query string matches (proves Shopify signed it).
 *   3. Our signed state cookie is present, valid, and matches the nonce.
 *   4. The shop in the state cookie matches the shop in the URL.
 *   5. Then — and only then — exchange the code for an access token.
 */
export async function GET(req: NextRequest) {
  const url    = new URL(req.url);
  const origin = url.origin;
  const params = url.searchParams;

  const code  = params.get("code");
  const shop  = params.get("shop") ?? "";
  const state = params.get("state");

  if (!code || !shop || !state) {
    return fail(origin, "missing_params");
  }
  if (!isValidShopDomain(shop)) {
    return fail(origin, "invalid_shop_domain");
  }

  let cfg;
  try {
    cfg = getShopifyOAuthConfig();
  } catch {
    return fail(origin, "oauth_not_configured");
  }

  // 1. HMAC of the query params
  if (!verifyOAuthHmac(params, cfg.apiSecret)) {
    return fail(origin, "hmac_mismatch");
  }

  // 2. State cookie
  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!stateCookie) return fail(origin, "missing_state_cookie");
  const payload = verifyState(stateCookie, cfg.cookieSecret);
  if (!payload) return fail(origin, "invalid_state_cookie");
  if (payload.nonce !== state) return fail(origin, "state_mismatch");
  if (payload.shopDomain !== shop) return fail(origin, "shop_mismatch");

  // 3. Exchange the code for an access token
  let tokenJson: { access_token?: string; scope?: string; error?: string };
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client_id:     cfg.apiKey,
        client_secret: cfg.apiSecret,
        code,
      }),
    });
    tokenJson = await tokenRes.json() as typeof tokenJson;
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("[shopify-oauth] Token exchange failed:", tokenRes.status, tokenJson);
      return fail(origin, "token_exchange_failed");
    }
  } catch (err) {
    console.error("[shopify-oauth] Token exchange threw:", err);
    return fail(origin, "token_exchange_failed");
  }
  const accessToken = tokenJson.access_token;

  // 4. Sanity-check the token by hitting /shop.json — also gives us the
  //    shop's display name and contact email to show in the UI.
  let shopName  : string | null = null;
  let shopEmail : string | null = null;
  try {
    const shopRes = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
      headers: {
        "Content-Type":            "application/json",
        "X-Shopify-Access-Token":  accessToken,
      },
    });
    if (shopRes.ok) {
      const data = await shopRes.json() as { shop?: { name?: string; email?: string } };
      shopName  = data.shop?.name  ?? null;
      shopEmail = data.shop?.email ?? null;
    }
  } catch {
    // Non-fatal — we still got a token. Leave shopName/email null.
  }

  // 5. Persist (upsert by ownerId — one Shopify connection per bakery)
  const ownerId = payload.ownerId;
  const existing = await db.query.shopifySettings.findFirst({
    where: eq(shopifySettings.ownerId, ownerId),
    columns: { id: true },
  });

  if (existing) {
    await db.update(shopifySettings)
      .set({
        shopDomain:   shop,
        accessToken,
        shopName,
        shopEmail,
        isConnected:  true,
        updatedAt:    new Date(),
      })
      .where(eq(shopifySettings.ownerId, ownerId));
  } else {
    await db.insert(shopifySettings).values({
      ownerId,
      shopDomain:   shop,
      accessToken,
      shopName,
      shopEmail,
      isConnected:  true,
      syncProducts: true,
      syncOrders:   false,
    });
  }

  // 6. Clear the state cookie, redirect back to settings with a success flag
  const res = NextResponse.redirect(`${origin}/settings?shopify=connected`, { status: 303 });
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
