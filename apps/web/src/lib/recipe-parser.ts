/**
 * Client-side recipe text parser.
 * Handles recipes pasted from websites, Word docs, PDFs, or typed by hand.
 * Supports both Western (qty-first: "250g flour") and Nordic (name-first: "Hvetemel 100 g") formats.
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
  // English
  tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp",
  teaspoon:   "tsp",  teaspoons:   "tsp",  tsps:  "tsp",
  gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", mL: "ml",
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
  // Norwegian abbreviations
  ts:  "tsp",    // teskje
  ss:  "tbsp",   // spiseskje
  stk: "piece",  // stykk(er)
  pk:  "piece",  // pakke
  dl:  "dl",
  cl:  "cl",
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
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    str = str.replace(frac, ` ${val}`).trim();
  }
  const mixed = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    return String(Math.round((parseInt(mixed[1]!) + parseInt(mixed[2]!) / parseInt(mixed[3]!)) * 1000) / 1000);
  }
  const frac = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    return String(Math.round((parseInt(frac[1]!) / parseInt(frac[2]!)) * 1000) / 1000);
  }
  const range = str.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*\d+/);
  if (range) return range[1]!.replace(",", ".");
  return str.replace(",", ".");
}

// ── Section detection ─────────────────────────────────────────────────────────

// English + Norwegian headers
const INGREDIENT_HEADERS = /^(ingredients?|ingredienser|ingredient list|what you('ll| will)? need|you('ll| will)? need):?\s*$/i;
const INSTRUCTION_HEADERS = /^(instructions?|method|directions?|steps?|preparation|fremgangsmåte|tilberedning|slik gjør du|slik lager du|slik baker du|how to (make|bake|cook|prepare)|to make|procedure):?\s*$/i;
const NOTES_HEADERS = /^(notes?|baker'?s? notes?|tips?|tips og triks|storage|make.?ahead|variations?|serving suggestions?|equipment|tools|special equipment|utstyr|verktøy):?\s*$/iu;
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

const YIELD_UNITS = "(?:piece|pieces|bun|buns|roll|rolls|loaf|loaves|cookie|cookies|cupcake|cupcakes|muffin|muffins|cake|cakes|brownie|brownies|portion|portions|serving|servings|slice|slices|tart|tarts|croissant|croissants|bar|bars|scone|scones|bagel|bagels|donut|donuts|doughnut|doughnuts|waffle|waffles|pancake|pancakes|crumpet|crumpets|mini|large|standard|stykker?|rundstykker?|boller?|brød|kaker?|porsjoner?)s?";

function extractYield(text: string): { amount: string; unit: string } {
  const patterns = [
    new RegExp(`(?:makes?|yields?|gives?|produces?|for)\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*(${YIELD_UNITS})`, "i"),
    /(?:serves?|portions?|servings?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)/i,
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
  const prepMatch  = text.match(timePattern("prep(?:aration)?\\s*time"));
  const bakeMatch  = text.match(timePattern("(?:bak(?:e|ing)|cook(?:ing)?|oven)\\s*time"));
  const totalMatch = text.match(timePattern("total\\s*time"));
  const prep = prepMatch ? toMinutes(prepMatch[1]!, prepMatch[2]!) : null;
  let bake   = bakeMatch ? toMinutes(bakeMatch[1]!, bakeMatch[2]!) : null;
  if (!bake && totalMatch && prep !== null) {
    const total = toMinutes(totalMatch[1]!, totalMatch[2]!);
    bake = Math.max(0, total - prep);
  }
  return { prep, bake };
}

// ── Ingredient line parsing ───────────────────────────────────────────────────

// All recognised unit abbreviations (English + Norwegian)
const UNITS_RE = "(?:g|kg|ml|dl|cl|l|L|tsp|tbsp|ts|ss|stk|pk|tablespoons?|teaspoons?|cups?|pieces?|pcs?|pc|units?|pinch(?:es)?|bunch(?:es)?|cloves?|slices?|oz|lbs?|pounds?|ounces?|grams?|kilos?|kilograms?|liters?|litres?|milliliters?|millilitres?|deciliters?|decilitres?|handfuls?|sprigs?|sheets?|sticks?|drops?|dashes?|handful|pinch)";

// Quantity: integer, decimal, fraction (unicode or ASCII)
const QTY_RE = "[½¼¾⅓⅔⅛⅜⅝⅞]|\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\s*/\\s*\\d+|\\s*/\\s*\\d+)?";

function parseIngredientLine(raw: string): { name: string; quantity: string; unit: string; notes: string | null } | null {
  const line = raw
    .replace(/^[•\-*–—◦▪►▸‣]+\s*/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  if (!line || line.length < 2) return null;
  if (INGREDIENT_HEADERS.test(line) || INSTRUCTION_HEADERS.test(line) || META_LINE.test(line)) return null;

  let quantity = "1";
  let unit = "piece";
  let name = line;
  let notes: string | null = null;

  // Pattern priority (most specific → least specific):
  // 1. qty+unit fused + name    "250g flour",  "0.75ts vaniljesukker"
  const noSpace   = line.match(new RegExp(`^(${QTY_RE})(${UNITS_RE})\\s+(.+)$`, "i"));
  // 2. qty + unit + name        "250 g flour",  "2 ts bakepulver"
  const withSpace = line.match(new RegExp(`^(${QTY_RE})\\s+(${UNITS_RE})\\s+(.+)$`, "i"));
  // 3. word quantity + name     "pinch of salt", "a handful of oats"
  const wordQty   = line.match(/^(a\s+)?(pinch|handful|dash|splash|drizzle|knob|sprig|bunch|sheet|stick)\s+(?:of\s+)?(.+)$/i);
  // 4. NAME-FIRST (Nordic)      "Hvetemel 100 g", "Brunt sukker 0.75 ts"
  //    Name part capped at 5 words to avoid matching instruction sentences
  const nameFirst = line.match(new RegExp(`^(\\S+(?:\\s+\\S+){0,4})\\s+(${QTY_RE})\\s+(${UNITS_RE})$`, "i"));
  // 4b. NAME-FIRST fused        "Sugar 80g", "Kefir 107.5g" — qty+unit with no space
  const nameFirstFused = line.match(new RegExp(`^(\\S+(?:\\s+\\S+){0,4})\\s+(${QTY_RE})(${UNITS_RE})$`, "i"));
  // 5. qty + name, no unit      "3 eggs", "2 bananas"
  const noUnit    = line.match(new RegExp(`^(${QTY_RE})\\s+(.+)$`));

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
  } else if (nameFirst) {
    name     = nameFirst[1]!.trim();
    quantity = convertQuantity(nameFirst[2]!);
    unit     = normaliseUnit(nameFirst[3]!);
  } else if (nameFirstFused) {
    name     = nameFirstFused[1]!.trim();
    quantity = convertQuantity(nameFirstFused[2]!);
    unit     = normaliseUnit(nameFirstFused[3]!);
  } else if (noUnit) {
    quantity = convertQuantity(noUnit[1]!);
    unit     = "piece";
    name     = noUnit[2]!;
  }

  // Split notes off at the first comma: "butter, softened" → name="butter", notes="softened"
  const commaIdx = name.search(/,\s*/);
  if (commaIdx > 1) {
    notes = name.slice(commaIdx + 1).replace(/^,\s*/, "").trim() || null;
    name  = name.slice(0, commaIdx).trim();
  }

  name = name.replace(/\s+/g, " ").trim();
  if (!name) return null;

  return { name, quantity, unit, notes };
}

// ── Ingredient line detection (for headerless fallback) ───────────────────────

/**
 * Returns true if a line looks like an ingredient in either qty-first or name-first format.
 * Intentionally conservative to avoid mistaking instruction sentences for ingredients.
 */
function isIngredientLike(line: string): boolean {
  const cleaned = line
    .replace(/^[•\-*–—◦▪►▸‣]+\s*/, "")
    .replace(/^\d+\.\s+/, "") // strip "1. " numbered steps
    .trim();

  if (!cleaned || cleaned.length < 2) return false;
  if (INGREDIENT_HEADERS.test(cleaned) || INSTRUCTION_HEADERS.test(cleaned) || META_LINE.test(cleaned)) return false;

  // Qty-first: line starts with a number or fraction
  const qtyFirstRe = new RegExp(`^(?:${QTY_RE})(?:(${UNITS_RE})\\s|\\s+(${UNITS_RE})\\s|\\s+)\\S`, "i");
  if (qtyFirstRe.test(cleaned)) return true;

  // Word-quantity: starts with "pinch", "handful", etc.
  const wordQtyRe = /^(a\s+)?(pinch|handful|dash|splash|drizzle|knob|sprig|bunch|sheet|stick)\s+/i;
  if (wordQtyRe.test(cleaned)) return true;

  // Name-first (Nordic): "Word(s) qty unit" — name at most 5 words, ends with known unit
  // Short name cap prevents matching instruction sentences like "Bake at 180°C for 30 minutes"
  const nameFirstRe = new RegExp(`^(\\S+(?:\\s+\\S+){0,4})\\s+(${QTY_RE})\\s+(${UNITS_RE})$`, "i");
  if (nameFirstRe.test(cleaned)) return true;

  // Name-first fused: "Sugar 80g", "Kefir 107.5g" — no space between qty and unit
  const nameFirstFusedRe = new RegExp(`^(\\S+(?:\\s+\\S+){0,4})\\s+(${QTY_RE})(${UNITS_RE})$`, "i");
  if (nameFirstFusedRe.test(cleaned)) return true;

  return false;
}

// Try to expand a sentence like "Dough: Mix 245g flour, 10g yeast, 70g sugar, 1 egg, salt"
// into individual ingredient fragments. Returns null when the line doesn't look like a list.
function expandCommaIngredients(line: string): string[] | null {
  // Strip a leading section label like "Dough:", "Filling:", "Ingredients & Method Highlights:"
  let l = line.replace(/^[A-Za-z][\w\s&]{0,40}:\s*/, "");
  // Strip a leading verb that often precedes an inline ingredient list (English + Norwegian)
  l = l.replace(/^(?:Mix|Add|Combine|Melt|Whisk|Stir|Beat|Cream|Fold|Sift|Pour|Heat|Place|Put|Use|Take|Make|Bring|Soak|Pre.?heat|Bland|Tilsett|Visp|Rør|Pisk|Smelt|Hell|Legg|Sett|Bruk|Ta|Forvarm|Smør)\s+/i, "");

  const parts = l
    .split(/\s*,\s*|\s+(?:and|og)\s+/i)
    .map((p) => p.replace(/\.\s+.*$/, "").replace(/\.$/, "").trim()) // drop trailing sentence after a period
    .filter(Boolean);
  if (parts.length < 2) return null;

  // Require at least one fragment to carry an explicit quantity, otherwise this
  // is probably an instruction sentence rather than an ingredient list.
  const qtyHead = new RegExp(`^(?:${QTY_RE})(?:${UNITS_RE})?\\s+\\S`, "i");
  if (!parts.some((p) => qtyHead.test(p))) return null;

  return parts;
}

// Fallback: extract ingredient-looking lines from an unstructured text block.
// Also expands inline comma-separated ingredient lists embedded in instruction sentences.
function inferIngredientLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (isIngredientLike(line)) {
      out.push(line);
      continue;
    }
    const expanded = expandCommaIngredients(line);
    if (expanded) out.push(...expanded);
  }
  return out;
}

// Insert line breaks before common section markers ("Dough:", "Method:", "Filling:",
// "Ingredients:", etc.) when the source text smashes everything onto one line.
// Also splits long single-line pastes on sentence boundaries so the title heuristic
// has something reasonable to work with.
const INLINE_SECTION_MARKERS = /(?<=\S)\s*(?=\b(?:Ingredients?|Method|Instructions?|Directions?|Steps?|Procedure|Preparation|Notes?|Tips?|Filling|Dough|Batter|Topping|Glaze|Frosting|Icing|Assembly|Garnish|Sauce|Servings?|Yields?|Makes?|Prep\s*Time|Bake\s*Time|Cook\s*Time|Total\s*Time|Ingredienser|Fremgangsmåte|Tilberedning|Notater|Fyll(?:ing)?|Deig|Glasur|Glasering|Pynt|Saus|Bunn|Porsjoner?|Stykker?)\s*:)/giu;

function normaliseInlineText(raw: string): string {
  let out = raw.replace(INLINE_SECTION_MARKERS, "\n");

  // For dense single-paragraph pastes (≤5 line breaks), apply structural splits
  // that recover line breaks from run-on text where ingredients and section
  // labels were concatenated with no separators (e.g. "flour120 g UnsaltedSugar…").
  if (out.split(/\r?\n/).length <= 5) {
    // Rule A — letter or closing paren immediately before a digit (start of a quantity).
    //   "flour120 g" → "flour\n120 g",  "treacle)100 g" → "treacle)\n100 g"
    out = out.replace(/(?<=[a-z\)])(?=\d)/g, "\n");
    // Rule B — letter or closing paren immediately before a capital letter (camelCase split).
    //   "MilkPinch" → "Milk\nPinch",  "SaltSyrup" → "Salt\nSyrup",  ")Instructions" → ")\nInstructions"
    out = out.replace(/(?<=[a-z\)])(?=[A-Z])/g, "\n");
    // Rule C — sentence/clause-end punctuation before a capital, with optional whitespace.
    //   "1 hour.Make" → "1 hour.\nMake",  "Cool: Allow" → "Cool:\nAllow",  ". Keep" → ".\nKeep"
    out = out.replace(/(?<=[.!?:])\s*(?=[A-Z])/g, "\n");
    // Rule D — colon directly before a digit-led quantity (digit + optional decimal + letter).
    // The trailing letter requirement distinguishes a quantity-with-unit from a bare ratio
    // like "1:1" or a time stamp like "12:30".
    //   "Dough:500g flour" → "Dough:\n500g flour",  "(Stroop):450g sugar" → "(Stroop):\n450g sugar"
    out = out.replace(/(?<=:)\s*(?=\d+(?:[.,]\d+)?\s*[a-zA-Z])/g, "\n");
  }
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseRecipeText(text: string): ParsedRecipe {
  const lines = normaliseInlineText(text).split(/\r?\n/).map((l) => l.trim());
  const sect  = findSections(lines);

  // ── Ingredient lines ─────────────────────────────────────────────────────
  const ingEnd   = sect.instructions ?? sect.notes ?? lines.length;
  const ingLines = sect.ingredients !== null
    ? lines.slice(sect.ingredients + 1, ingEnd)     // between section headers
    : inferIngredientLines(lines);                  // no headers: detect by pattern

  const ingredients = ingLines
    .map(parseIngredientLine)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ── Title & description ──────────────────────────────────────────────────
  // Only look at lines BEFORE the ingredient/instruction section for the title.
  // Exclude ingredient-like lines, lines we expanded into inline ingredient lists,
  // and instruction-style sentences (cooking verbs, section labels).
  const beforeIngredients = lines.slice(0, sect.ingredients ?? sect.instructions ?? lines.length);
  // A line is "instruction-like" only when it pairs a cooking verb with an actual
  // measurement (e.g. "Mix 245g flour", "Bake at 200°C"). The verb alone is not
  // enough — recipe names like "Pour-Over Coffee Cake" or "Bake-at-Home Cookies"
  // would otherwise be filtered out.
  const COOKING_VERB = /\b(?:Mix|Add|Combine|Melt|Whisk|Stir|Beat|Cream|Fold|Sift|Pour|Heat|Place|Put|Bake|Cook|Fry|Boil|Simmer|Bring|Soak|Spread|Serve|Cool|Let|Pre.?heat|Knead|Roll|Cut|Slice|Brush|Sprinkle|Top|Bland|Tilsett|Visp|Rør|Pisk|Smelt|Stek|Kok|Hell|Legg|Sett|Sikt|Brett|Strø|Pensle|Skjær|Del|La|Forvarm|Elt|Kjevle|Server|Avkjøl|Spre|Smør|Bak)\b/iu;
  const HAS_MEASUREMENT = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${UNITS_RE}|°\\s*[CF]|min(?:utes?|utter?)?|hours?|h\\b|se[ck](?:onds?|under?)?|timer?)\\b`, "i");
  const looksInstructional = (l: string) => COOKING_VERB.test(l) && HAS_MEASUREMENT.test(l);
  const SECTION_HEAD = /^(?:Ingredients?|Method|Instructions?|Directions?|Steps?|Procedure|Preparation|Notes?|Tips?|Filling|Dough|Batter|Topping|Glaze|Frosting|Icing|Assembly|Garnish|Sauce|Ingredienser|Fremgangsmåte|Tilberedning|Notater|Fyll(?:ing)?|Deig|Glasur|Glasering|Pynt|Saus|Bunn)\b/iu;
  const titleLines = beforeIngredients.filter(
    (l) =>
      l &&
      !META_LINE.test(l) &&
      !isIngredientLike(l) &&
      expandCommaIngredients(l) === null &&
      !looksInstructional(l) &&
      // Lines ending with a colon are section labels ("For the Dough:",
      // "Ingredients:", "Caramel Filling (Stroop):"), not recipe titles.
      !l.endsWith(":")
  );

  // If the whole paste was a bare ingredient list (no recipe name found), use a placeholder.
  // Also fall back when the candidate is suspiciously long or starts with a section
  // keyword — that usually means the source had no real title.
  const candidate = titleLines[0]?.replace(/^#+\s*/, "").replace(/:$/, "").trim() ?? "";
  const looksLikeTitle =
    candidate.length > 0 && candidate.length <= 100 && !SECTION_HEAD.test(candidate);
  const name = looksLikeTitle ? candidate : "Imported Recipe";
  const description = (looksLikeTitle
    ? titleLines.slice(1).join(" ")
    : titleLines.join(" ")
  ).trim() || null;

  // ── Instructions ─────────────────────────────────────────────────────────
  const instrEnd   = sect.notes ?? lines.length;
  const instrLines = sect.instructions !== null
    ? lines.slice(sect.instructions + 1, instrEnd).filter(Boolean)
    : [];
  const instructions = instrLines.length > 0 ? instrLines.join("\n") : null;

  // ── Notes ─────────────────────────────────────────────────────────────────
  const notesLines = sect.notes !== null
    ? lines.slice(sect.notes + 1).filter(Boolean)
    : [];
  const notes = notesLines.length > 0 ? notesLines.join("\n") : null;

  const yieldInfo = extractYield(text);
  const times     = extractTimes(text);

  return {
    name,
    description,
    category: null,
    yieldAmount: yieldInfo.amount,
    yieldUnit:   yieldInfo.unit,
    prepTimeMinutes: times.prep,
    bakeTimeMinutes: times.bake,
    ingredients,
    instructions,
    notes,
  };
}
