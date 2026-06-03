/**
 * Pure mapping from a Shopify order payload to the cake_orders rows we
 * persist. Used by both:
 *   - the real-time webhook (apps/web/src/app/api/webhooks/shopify/route.ts)
 *   - the bulk import (packages/api/src/routers/shopify.ts importOrders)
 *
 * Keeping the mapping in one place means both flows produce identical
 * dashboard-visible orders. No database calls in here — callers do their
 * own inserts and side effects (production schedules, email).
 */

export type PaymentStatus = "pending" | "paid" | "unpaid" | "refunded";

export interface ShopifyLineItem {
  id:            number;
  title:         string;
  quantity:      number;
  variant_title: string | null;
  /** Per-unit price as a string, Shopify's convention. */
  price:         string;
}

export interface ShopifyNoteAttribute {
  name:  string;
  value: string;
}

/**
 * The subset of a Shopify order payload we depend on. Both the webhook
 * and bulk-import flows pass something compatible with this shape.
 */
export interface ShopifyOrderForMapping {
  id:               number;
  name:             string;
  email?:           string;
  financial_status: string;
  line_items:       ShopifyLineItem[];
  note:             string | null;
  note_attributes?: ShopifyNoteAttribute[];
  customer:         {
    first_name?: string;
    last_name?:  string;
    email?:      string;
  } | null;
}

/** Map Shopify financial_status → our paymentStatus enum. */
export function mapPaymentStatus(status: string): PaymentStatus {
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
 * Try to extract a delivery / due date from the order. Bakery orders
 * often put the date in a Shopify note_attribute, or free-typed in
 * the order note in YYYY-MM-DD or DD/MM/YYYY form.
 *
 * IMPORTANT — DD/MM/YYYY is parsed BEFORE delegating to `new Date()`.
 * `new Date("02/06/2026")` returns Feb 6 in US locale and June 2 in EU
 * locale; this code runs on a Vercel Node runtime whose locale we don't
 * control, so we cannot trust it for slash-separated values. Norwegian
 * Shopify stores commonly send DD/MM/YYYY in note_attributes, and a
 * locale-flip would book the order on the wrong day.
 */
function parseLooseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. ISO date — parse first.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // 2. DD/MM/YYYY or DD-MM-YYYY (Norwegian / European convention).
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // 3. Last resort: let JS try (covers RFC-style "Wed, 4 Jul 2026" etc).
  //    Skipped above for slash-separated values precisely to avoid
  //    locale-dependent DD/MM vs MM/DD interpretation.
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10);

  return null;
}

export function extractDueDate(order: Pick<ShopifyOrderForMapping, "note" | "note_attributes">): string | null {
  const keywords = ["delivery_date", "pickup_date", "due_date", "collection_date", "date"];
  for (const attr of order.note_attributes ?? []) {
    if (keywords.some((k) => attr.name.toLowerCase().includes(k))) {
      const parsed = parseLooseDate(attr.value);
      if (parsed) return parsed;
      return attr.value; // keep raw if unparseable so the user can see what came in
    }
  }
  if (order.note) {
    // Search the free-text note for embedded ISO or DMY patterns.
    const isoMatch = order.note.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const dmyMatch = order.note.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]!.padStart(2, "0")}-${dmyMatch[1]!.padStart(2, "0")}`;
  }
  return null;
}

/**
 * One cake_orders row, ready to insert. Shape matches the Drizzle
 * insert spec for the table (ownerId is added by the caller).
 */
export interface MappedCakeOrderRow {
  customerName:       string | null;
  customerEmail:      string | null;
  recipeId:           string | null;
  quantity:           string;
  dueDate:            string | null;
  status:             "pending";
  paymentStatus:      PaymentStatus;
  shopifyOrderId:     string;
  shopifyOrderNumber: string;
  salePrice:          string | null;
  notes:              string | null;
}

export interface MappingResult {
  rows:       MappedCakeOrderRow[];
  /** True when every line item resolved to a recipe — caller may auto-plan. */
  allMatched: boolean;
}

/**
 * Convert a Shopify order into one or more cake_orders rows: one per
 * line item, with recipe-name matching and due-date extraction.
 *
 * Caller passes a lowercase-name → recipe-id map so the recipe lookup
 * is O(1) per line item rather than O(N) per call.
 */
export function mapShopifyOrderToCakeOrderRows(
  order: ShopifyOrderForMapping,
  recipesByLowerName: ReadonlyMap<string, string>,
): MappingResult {
  const customerName = order.customer
    ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || null
    : null;
  const customerEmail = (order.email || order.customer?.email || null)?.trim() || null;
  const paymentStatus = mapPaymentStatus(order.financial_status);
  const dueDate       = extractDueDate(order);
  const shopifyOrderId     = String(order.id);
  const shopifyOrderNumber = order.name;

  const rows: MappedCakeOrderRow[] = order.line_items.map((item) => {
    const recipeId = recipesByLowerName.get(item.title.toLowerCase()) ?? null;
    // Per-unit price as Shopify provides it. The dashboard revenue
    // calculation is SUM(salePrice × quantity), so storing the unit
    // price here gives the correct total without further work.
    const unitPrice = item.price && /^\d+(\.\d+)?$/.test(item.price) ? item.price : null;
    return {
      customerName,
      customerEmail,
      recipeId,
      quantity:           String(item.quantity),
      dueDate,
      status:             "pending",
      paymentStatus,
      shopifyOrderId,
      shopifyOrderNumber,
      salePrice:          unitPrice,
      notes: [
        recipeId ? null : `Product: ${item.title}${item.variant_title ? ` — ${item.variant_title}` : ""}`,
        order.note ?? null,
      ].filter(Boolean).join("\n") || null,
    };
  });

  const allMatched = rows.length > 0 && rows.every((r) => r.recipeId !== null);
  return { rows, allMatched };
}
