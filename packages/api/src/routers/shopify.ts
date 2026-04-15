import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { shopifySettings, recipes, customers, customerSales } from "@bakery/db";

// ── Shopify Admin API helper ──────────────────────────────────────────────────

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

/** Normalize a user-entered store URL to the bare myshopify.com domain. */
function normaliseDomain(raw: string): string {
  let domain = raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, ""); // strip any path
  // If user typed just the store name (no dots), append .myshopify.com
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  return domain;
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
      tokenPreview:          maskToken(row.accessToken),
      lastCustomerImportAt:  row.lastCustomerImportAt,
      lastOrderImportAt:     row.lastOrderImportAt,
    };
  }),

  /**
   * Connect or re-connect a Shopify store.
   * Validates the credentials by fetching /shop.json before saving.
   */
  connect: protectedProcedure
    .input(z.object({
      shopDomain:   z.string().min(3, "Enter your Shopify store domain"),
      accessToken:  z.string().min(10, "Enter your Admin API access token"),
      syncProducts: z.boolean().default(true),
      syncOrders:   z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const domain = normaliseDomain(input.shopDomain);

      // Validate credentials against Shopify before saving
      const { shop } = await shopifyFetch<{
        shop: { name: string; email: string; myshopify_domain: string }
      }>(domain, input.accessToken, "/shop.json");

      const now = new Date();
      const existing = await ctx.db.query.shopifySettings.findFirst({
        where: eq(shopifySettings.ownerId, ctx.user.id),
        columns: { id: true },
      });

      if (existing) {
        await ctx.db.update(shopifySettings)
          .set({
            shopDomain:   domain,
            accessToken:  input.accessToken,
            shopName:     shop.name,
            shopEmail:    shop.email,
            isConnected:  true,
            syncProducts: input.syncProducts,
            syncOrders:   input.syncOrders,
            updatedAt:    now,
          })
          .where(eq(shopifySettings.ownerId, ctx.user.id));
      } else {
        await ctx.db.insert(shopifySettings).values({
          ownerId:      ctx.user.id,
          shopDomain:   domain,
          accessToken:  input.accessToken,
          shopName:     shop.name,
          shopEmail:    shop.email,
          isConnected:  true,
          syncProducts: input.syncProducts,
          syncOrders:   input.syncOrders,
        });
      }

      return { shopName: shop.name, shopEmail: shop.email, shopDomain: domain };
    }),

  /** Update sync preferences without re-entering credentials. */
  updatePreferences: protectedProcedure
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
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(shopifySettings)
      .where(eq(shopifySettings.ownerId, ctx.user.id));
    return { success: true };
  }),

  /**
   * Push active recipes to Shopify as products.
   * Creates new products — does not update or delete existing ones.
   * Returns counts of synced and skipped items.
   */
  syncRecipes: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");

    const ownerRecipes = await ctx.db.query.recipes.findMany({
      where: (r, { eq: eqFn, and }) => and(
        eqFn(r.ownerId, ctx.user.id),
        eqFn(r.isActive, true)
      ),
      with: { category: true },
    });

    let synced = 0;
    const errors: string[] = [];

    for (const recipe of ownerRecipes) {
      const descriptionParts = [
        recipe.description ?? "",
        recipe.instructions ? `Instructions:\n${recipe.instructions}` : "",
        recipe.notes ? `Notes:\n${recipe.notes}` : "",
      ].filter(Boolean);

      const bodyHtml = descriptionParts
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("\n");

      try {
        await shopifyFetch(settings.shopDomain, settings.accessToken, "/products.json", {
          method: "POST",
          body: JSON.stringify({
            product: {
              title:        recipe.name,
              body_html:    bodyHtml || `<p>${recipe.name}</p>`,
              product_type: recipe.category?.name ?? "Bakery",
              status:       "active",
              variants: [{
                title:             `${recipe.yieldAmount} ${recipe.yieldUnit}`,
                requires_shipping: true,
                taxable:           true,
                inventory_management: null,
              }],
            },
          }),
        });
        synced++;
      } catch (err) {
        errors.push(`${recipe.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    await ctx.db.update(shopifySettings)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, ctx.user.id));

    return { synced, total: ownerRecipes.length, errors };
  }),

  /**
   * Import Shopify customers into the local customers table.
   * Matches by email — skips customers that already exist.
   * New customers receive a generated loyalty card number.
   */
  importCustomers: protectedProcedure.mutation(async ({ ctx }) => {
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
      settings.accessToken,
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
   * Import Shopify orders into the local customer_sales table.
   * Fetches only orders created after the last import (incremental).
   * Links each sale to a customer by matching the order email.
   */
  importOrders: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await ctx.db.query.shopifySettings.findFirst({
      where: eq(shopifySettings.ownerId, ctx.user.id),
    });
    if (!settings?.isConnected) throw new Error("Shopify is not connected.");

    type ShopifyOrderLine = { title: string; quantity: number; price: string };
    type ShopifyOrder = {
      id: number;
      name: string;
      total_price: string;
      currency: string;
      created_at: string;
      financial_status: string;
      customer?: { email?: string; first_name?: string; last_name?: string };
      line_items: ShopifyOrderLine[];
    };

    // Fetch orders since the last import (or all if first run)
    const sinceParam = settings.lastOrderImportAt
      ? `&created_at_min=${settings.lastOrderImportAt.toISOString()}`
      : "";

    const { orders: shopifyOrders } = await shopifyFetch<{ orders: ShopifyOrder[] }>(
      settings.shopDomain,
      settings.accessToken,
      `/orders.json?status=any&limit=250${sinceParam}`
    );

    let imported = 0;
    const errors: string[] = [];

    for (const order of shopifyOrders) {
      try {
        // Try to link to a local customer by the order's email
        let customerId: string | null = null;
        const email = order.customer?.email?.toLowerCase().trim();
        if (email) {
          const match = await ctx.db.query.customers.findFirst({
            where: (c, { and, eq: eqFn, ilike }) =>
              and(eqFn(c.ownerId, ctx.user.id), ilike(c.email, email)),
            columns: { id: true },
          });
          customerId = match?.id ?? null;
        }

        const items = order.line_items.map((l) => `${l.quantity}× ${l.title}`).join(", ");

        await ctx.db.insert(customerSales).values({
          ownerId:   ctx.user.id,
          customerId,
          amount:    order.total_price,
          currency:  order.currency,
          items:     items || null,
          soldAt:    new Date(order.created_at),
        });
        imported++;
      } catch (err) {
        errors.push(
          `Order ${order.name}: ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    await ctx.db.update(shopifySettings)
      .set({ lastOrderImportAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifySettings.ownerId, ctx.user.id));

    return { imported, total: shopifyOrders.length, errors };
  }),

  /** Save the Shopify webhook signing secret for this store. */
  updateWebhookSecret: protectedProcedure
    .input(z.object({ webhookSecret: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(shopifySettings)
        .set({ webhookSecret: input.webhookSecret, updatedAt: new Date() })
        .where(eq(shopifySettings.ownerId, ctx.user.id));
      return { ok: true };
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
      settings.accessToken,
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
