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
 * Try to extract a date from a Shopify line-item title. Sucre's
 * Bakeskole and similar event-style products encode the date in the
 * title itself, e.g. `Bakeskole - August 2026 — 10-11. August (Safari)`.
 *
 * We look for Norwegian and English month names plus a day or
 * day-range. For ranges (`10-11. August`) we return the start day
 * (the day the customer's fulfillment commitment begins). Year is
 * read from a 4-digit number nearby if present, otherwise we fall
 * back to the year of `today`, advancing to next year if the month
 * has already passed (the event is in the future).
 */
const MONTHS: Record<string, number> = {
  // Norwegian bokmål
  januar:    1, februar: 2, mars:    3, april:    4, mai:      5, juni:     6,
  juli:      7, august:  8, september: 9, oktober: 10, november: 11, desember: 12,
  // English (we may see English titles too)
  january:   1, february: 2, march:   3,           may:      5, june:     6,
  july:      7,                       october: 10,            december: 12,
  // Short forms / common
  jan:       1, feb:     2, mar:     3, apr:     4,           jun:      6,
  jul:       7, aug:     8, sep:     9, okt:    10, nov:     11, des:    12, dec: 12,
};

export function extractDateFromTitle(title: string, today: Date = new Date()): string | null {
  if (!title) return null;
  const lower = title.toLowerCase();

  // Match "<day>[-<day>]. <month>[ <year>]" or "<day>. <month>[ <year>]".
  // Examples: "10-11. august", "10. august 2026", "3-4. august"
  const m = lower.match(/(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\.\s*([a-zæøå]+)\.?(?:\s+(\d{4}))?/);
  if (!m) return null;

  const day   = parseInt(m[1]!, 10);
  const monthName = m[2]!;
  const month = MONTHS[monthName];
  if (!month) return null;

  let year: number;
  if (m[3]) {
    year = parseInt(m[3], 10);
  } else {
    // No year in the title — look elsewhere in the title for one,
    // otherwise infer (current year if month hasn't passed, else next).
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1]!, 10);
    } else {
      year = today.getFullYear();
      const thisMonth = today.getMonth() + 1;
      const thisDay   = today.getDate();
      if (month < thisMonth || (month === thisMonth && day < thisDay)) {
        year++;
      }
    }
  }

  // Sanity: day in range for month? Use Date to check rollover.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * One cake_orders row, ready to insert. Shape matches the Drizzle
 * insert spec for the table (ownerId is added by the caller).
 *
 * Linkage rule (Phase 2): a row carries EITHER `recipeId` OR
 * `premadeCakeVariantId`, never both. Both null = unlinked. Callers
 * that auto-plan production schedules dereference variant rows to the
 * parent cake's recipe at scheduling time.
 */
export interface MappedCakeOrderRow {
  customerName:         string | null;
  customerEmail:        string | null;
  recipeId:             string | null;
  /** Phase 2 — set when the Shopify variant_title matched a known
   *  premade_cake_variants row. Mutually exclusive with recipeId. */
  premadeCakeVariantId: string | null;
  quantity:             string;
  dueDate:              string | null;
  status:               "pending";
  paymentStatus:        PaymentStatus;
  shopifyOrderId:       string;
  shopifyOrderNumber:   string;
  /** Original Shopify line-item title — preserved so we can find every
   *  pending order produced by the same Shopify product when the user
   *  creates a recipe for it later. */
  shopifyLineItemTitle: string;
  /** Original Shopify variant_title preserved verbatim (or null for
   *  simple products with no variants). */
  shopifyVariantTitle:  string | null;
  salePrice:            string | null;
  notes:                string | null;
}

export interface MappingResult {
  rows:       MappedCakeOrderRow[];
  /** True when every line item resolved to a recipe — caller may auto-plan. */
  allMatched: boolean;
}

/**
 * Build the lowercase match key used to look up a Shopify line item in
 * the premade_cake_variants table. Mirrored when seeding
 * `premade_cake_variants.shopify_match_title` so writers and readers
 * cannot drift. Format: `"<line_item_title> — <variant_title>"`,
 * lowercased and trimmed.
 *
 * Callers only invoke this when `variant_title` is set — for simple
 * products with no variant, recipe-title lookup handles matching.
 */
export function buildVariantMatchKey(title: string, variantTitle: string): string {
  return `${title} — ${variantTitle}`.toLowerCase().trim();
}

/**
 * Convert a Shopify order into one or more cake_orders rows: one per
 * line item, with recipe/variant-name matching and due-date extraction.
 *
 * Matching order per line item (Phase 2):
 *   1. If `variant_title` is set AND the variant lookup contains
 *      `buildVariantMatchKey(title, variant_title)`, link to that
 *      premade_cake_variants row.
 *   2. Otherwise, fall back to the recipe lookup on lowercase `title`.
 *      The recipe lookup map should include BOTH `recipe.name` and
 *      every entry from `recipe.shopify_titles` (lowercased).
 *   3. Otherwise, leave the row unlinked.
 *
 * Variant match preferred but recipe fallback still applies. This is
 * intentional: Phase 1 setups using `recipes.shopify_titles[]` keep
 * working until the user creates premade cake variants. Once variants
 * exist for a product, they take precedence (variant_title gates the
 * variant-lookup branch).
 *
 * The optional `ignoredTitlesLower` set lets the caller skip Shopify
 * line items whose title is on the per-workspace ignore list. Skipped
 * line items don't appear in the output rows at all. If every line
 * item on an order is skipped, the result is an empty rows array and
 * `allMatched: false` — caller should handle the "nothing to insert"
 * case explicitly.
 *
 * `allMatched` is true iff every row resolved to either a recipe or a
 * variant. Auto-plan callers should also verify variant rows have a
 * dereferenced recipe before creating production schedules.
 */
export function mapShopifyOrderToCakeOrderRows(
  order: ShopifyOrderForMapping,
  recipesByLowerTitle: ReadonlyMap<string, string>,
  ignoredTitlesLower: ReadonlySet<string> = new Set(),
  variantsByMatchKey: ReadonlyMap<string, string> = new Map(),
): MappingResult {
  const customerName = order.customer
    ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || null
    : null;
  const customerEmail = (order.email || order.customer?.email || null)?.trim() || null;
  const paymentStatus = mapPaymentStatus(order.financial_status);
  // Order-level due date (from note_attributes / order note). May still
  // be null — line-item titles are checked per-row below.
  const orderLevelDueDate = extractDueDate(order);
  const shopifyOrderId     = String(order.id);
  const shopifyOrderNumber = order.name;

  const rows: MappedCakeOrderRow[] = order.line_items
    .filter((item) => !ignoredTitlesLower.has(item.title.toLowerCase()))
    .map((item) => {
    // Variant match takes precedence — only attempted when the line item
    // has a Shopify variant_title (simple products skip straight to the
    // recipe-name fallback).
    const variantId = item.variant_title
      ? variantsByMatchKey.get(buildVariantMatchKey(item.title, item.variant_title)) ?? null
      : null;
    const recipeId = variantId
      ? null
      : recipesByLowerTitle.get(item.title.toLowerCase()) ?? null;
    const matched = variantId !== null || recipeId !== null;
    // Per-unit price as Shopify provides it. The dashboard revenue
    // calculation is SUM(salePrice × quantity), so storing the unit
    // price here gives the correct total without further work.
    const unitPrice = item.price && /^\d+(\.\d+)?$/.test(item.price) ? item.price : null;
    // Per-line due date: order level wins; otherwise scan BOTH the line
    // item title and its variant_title. Sucre's class-style products put
    // the date in the variant ("Bakeskole - August 2026" + variant
    // "10-11. August (Safari)") — without the variant we'd miss it.
    const titleForDate = item.variant_title
      ? `${item.title} ${item.variant_title}`
      : item.title;
    const dueDate = orderLevelDueDate ?? extractDateFromTitle(titleForDate);
    return {
      customerName,
      customerEmail,
      recipeId,
      premadeCakeVariantId: variantId,
      quantity:           String(item.quantity),
      dueDate,
      status:             "pending",
      paymentStatus,
      shopifyOrderId,
      shopifyOrderNumber,
      // Keep just item.title here (NOT title + variant) so that the
      // legacy recipe-side "auto-link siblings" feature still works on
      // the base product. The variant is captured separately in
      // shopifyVariantTitle for the Phase 2 variant matcher.
      shopifyLineItemTitle: item.title,
      shopifyVariantTitle:  item.variant_title ?? null,
      salePrice:          unitPrice,
      notes: [
        matched ? null : `Product: ${item.title}${item.variant_title ? ` — ${item.variant_title}` : ""}`,
        order.note ?? null,
      ].filter(Boolean).join("\n") || null,
    };
  });

  const allMatched = rows.length > 0 && rows.every((r) => r.recipeId !== null || r.premadeCakeVariantId !== null);
  return { rows, allMatched };
}

/**
 * Build the lookup map the mapper expects from a set of recipes loaded
 * from the database. Each recipe contributes its name (lowercased) plus
 * every entry in `shopifyTitles` (lowercased). Later inserts win on
 * collision, but the practical result is "if any recipe answers to
 * this title, return it."
 */
export function buildRecipeTitleLookup(
  recipes: ReadonlyArray<{ id: string; name: string; shopifyTitles: string[] | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of recipes) {
    map.set(r.name.toLowerCase(), r.id);
    for (const t of r.shopifyTitles ?? []) {
      if (t) map.set(t.toLowerCase(), r.id);
    }
  }
  return map;
}

/**
 * Build the variant lookup map the mapper expects from a set of
 * premade_cake_variants rows. Variants without a `shopifyMatchTitle`
 * (e.g. created in the UI but not yet linked to Shopify) are skipped —
 * they have nothing to match against and would just clutter the map.
 *
 * The match-key construction is delegated to `buildVariantMatchKey`,
 * so writers (the planner UI when creating a variant) and readers
 * (this mapper) cannot drift on case / trim / separator.
 */
export function buildVariantTitleLookup(
  variants: ReadonlyArray<{ id: string; shopifyMatchTitle: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of variants) {
    if (!v.shopifyMatchTitle) continue;
    map.set(v.shopifyMatchTitle.toLowerCase().trim(), v.id);
  }
  return map;
}
