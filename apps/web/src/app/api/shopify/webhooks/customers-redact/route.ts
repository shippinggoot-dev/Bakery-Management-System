import { type NextRequest, NextResponse } from "next/server";
import { db, shopifySettings, customers, customerSales } from "@bakery/db";
import { eq, and, ilike } from "drizzle-orm";
import { getShopifyOAuthConfig, verifyWebhookHmac } from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

/**
 * GDPR mandatory webhook: customers/redact.
 *
 * Sent 10 days after a customer's account has been deleted from Shopify
 * (or earlier on explicit erasure request). We must delete or anonymise
 * their personal data within 30 days.
 *
 * Our approach: match by email within the bakery owner's customer list
 * and hard-delete the row. Linked customer_sales rows have `customerId`
 * set to NULL via the FK (or, if cascading is configured, are removed
 * along with the customer); financial records themselves stay for the
 * bakery's accounting needs but are no longer linked to an identified
 * individual.
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
  };
  let payload: Payload;
  try { payload = JSON.parse(rawBody) as Payload; }
  catch { return new NextResponse("Bad JSON", { status: 400 }); }

  const settings = shopDomain
    ? await db.query.shopifySettings.findFirst({
        where: eq(shopifySettings.shopDomain, shopDomain),
        columns: { ownerId: true },
      })
    : null;

  let deleted = 0;
  if (settings && payload.customer.email) {
    const email = payload.customer.email.toLowerCase();

    // Unlink any sales referencing this customer so the foreign key doesn't
    // block deletion. We keep the sale record itself (anonymised) for the
    // bakery's bookkeeping.
    const toErase = await db.query.customers.findMany({
      where: and(
        eq(customers.ownerId, settings.ownerId),
        ilike(customers.email, email),
      ),
      columns: { id: true },
    });

    for (const c of toErase) {
      await db.update(customerSales)
        .set({ customerId: null })
        .where(eq(customerSales.customerId, c.id));
    }

    const result = await db.delete(customers)
      .where(and(
        eq(customers.ownerId, settings.ownerId),
        ilike(customers.email, email),
      ))
      .returning({ id: customers.id });
    deleted = result.length;
  }

  console.log("[shopify-gdpr] customers/redact", {
    shop_domain: shopDomain,
    customer_id: payload.customer.id,
    deleted_local_rows: deleted,
  });

  return NextResponse.json({ ok: true, deleted });
}
