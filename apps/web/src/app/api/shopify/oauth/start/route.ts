import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  generateNonce,
  getShopifyOAuthConfig,
  normaliseShopDomain,
  signState,
  SHOPIFY_SCOPE_STRING,
  OAUTH_STATE_COOKIE,
} from "@/lib/shopify-oauth";
import { checkRateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Initiates the Shopify OAuth flow. The user lands here after clicking
 * "Connect with Shopify" on the Settings page. We:
 *   1. Confirm the user is authenticated with us (Supabase).
 *   2. Validate the shop domain they entered.
 *   3. Generate a signed state cookie binding (nonce, ownerId, shop).
 *   4. Redirect the browser to Shopify's authorize URL.
 *
 * The matching `nonce` is sent as Shopify's `state` query param; the
 * callback verifies they match to prevent CSRF.
 */
export async function GET(req: NextRequest) {
  const rl = await checkRateLimit("oauth-start", getClientIp(req), 10, "1 m");
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds!);

  const { searchParams, origin } = new URL(req.url);
  const rawShop = searchParams.get("shop") ?? "";

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const shop = normaliseShopDomain(rawShop);
  if (!shop) {
    return NextResponse.redirect(
      `${origin}/settings?shopify_error=${encodeURIComponent("invalid_shop_domain")}`,
    );
  }

  let cfg;
  try {
    cfg = getShopifyOAuthConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shopify OAuth not configured.";
    return NextResponse.redirect(
      `${origin}/settings?shopify_error=${encodeURIComponent(msg)}`,
    );
  }

  const nonce = generateNonce();
  const state = signState(
    { nonce, ownerId: user.id, shopDomain: shop, issuedAt: Date.now() },
    cfg.cookieSecret,
  );

  const redirectUri = `${cfg.appUrl.replace(/\/+$/, "")}/api/shopify/oauth/callback`;
  const authorizeUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id",    cfg.apiKey);
  authorizeUrl.searchParams.set("scope",        SHOPIFY_SCOPE_STRING);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state",        nonce);
  // Requesting an *offline* access token (the default if grant_options is
  // omitted) — long-lived, suitable for server-to-server background syncs.

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   15 * 60, // matches the state TTL in shopify-oauth.ts
  });
  return res;
}
