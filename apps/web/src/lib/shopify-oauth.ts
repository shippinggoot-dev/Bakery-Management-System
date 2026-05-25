import crypto from "crypto";

// ── Scopes ────────────────────────────────────────────────────────────────────

/**
 * Single source of truth for the Shopify scopes we request at install time.
 * Keep this in sync with the scope list configured in the Shopify Dev
 * Dashboard app version — if the two drift, installs will fail with
 * a scope-mismatch error.
 */
export const SHOPIFY_SCOPES = [
  "read_products",
  "write_products",
  "read_orders",
  "read_customers",
  "read_locations",
  "write_inventory",
] as const;

export const SHOPIFY_SCOPE_STRING = SHOPIFY_SCOPES.join(",");

// ── Env / config ──────────────────────────────────────────────────────────────

/**
 * Read OAuth credentials from env. Centralised so a missing var fails fast
 * with a clear message rather than producing a cryptic Shopify error.
 */
export function getShopifyOAuthConfig() {
  const apiKey       = process.env.SHOPIFY_API_KEY;
  const apiSecret    = process.env.SHOPIFY_API_SECRET;
  const appUrl       = process.env.SHOPIFY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const cookieSecret = process.env.SHOPIFY_OAUTH_COOKIE_SECRET ?? apiSecret;

  if (!apiKey || !apiSecret || !appUrl) {
    throw new Error(
      "Shopify OAuth not configured. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, " +
      "and SHOPIFY_APP_URL in environment variables.",
    );
  }
  return { apiKey, apiSecret, appUrl, cookieSecret: cookieSecret! };
}

// ── Domain validation ────────────────────────────────────────────────────────

const MYSHOPIFY_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Validate a shop domain string. Shopify's `shop` parameter must always be
 * a .myshopify.com domain — never trust raw user input here, since the value
 * gets embedded in a redirect target.
 */
export function isValidShopDomain(shop: string): boolean {
  return MYSHOPIFY_RE.test(shop.toLowerCase());
}

/**
 * Normalise common user inputs to a bare myshopify.com domain.
 * Accepts "my-bakery", "my-bakery.myshopify.com", or admin URLs.
 */
export function normaliseShopDomain(raw: string): string | null {
  let domain = raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!domain) return null;
  if (!domain.includes(".")) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(domain)) return null;
    domain = `${domain}.myshopify.com`;
  }
  return isValidShopDomain(domain) ? domain : null;
}

// ── HMAC signatures ───────────────────────────────────────────────────────────

/**
 * Build the exact message Shopify signs for an OAuth callback HMAC.
 *
 * Shopify's algorithm: drop the `hmac` and `signature` params, sort the rest
 * by key, and join them as `key=value` with `&` — but the values stay
 * *URL-encoded*, exactly as they arrived in the query string.
 *
 * The trap: `URLSearchParams.entries()` hands back *decoded* values. Feeding
 * the sorted pairs back through `new URLSearchParams(...).toString()`
 * re-applies the same `application/x-www-form-urlencoded` encoding Shopify
 * used. This matters for the `host` param — it is base64 and contains `/`,
 * `+` and `=`, which differ between the encoded and decoded forms, so signing
 * the decoded form makes the HMAC silently never match. The classic params
 * (code/shop/state/timestamp) are URL-safe, which is what made this look like
 * an API-secret problem. This mirrors how Shopify's own @shopify/shopify-api
 * library builds the message.
 */
function buildOAuthSigningMessage(params: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push([key, value]);
  }
  // Sort by key in code-point order (matches Shopify; param keys are all ASCII).
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(pairs).toString();
}

/**
 * Verify the `hmac` query-string param Shopify appends to OAuth callbacks.
 * HMAC-SHA256 of the signing message (see {@link buildOAuthSigningMessage})
 * with the app's API secret, hex-encoded, compared in constant time.
 */
export function verifyOAuthHmac(
  params: URLSearchParams,
  apiSecret: string,
): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const message = buildOAuthSigningMessage(params);

  const expected = crypto
    .createHmac("sha256", apiSecret)
    .update(message, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hmac, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify the `X-Shopify-Hmac-SHA256` header on webhook deliveries.
 * Webhooks use a *different* signature scheme than OAuth callbacks:
 * HMAC of the raw request body, base64-encoded.
 */
export function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  apiSecret: string,
): boolean {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Signed state cookie ───────────────────────────────────────────────────────

/**
 * State carried across the OAuth round-trip. We sign-and-encode this and
 * store it in an HttpOnly cookie so the callback can verify the request
 * originated from our own /start endpoint (CSRF protection) and so we
 * know which Supabase user to associate the resulting token with.
 *
 * `nonce` is also sent to Shopify as the `state` query param; the callback
 * compares the two values to confirm they match.
 */
export interface OAuthStatePayload {
  nonce:      string;
  ownerId:    string;
  shopDomain: string;
  /** Unix ms — state cookies older than 15 minutes are rejected. */
  issuedAt:   number;
}

const STATE_TTL_MS = 15 * 60 * 1000;

export function signState(payload: OAuthStatePayload, secret: string): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(
  signed: string,
  secret: string,
): OAuthStatePayload | null {
  const parts = signed.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null;
  return payload;
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ── Cookie name ───────────────────────────────────────────────────────────────

export const OAUTH_STATE_COOKIE = "shopify_oauth_state";
