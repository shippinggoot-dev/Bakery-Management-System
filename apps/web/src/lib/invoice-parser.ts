/**
 * Client-side invoice text parser.
 *
 * The user opens their supplier invoice in any PDF viewer, selects all text
 * (Ctrl+A), copies it (Ctrl+C), and pastes it into the textarea.
 * This script then extracts product lines with names, prices, and units.
 *
 * No API calls — runs entirely in the browser.
 * Works with Norwegian and English invoice formats.
 */

export interface InvoiceLineItem {
  rawName: string;
  rawPrice: string | null;
  rawUnit: string | null;
  rawQuantity: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNITS = [
  "kg", "g", "gram", "liter", "litre", "l", "dl", "ml",
  "stk", "pcs", "pc", "piece", "pieces", "pose", "pk", "pakke",
  "krt", "kartong", "boks", "flaske", "fl", "bag", "bags",
  "lb", "oz", "tbsp", "tsp",
];

// Lines containing only these words are headers/footers — skip them
const SKIP_PATTERNS = [
  /^\s*$/,                                           // blank
  /^\s*(produkt|product|vare|item|beskrivelse|description)\s*$/i,
  /^\s*(pris|price|enhet|unit|mengde|qty|quantity|antall|total|sum|mva|vat|inkl|ekskl)\s*$/i,
  /^\s*(faktura|invoice|ordre|order|levering|delivery|dato|date)\b/i,
  /^\s*side\s+\d+/i,                                 // "side 2", "page 2"
  /^\s*\d+\s*$/,                                     // bare page numbers
  /^\s*(subtotal|sub-total|total|sum|avgift|frakt|shipping|mva)\b/i,
  /^[-=_*#]{3,}\s*$/,                                // divider lines
];

// ── Price extraction ──────────────────────────────────────────────────────────

/**
 * Finds the rightmost price-like number on a line.
 * Handles:
 *   - European format: 1.234,56  → 1234.56
 *   - Decimal format:  1234.56
 *   - Simple integer:  45
 * Returns { value: "45.50", index: <position in line> } or null.
 */
function extractPrice(line: string): { value: string; index: number; length: number } | null {
  // Match prices: optional thousands sep, decimal part
  // European: 1.234,56 or 1 234,56 or 45,50
  // English:  1,234.56 or 1 234.56 or 45.50
  const priceRe =
    /\b(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{3,})\s*(?:kr|nok|,-|,-)?/gi;

  let best: { value: string; index: number; length: number } | null = null;
  let m: RegExpExecArray | null;

  while ((m = priceRe.exec(line)) !== null) {
    const raw = m[1]!;
    // Normalise to decimal: if it looks like European (comma decimal) convert
    let normalised = raw.replace(/\s/g, "");

    // Detect format: if last separator is comma and there are 2 decimal digits → European
    const lastComma = normalised.lastIndexOf(",");
    const lastDot   = normalised.lastIndexOf(".");

    if (lastComma > lastDot && normalised.length - lastComma === 3) {
      // European decimal: 1.234,56 → 1234.56
      normalised = normalised.replace(/\./g, "").replace(",", ".");
    } else if (lastDot > lastComma && normalised.length - lastDot === 3) {
      // English decimal: 1,234.56 → 1234.56
      normalised = normalised.replace(/,/g, "");
    } else {
      // Simple number, possibly with comma as decimal: 45,50 → 45.50
      normalised = normalised.replace(",", ".");
    }

    const num = parseFloat(normalised);
    if (!isNaN(num) && num > 0) {
      // Prefer the last (rightmost) valid price on the line
      best = { value: num.toFixed(2), index: m.index, length: m[0].length };
    }
  }

  return best;
}

// ── Unit / quantity extraction ────────────────────────────────────────────────

const UNIT_RE = new RegExp(
  `\\b(\\d+(?:[.,]\\d+)?\\s*(?:${UNITS.join("|")})s?\\b)`,
  "i"
);

/**
 * Extracts a quantity+unit token from a string, e.g. "500g", "1.5 kg", "2 stk".
 * Returns { quantity, unit, rest } where rest is the string with the token removed.
 */
function extractUnitToken(text: string): {
  quantity: string | null;
  unit: string | null;
  rest: string;
} {
  const m = UNIT_RE.exec(text);
  if (!m) return { quantity: null, unit: null, rest: text };

  const token = m[1]!;
  // Split token into number and unit
  const numMatch = /^([\d.,]+)\s*([a-zA-Z]+)/.exec(token.trim());
  if (!numMatch) return { quantity: null, unit: null, rest: text };

  const quantity = numMatch[1]!.replace(",", ".");
  const unit     = numMatch[2]!.toLowerCase();
  const rest     = text.replace(token, " ").replace(/\s{2,}/g, " ").trim();
  return { quantity, unit, rest };
}

// ── Line classification ───────────────────────────────────────────────────────

function shouldSkip(line: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(line));
}

/**
 * Returns true if the line looks like a product entry (has something resembling
 * a name + a price). Lines that are purely numeric, purely punctuation, or very
 * short are rejected.
 */
function looksLikeProductLine(line: string, priceMatch: ReturnType<typeof extractPrice>): boolean {
  if (!priceMatch) return false;

  // The name part is everything before the price
  const namePart = line.slice(0, priceMatch.index).trim();
  if (namePart.length < 2) return false;

  // Must contain at least one letter (not just numbers/symbols)
  if (!/[a-zA-ZæøåÆØÅ]/.test(namePart)) return false;

  return true;
}

// ── Stacked-format detector ───────────────────────────────────────────────────

/**
 * Some invoices (especially PDF-extracted text) have each field on its own line:
 *   Hvit kakedrum kvadratisk 20x20cm
 *   15
 *   261,00 NOK
 *
 * Detects this pattern and groups triplets (name / qty / price) into items.
 * Returns null if the text doesn't look like stacked format.
 */
function tryStackedFormat(lines: string[]): InvoiceLineItem[] | null {
  const nonBlank = lines.map((l) => l.trim()).filter(Boolean);
  if (nonBlank.length < 3) return null;

  const tripletTotal = Math.floor(nonBlank.length / 3);

  // Score: how many [name, bareNumber, priceValue] triplets exist at every 3rd offset
  let matched = 0;
  for (let i = 0; i + 2 < nonBlank.length; i += 3) {
    const hasLetters = /[a-zA-ZæøåÆØÅ]/.test(nonBlank[i]!);
    const isBareNum  = /^\d+([.,]\d+)?$/.test(nonBlank[i + 1]!);
    const hasPrice   = extractPrice(nonBlank[i + 2]!) !== null;
    if (hasLetters && isBareNum && hasPrice) matched++;
  }

  if (tripletTotal === 0 || matched / tripletTotal < 0.5) return null;

  const items: InvoiceLineItem[] = [];
  for (let i = 0; i + 2 < nonBlank.length; i += 3) {
    const name  = nonBlank[i]!.trim();
    const qty   = nonBlank[i + 1]!.trim();
    const price = nonBlank[i + 2]!.trim();
    const priceMatch = extractPrice(price);
    if (!priceMatch || !/[a-zA-ZæøåÆØÅ]/.test(name)) continue;
    items.push({
      rawName:     name,
      rawPrice:    priceMatch.value,
      rawQuantity: qty.replace(",", "."),
      rawUnit:     null,
    });
  }

  return items.length > 0 ? items : null;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseInvoiceText(text: string): InvoiceLineItem[] {
  const lines = text.split(/\r?\n/);

  // Try stacked format first (name / qty / price each on their own line)
  const stacked = tryStackedFormat(lines);
  if (stacked) return stacked;

  const items: InvoiceLineItem[] = [];
  const seen = new Set<string>(); // deduplicate near-identical lines

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (shouldSkip(line)) continue;

    const priceMatch = extractPrice(line);
    if (!looksLikeProductLine(line, priceMatch)) continue;

    // Everything before the price is the "name + possible unit" section
    let namePart = line.slice(0, priceMatch!.index).trim();
    // Remove trailing separators or column-fill characters
    namePart = namePart.replace(/[\t|]+$/, "").trim();

    // Extract embedded unit token from the name part
    const { quantity, unit, rest: nameOnly } = extractUnitToken(namePart);

    // Clean up the name: remove leading line numbers ("1.", "01 ", etc.)
    const name = nameOnly
      .replace(/^\d+[.)]\s*/, "")  // "1. Flour" → "Flour"
      .replace(/\s{2,}/g, " ")
      .trim();

    if (name.length < 2) continue;

    // Deduplicate (pasted PDFs sometimes repeat header lines)
    const key = name.toLowerCase().slice(0, 20);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      rawName: name,
      rawPrice: priceMatch!.value,
      rawUnit: unit,
      rawQuantity: quantity,
    });
  }

  return items;
}
