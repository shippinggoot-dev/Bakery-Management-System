import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";

export const shopifySettings = pgTable("shopify_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Supabase auth.users(id) — one row per owner */
  ownerId: uuid("owner_id").notNull().unique(),
  /** e.g. "my-bakery.myshopify.com" */
  shopDomain: text("shop_domain").notNull(),
  /** Admin API access token — never returned to the client in full */
  accessToken: text("access_token").notNull(),
  /** Display name fetched from Shopify on connect */
  shopName: text("shop_name"),
  shopEmail: text("shop_email"),
  isConnected: boolean("is_connected").notNull().default(false),
  /** Whether to push recipes → Shopify products on sync */
  syncProducts: boolean("sync_products").notNull().default(true),
  /** Whether to pull Shopify orders → customer sales on sync */
  syncOrders: boolean("sync_orders").notNull().default(false),
  /** Webhook signing secret from Shopify — used to validate incoming payloads */
  webhookSecret:         text("webhook_secret"),
  /** Shopify location ID where inventory levels are tracked. Auto-detected
   *  on first inventory push, or set explicitly via settings UI for multi-
   *  location stores. Stored as text since Shopify uses 64-bit ints. */
  shopifyLocationId:     text("shopify_location_id"),
  lastSyncAt:            timestamp("last_sync_at"),
  lastCustomerImportAt:  timestamp("last_customer_import_at"),
  lastOrderImportAt:     timestamp("last_order_import_at"),
  lastInventorySyncAt:   timestamp("last_inventory_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ShopifySettings = typeof shopifySettings.$inferSelect;
export type NewShopifySettings = typeof shopifySettings.$inferInsert;
