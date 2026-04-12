/**
 * Client-side recipe text parser.
 * Handles recipes pasted from websites, Word docs, PDFs, or typed by hand.
 * No API calls — runs entirely in the browser.
 */

export type ParsedRecipe = {
  name: string;
  description: string | null;
  category: string | null;
  yieldAmount: string;
  yieldUnit: string;
  prepTimeMinutes: number | null;
  bakeTimeMinutes: number | null;
  ingredients: { name: string; quantity: string; unit: string; notes: string | null }[];
  instructions: string | null;
  notes: string | null;
};

// ── Unit normalisation ────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp",
  teaspoon:   "tsp",  teaspoons:   "tsp",  tsps:  "tsp",
  gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", ml: "ml", mL: "ml",
  deciliter: "dl", deciliters: "dl", decilitre: "dl", decilitres: "dl",
  liter: "L", liters: "L", litre: "L", litres: "L",
  pound: "lb", pounds: "lb", lbs: "lb",
  ounce: "oz", ounces: "oz",
  piece: "piece", pieces: "piece", pcs: "piece", pc: "piece",
  cup: "cup", cups: "cup",
  clove: "clove", cloves: "clove",
  slice: "slice", slices: "slice",
  bunch: "bunch", bunches: "bunch",
  sprig: "sprig", sprigs: "sprig",
  sheet: "sheet", sheets: "sheet",
  stick: "stick", sticks: "stick",
  handful: "handful", handfuls: "handful",
  drop: "drop", drops: "drop",
  dash: "dash", dashes: "dash",
  pinch: "pinch", pinches: "pinch",
};

function normaliseUnit(raw: string): string {
  const lower = raw.toLowerCase().replace(/\.$/, "");
  return UNIT_MAP[lower] ?? lower;
}

// ── Quantity conversion ───────────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75,
  "⅓": 0.333, "⅔": 0.667,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function convertQuantity(raw: string): string {
  let str = raw.trim();

  // Replace unicode fractions first
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    str = str.replace(frac, ` ${val}`).trim();
  }

  // Mixed number: "1 1/2" or "2 3/4"
  const mixed = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    return String(Math.round((parseInt(mixed[1]!) + parseInt(mixed[2]!) / parseInt(mixed[3]!)) * 1000) / 1000);
  }

  // Simple fraction: "1/2"
  const frac = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    return String(Math.round((parseInt(frac[1]!) / parseInt(frac[2]!)) * 1000) / 1000);
  }

  // Range: "2-3" or "2–3" → use lower bound
  const range = str.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*\d+/);
  if (range) return range[1]!.replace(",", ".");

  // European decimal comma: "1,5" → "1.5"
  return str.replace(",", ".");
}

// ── Section detection ─────────────────────────────────────────────────────────

const INGREDIENT_HEADERS = /^(ingredients?|what you('ll| will)? need|you('ll| will)? need):?\s*$/i;
const INSTRUCTION_HEADERS = /^(instructions?|method|directions?|steps?|preparation|how to (make|bake|cook|prepare)|to make|procedure):?\s*$/i;
const NOTES_HEADERS = /^(notes?|baker'?s? notes?|tips?|storage|make.?ahead|variations?|serving suggestions?):?\s*$/i;
const META_LINE = /^(prep\s*time|bake\s*time|cook\s*time|total\s*time|serves?|makes?|yields?|portions?|difficulty|author|source|course|cuisine|calories)/i;

function findSections(lines: string[]): { ingredients: number | null; instructions: number | null; notes: number | null } {
  let ingredients: number | null = null;
  let instructions: number | null = null;
  let notes: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (ingredients === null && INGREDIENT_HEADERS.test(line)) ingredients = i;
    else if (INSTRUCTION_HEADERS.test(line)) instructions = i;
    else if (NOTES_HEADERS.test(line)) notes = i;
  }

  return { ingredients, instructions, notes };
}

// ── Yield extraction ──────────────────────────────────────────────────────────

const YIELD_UNITS = "(?:piece|pieces|bun|buns|roll|rolls|loaf|loaves|cookie|cookies|cupcake|cupcakes|muffin|muffins|cake|cakes|brownie|brownies|portion|portions|serving|servings|slice|slices|tart|tarts|croissant|croissants|bar|bars|scone|scones|bagel|bagels|donut|donuts|doughnut|doughnuts|waffle|waffles|pancake|pancakes|crumpet|crumpets|mini|large|standard)s?";

function extractYield(text: string): { amount: string; unit: string } {
  const patterns = [
    // "Makes 12 buns" / "Yields 24 cookies"
    new RegExp(`(?:makes?|yields?|gives?|produces?|for)\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*(${YIELD_UNITS})`, "i"),
    // "Serves 8" / "Portions: 6"
    /(?:serves?|portions?|servings?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)/i,
    // standalone "12 buns" on its own line — less reliable, try last
    new RegExp(`^(\\d+)\\s+(${YIELD_UNITS})$`, "im"),
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const amount = convertQuantity(m[1]!);
      const unit   = (m[2] ?? "piece").toLowerCase().replace(/s$/, "") || "piece";
      return { amount, unit };
    }
  }

  return { amount: "1", unit: "portion" };
}

// ── Time extraction ───────────────────────────────────────────────────────────

function toMinutes(value: string, unit: string): number {
  const n = parseFloat(value.replace(",", "."));
  if (/^h/i.test(unit)) return Math.round(n * 60);
  return Math.round(n);
}

function extractTimes(text: string): { prep: number | null; bake: number | null } {
  const timePattern = (label: string) =>
    new RegExp(`${label}\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*(hours?|h\\b|minutes?|mins?)`, "i");

  const prepMatch = text.match(timePattern("prep(?:aration)?\\s*time"));
  const bakeMatch = text.match(timePattern("(?:bak(?:e|ing)|cook(?:ing)?|oven)\\s*time"));
  const totalMatch = text.match(timePattern("total\\s*time"));

  const prep = prepMatch ? toMinutes(prepMatch[1]!, prepMatch[2]!) : null;
  let bake = bakeMatch ? toMinutes(bakeMatch[1]!, bakeMatch[2]!) : null;

  // Fallback: if we have total and prep but no bake, estimate bake = total - prep
  if (!bake && totalMatch && prep !== null) {
    const total = toMinutes(totalMatch[1]!, totalMatch[2]!);
    bake = Math.max(0, total - prep);
  }

  return { prep, bake };
}

// ── Ingredient line parsing ───────────────────────────────────────────────────

const UNITS_RE = "(?:g|kg|ml|dl|cl|l|L|tsp|tbsp|tablespoons?|teaspoons?|cups?|pieces?|pcs?|pc|pinch(?:es)?|bunch(?:es)?|cloves?|slices?|oz|lbs?|pounds?|ounces?|grams?|kilos?|kilograms?|liters?|litres?|milliliters?|millilitres?|deciliters?|decilitres?|handfuls?|sprigs?|sheets?|sticks?|drops?|dashes?|handful|pinch)";

// Quantity can be: integer, decimal, fraction, or unicode fraction character
const QTY_RE = "[½¼¾⅓⅔⅛⅜⅝⅞]|\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\s*/\\s*\\d+|\\s*/\\s*\\d+)?";

function parseIngredientLine(raw: string): { name: string; quantity: string; unit: string; notes: string | null } | null {
  // Strip leading bullet points, numbers, dashes
  const line = raw
    .replace(/^[•\-*–—◦▪►▸‣]+\s*/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  if (!line || line.length < 2) return null;
  // Skip lines that look like section headers or meta info
  if (INGREDIENT_HEADERS.test(line) || INSTRUCTION_HEADERS.test(line) || META_LINE.test(line)) return null;

  let quantity = "1";
  let unit = "piece";
  let name = line;
  let notes: string | null = null;

  // Try: qty+unit (no space) + name   e.g. "250g flour"
  const noSpace = line.match(new RegExp(`^(${QTY_RE})(${UNITS_RE})\\s+(.+)$`, "i"));
  // Try: qty + unit + name            e.g. "250 g flour"
  const withSpace = line.match(new RegExp(`^(${QTY_RE})\\s+(${UNITS_RE})\\s+(.+)$`, "i"));
  // Try: word qty + name              e.g. "Pinch of salt", "A handful of flour"
  const wordQty = line.match(/^(a\s+)?(pinch|handful|dash|splash|drizzle|knob|sprig|bunch|sheet|stick)\s+(?:of\s+)?(.+)$/i);
  // Try: qty + name (no unit)         e.g. "3 eggs", "2 bananas"
  const noUnit = line.match(new RegExp(`^(${QTY_RE})\\s+(.+)$`));

  if (noSpace) {
    quantity = convertQuantity(noSpace[1]!);
    unit     = normaliseUnit(noSpace[2]!);
    name     = noSpace[3]!;
  } else if (withSpace) {
    quantity = convertQuantity(withSpace[1]!);
    unit     = normaliseUnit(withSpace[2]!);
    name     = withSpace[3]!;
  } else if (wordQty) {
    quantity = "1";
    unit     = wordQty[2]!.toLowerCase();
    name     = wordQty[3]!;
  } else if (noUnit) {
    quantity = convertQuantity(noUnit[1]!);
    unit     = "piece";
    name     = noUnit[2]!;
  }

  // Split notes off the name at the first comma (e.g. "butter, melted")
  const commaIdx = name.search(/,\s*/);
  if (commaIdx > 1) {
    notes = name.slice(commaIdx + 1).replace(/^,\s*/, "").trim() || null;
    name  = name.slice(0, commaIdx).trim();
  }

  name = name.replace(/\s+/g, " ").trim();
  if (!name) return null;

  return { name, quantity, unit, notes };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const sect  = findSections(lines);

  // Title: first non-empty, non-meta line before the ingredient section
  const beforeIngredients = lines.slice(0, sect.ingredients ?? sect.instructions ?? lines.length);
  const titleLines = beforeIngredients.filter((l) => l && !META_LINE.test(l));
  const name = titleLines[0]?.replace(/^#+\s*/, "") ?? "Imported Recipe"; // strip markdown headings
  // Description: subsequent non-empty lines before the first section
  const description = titleLines.slice(1).join(" ").trim() || null;

  // Ingredient lines: between ingredients header and instructions header
  const ingEnd  = sect.instructions ?? sect.notes ?? lines.length;
  const ingLines = sect.ingredients !== null
    ? lines.slice(sect.ingredients + 1, ingEnd)
    : [];

  // If no header found, try to detect ingredient-looking lines in the full text
  const ingredientLines = ingLines.length > 0 ? ingLines : inferIngredientLines(lines);

  const ingredients = ingredientLines
    .map(parseIngredientLine)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Instructions: after instructions header, up to notes section
  const instrEnd   = sect.notes ?? lines.length;
  const instrLines = sect.instructions !== null
    ? lines.slice(sect.instructions + 1, instrEnd).filter(Boolean)
    : [];
  const instructions = instrLines.length > 0 ? instrLines.join("\n") : null;

  // Notes
  const notesLines = sect.notes !== null
    ? lines.slice(sect.notes + 1).filter(Boolean)
    : [];
  const notes = notesLines.length > 0 ? notesLines.join("\n") : null;

  return {
    name,
    description,
    category: null,
    ...extractYield(text),
    ...extractTimes(text),
    ingredients,
    instructions,
    notes,
  };
}

// Fallback: try to identify ingredient-looking lines when no header is present
function inferIngredientLines(lines: string[]): string[] {
  const ingRe = new RegExp(`^(?:${QTY_RE}|[½¼¾⅓⅔⅛⅜⅝⅞])\\s`, "i");
  return lines.filter((l) => ingRe.test(l.replace(/^[•\-*–—]+\s*/, "")));
}
