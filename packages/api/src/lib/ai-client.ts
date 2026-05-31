/**
 * Anthropic SDK wrapper.
 *
 * The actual AI feature endpoints (caption / weekly plan / brand voice) live
 * in `routers/ai-assistant.ts` and use this client. This file's only job is:
 *   1. Centralize the model ID + version so swaps are one edit.
 *   2. Gracefully refuse to operate when ANTHROPIC_API_KEY is unset
 *      ("AI not configured" rather than a stack trace).
 *   3. Provide a thin `runCaptionPrompt`-style helper later — kept stubbed
 *      for now because step 4 is foundation only (no actual API calls).
 *
 * Cost note: Sonnet 4.6 was chosen as a balance of quality and price for the
 * social planner use case. Captioning is creative writing, not heavy
 * reasoning — Sonnet handles it well at ~5× lower cost than Opus. If output
 * quality is later judged insufficient, swap to `claude-opus-4-8` AND update
 * the per-token prices in ai-cost.ts together.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ClaudeUsage } from "./ai-cost";

/** Model used for all AI features. Coupled to prices in ai-cost.ts. */
export const CLAUDE_MODEL = "claude-sonnet-4-6";

/** Cap on output tokens for caption generation. ~200 tokens covers a 2200-char
 *  Instagram caption + 10 hashtags with headroom. Not high enough to need streaming. */
const CAPTION_MAX_OUTPUT_TOKENS = 1024;

/** Brand voice analysis returns a description + 3-5 example captions. ~1500
 *  tokens is generous enough for thorough analysis without runaway cost. */
const BRAND_VOICE_MAX_OUTPUT_TOKENS = 2048;

/** Weekly plan = 7 posts × ~250 tokens each. 4096 leaves headroom for
 *  longer captions and detailed rationales without truncating. */
const WEEKLY_PLAN_MAX_OUTPUT_TOKENS = 4096;

/** Minimum number of past captions required for meaningful voice analysis.
 *  Below this we refuse to run rather than produce a noisy result. */
export const MIN_CAPTIONS_FOR_VOICE_ANALYSIS = 5;

/**
 * Lazy-init singleton — only constructs the client when the key is present.
 * Calls that need it should go through `requireClaudeClient()` to get the
 * appropriate error.
 */
let cachedClient: Anthropic | null = null;

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Get the Claude client, or throw if not configured.
 *
 * Use this from router code where the absence of a key should surface as
 * a user-visible "AI features not configured" error rather than crashing
 * the request.
 */
export function requireClaudeClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "AI features are not configured. The platform administrator needs to set ANTHROPIC_API_KEY.",
    );
  }
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

// ─── Caption generation ───────────────────────────────────────────────────────

/**
 * Schema for what Claude must return. Caption and hashtags are split so the
 * UI can render hashtags as styled chips and let the user toggle them on/off
 * before posting. Hashtags exclude the leading `#` so the UI can present them
 * uniformly without parsing.
 */
const captionSchema = z.object({
  caption:  z.string().describe("Instagram caption, max 2000 characters, including 0-2 emoji where natural. Do NOT include hashtags here — they go in the separate hashtags array."),
  hashtags: z.array(z.string()).describe("5 to 10 hashtags as plain words (no # symbol), lowercase, no spaces. Mix of product, bakery, and audience-relevant tags."),
});

export type GeneratedCaption = z.infer<typeof captionSchema>;

export interface CaptionInputs {
  bakeryName:       string;
  language:         "en" | "nb";
  brandVoice:       string | null;  // null until step 6 wires brand voice learning
  product: {
    name:           string;
    description:    string | null;
    priceKr:        string | null;  // already formatted
    allergens:      string[];
  };
  /** Optional steer like "playful", "warm", "professional", or a free-text phrase. */
  toneHint?:        string;
}

export interface GenerationResult<T> {
  data:   T;
  usage:  ClaudeUsage;
}

const DEFAULT_BRAND_VOICE_EN = [
  "Warm and conversational, like a baker talking to a regular customer.",
  "Sensory and specific about ingredients and craft (texture, aroma, technique).",
  "Personal — speaks in first person where natural, never corporate.",
  "Concise: 2-4 short sentences. Uses 0-2 relevant emoji at most.",
].join(" ");

const DEFAULT_BRAND_VOICE_NB = [
  "Varm og samtalende, som en baker som snakker med en fast kunde.",
  "Sansebasert og spesifikk om ingredienser og håndverk (tekstur, aroma, teknikk).",
  "Personlig — bruker førsteperson der det er naturlig, aldri korporativ.",
  "Konsis: 2-4 korte setninger. Bruker 0-2 relevante emoji maksimum.",
].join(" ");

function buildSystemPrompt(args: { bakeryName: string; language: "en" | "nb"; brandVoice: string | null }): string {
  const voice =
    args.brandVoice ??
    (args.language === "nb" ? DEFAULT_BRAND_VOICE_NB : DEFAULT_BRAND_VOICE_EN);

  if (args.language === "nb") {
    return [
      `Du skriver Instagram-bildetekster for ${args.bakeryName}, et bakeri.`,
      ``,
      `Stemme og stil:`,
      voice,
      ``,
      `Skriv på norsk (bokmål). Returner alltid gyldig JSON som passer skjemaet.`,
      `Ikke inkluder emnetagger (hashtags) i bildeteksten — de hører hjemme i hashtags-feltet.`,
    ].join("\n");
  }

  return [
    `You write Instagram captions for ${args.bakeryName}, a bakery.`,
    ``,
    `Voice and style:`,
    voice,
    ``,
    `Write in English. Always return valid JSON matching the schema.`,
    `Do not put hashtags inside the caption — they belong only in the hashtags field.`,
  ].join("\n");
}

function buildUserPrompt(args: CaptionInputs): string {
  const lines: string[] = [];

  if (args.language === "nb") {
    lines.push(`Skriv en bildetekst for dette produktet:`);
    lines.push(``);
    lines.push(`Navn: ${args.product.name}`);
    if (args.product.description) lines.push(`Beskrivelse: ${args.product.description}`);
    if (args.product.priceKr)     lines.push(`Pris: ${args.product.priceKr} kr`);
    if (args.product.allergens.length > 0) {
      lines.push(`Allergener: ${args.product.allergens.join(", ")}`);
    }
    if (args.toneHint) {
      lines.push(``);
      lines.push(`Ønsket tone: ${args.toneHint}`);
    }
  } else {
    lines.push(`Write a caption for this product:`);
    lines.push(``);
    lines.push(`Name: ${args.product.name}`);
    if (args.product.description) lines.push(`Description: ${args.product.description}`);
    if (args.product.priceKr)     lines.push(`Price: ${args.product.priceKr} kr`);
    if (args.product.allergens.length > 0) {
      lines.push(`Allergens: ${args.product.allergens.join(", ")}`);
    }
    if (args.toneHint) {
      lines.push(``);
      lines.push(`Requested tone: ${args.toneHint}`);
    }
  }
  return lines.join("\n");
}

/**
 * Call Claude to generate an Instagram caption. Returns the parsed result
 * plus token usage so the router can record cost and quota consumption.
 *
 * Failure modes:
 *   - SDK throws (network, auth, rate-limit) → re-thrown to caller; the
 *     router catches and records the attempt as outcome="error" so the
 *     quota is still consumed (prevents retry abuse).
 *   - Claude returns content that fails Zod validation → the SDK's
 *     `messages.parse()` throws; same handling as above.
 *
 * No prompt caching: the system prompt is below Sonnet 4.6's 2048-token
 * cacheable minimum, so a cache_control marker would silently no-op.
 * Caching is added in step 7 (weekly plan) where the prompt is larger.
 */
export async function generateCaption(inputs: CaptionInputs): Promise<GenerationResult<GeneratedCaption>> {
  const client = requireClaudeClient();

  const response = await client.messages.parse({
    model:      CLAUDE_MODEL,
    max_tokens: CAPTION_MAX_OUTPUT_TOKENS,
    system:     buildSystemPrompt({
      bakeryName: inputs.bakeryName,
      language:   inputs.language,
      brandVoice: inputs.brandVoice,
    }),
    messages: [
      { role: "user", content: buildUserPrompt(inputs) },
    ],
    output_config: {
      format: zodOutputFormat(captionSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude returned unparseable output");
  }

  return {
    data: response.parsed_output,
    usage: {
      inputTokens:               response.usage.input_tokens,
      outputTokens:              response.usage.output_tokens,
      cacheReadInputTokens:      response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens:  response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

// ─── Weekly content plan ─────────────────────────────────────────────────────

const weeklyPostSchema = z.object({
  date:           z.string().describe("ISO date YYYY-MM-DD — must be one of the 7 dates listed in the input."),
  theme:          z.string().describe("Short label for what this post is about, e.g. 'Friday treat highlight' or 'Constitution Day prep'."),
  suggestedTime:  z.enum(["morning", "midday", "afternoon", "evening"]).describe("When to post for best engagement: morning (7-9am), midday (11-1), afternoon (3-5), evening (6-8)."),
  productName:    z.string().nullable().describe("Name of a product from the catalog to feature, EXACTLY as it appears in the catalog list. Use null if this post is a non-product theme like 'behind the scenes' or 'baker introduction'."),
  captionDraft:   z.string().describe("Ready-to-edit caption matching the bakery's voice, ~100-200 characters. No hashtags here — keep them separate."),
  hashtags:       z.array(z.string()).describe("3-5 hashtags as plain words (no # symbol), lowercase. Specific to this post's theme."),
  rationale:      z.string().describe("One short sentence explaining why this fits this specific day."),
});

const weeklyPlanSchema = z.object({
  posts: z.array(weeklyPostSchema).min(7).max(7).describe("Exactly 7 posts, one per day, in chronological order matching the input dates."),
});

export type GeneratedWeeklyPlan = z.infer<typeof weeklyPlanSchema>;
export type GeneratedPlannedPost = z.infer<typeof weeklyPostSchema>;

export interface WeeklyPlanInputs {
  bakeryName:  string;
  language:    "en" | "nb";
  brandVoice:  string | null;
  /** Top ~30 active catalog items (recipes + premade cakes) the model can choose from */
  catalog:     Array<{ name: string; description: string | null; priceKr: string | null; kind: "recipe" | "premade" }>;
  /** Most recent ~10 captions (raw text) so the model avoids immediate repetition */
  recentCaptions: string[];
  /** The 7 dates to plan for, each with the day-of-week and any holiday name */
  week:        Array<{ date: string; weekday: string; holiday: string | null }>;
}

function buildWeeklyPlanSystemPrompt(args: WeeklyPlanInputs): string {
  const voice =
    args.brandVoice ??
    (args.language === "nb" ? DEFAULT_BRAND_VOICE_NB : DEFAULT_BRAND_VOICE_EN);

  const catalogList = args.catalog
    .map((c) => {
      const desc = c.description ? ` — ${c.description.slice(0, 80)}` : "";
      const price = c.priceKr ? ` (${c.priceKr} kr)` : "";
      return `- ${c.name}${price}${desc} [${c.kind}]`;
    })
    .join("\n");

  const recentList = args.recentCaptions.length > 0
    ? args.recentCaptions.map((c, i) => `[${i + 1}] ${c.slice(0, 200)}`).join("\n")
    : (args.language === "nb" ? "(Ingen tidligere innlegg ennå.)" : "(No prior posts yet.)");

  const calendarList = args.week
    .map((d) => `- ${d.date} (${d.weekday}${d.holiday ? `, ${d.holiday}` : ""})`)
    .join("\n");

  if (args.language === "nb") {
    return [
      `Du planlegger en ukes Instagram-innhold for ${args.bakeryName}, et bakeri.`,
      ``,
      `Stemme og stil (følg denne nøye):`,
      voice,
      ``,
      `Bakeriets katalog (velg produkter fra denne listen — bruk navnet ordrett):`,
      catalogList,
      ``,
      `Nylige innlegg (ikke gjenta disse temaene):`,
      recentList,
      ``,
      `Datoer å planlegge for:`,
      calendarList,
      ``,
      `Retningslinjer:`,
      `- Lag nøyaktig 7 innlegg, ett per dato i den oppgitte rekkefølgen.`,
      `- Varier produktene og temaene over uken — ikke gjenta samme produkt.`,
      `- Tilpass enkelte innlegg til ukedagen (helg = mer ettertenksom, hverdag = mer praktisk).`,
      `- Hvis en dato har en høytid, bruk det som inspirasjon.`,
      `- Inkluder gjerne 1-2 "ikke-produkt" innlegg (bak kulissene, takk-til-kunder, etc.).`,
      `- Skriv bildetekster på norsk (bokmål). Returner gyldig JSON.`,
    ].join("\n");
  }

  return [
    `You are planning a week's worth of Instagram content for ${args.bakeryName}, a bakery.`,
    ``,
    `Voice and style (follow closely):`,
    voice,
    ``,
    `Bakery catalog (pick products from this list — use the name verbatim):`,
    catalogList,
    ``,
    `Recent posts (do not repeat these themes):`,
    recentList,
    ``,
    `Dates to plan for:`,
    calendarList,
    ``,
    `Guidelines:`,
    `- Produce exactly 7 posts, one per date in the given order.`,
    `- Vary products and themes across the week — do not repeat the same product.`,
    `- Adapt some posts to the day of week (weekend = more reflective, weekdays = more practical).`,
    `- If a date has a holiday, lean into it.`,
    `- Include 1-2 non-product posts (behind the scenes, thanks to customers, etc.) for variety.`,
    `- Write captions in English. Return valid JSON.`,
  ].join("\n");
}

function buildWeeklyPlanUserPrompt(args: WeeklyPlanInputs): string {
  if (args.language === "nb") {
    return `Lag en innholdsplan for uken ${args.week[0]?.date ?? ""} til ${args.week[args.week.length - 1]?.date ?? ""}.`;
  }
  return `Build the content plan for the week of ${args.week[0]?.date ?? ""} to ${args.week[args.week.length - 1]?.date ?? ""}.`;
}

/**
 * Generate a 7-post content plan for a target week.
 *
 * No prompt caching: see comment in router. We may add it once we have data
 * on whether users actually run multiple plans per session.
 */
export async function generateWeeklyPlan(inputs: WeeklyPlanInputs): Promise<GenerationResult<GeneratedWeeklyPlan>> {
  const client = requireClaudeClient();

  const response = await client.messages.parse({
    model:      CLAUDE_MODEL,
    max_tokens: WEEKLY_PLAN_MAX_OUTPUT_TOKENS,
    system:     buildWeeklyPlanSystemPrompt(inputs),
    messages: [
      { role: "user", content: buildWeeklyPlanUserPrompt(inputs) },
    ],
    output_config: {
      format: zodOutputFormat(weeklyPlanSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude returned unparseable output");
  }

  return {
    data: response.parsed_output,
    usage: {
      inputTokens:               response.usage.input_tokens,
      outputTokens:              response.usage.output_tokens,
      cacheReadInputTokens:      response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens:  response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

// ─── Brand voice analysis ────────────────────────────────────────────────────

/**
 * Schema for the brand voice analysis result. The description is a written
 * profile of the bakery's voice (used as system prompt context for future
 * caption generation). The exampleCaptions field is the model's picks of
 * which input captions best exemplify the voice — useful for the UI to
 * show the user "Claude thinks these are most representative of your voice."
 */
const brandVoiceSchema = z.object({
  voiceDescription: z.string().describe("2-3 paragraph description of the bakery's distinctive Instagram voice. Focus on tone, sentence structure, vocabulary patterns, emoji usage, how they describe products, and how they address readers. NOT a summary of what they bake — a description of HOW they write."),
  exampleCaptions:  z.array(z.string()).describe("3 to 5 captions from the input list that best exemplify the voice. Return them verbatim, exactly as provided in the input."),
});

export type GeneratedBrandVoice = z.infer<typeof brandVoiceSchema>;

export interface BrandVoiceInputs {
  bakeryName: string;
  language:   "en" | "nb";
  /** Past captions, ordered newest-first. Should be ≥ MIN_CAPTIONS_FOR_VOICE_ANALYSIS. */
  captions:   string[];
}

function buildBrandVoiceSystemPrompt(language: "en" | "nb"): string {
  if (language === "nb") {
    return [
      `Du analyserer en bakers tidligere Instagram-bildetekster for å trekke ut deres særpregede stemme og skrivestil.`,
      `Resultatet brukes som kontekst for å generere nye bildetekster i samme stemme.`,
      ``,
      `Fokuser på HVORDAN de skriver, ikke HVA de bakker:`,
      `- Tone (varm/profesjonell/leken/etc.)`,
      `- Setningsstruktur og lengde`,
      `- Tilbakevendende vokabular eller faste fraser`,
      `- Emojibruk-mønstre`,
      `- Hvordan de beskriver produkter (sansebasert? historisk? emosjonelt?)`,
      `- Hvordan de henvender seg til leseren (du, vi, vår)`,
      ``,
      `Skriv stemmebeskrivelsen på norsk (bokmål). Eksempelteksten skal returneres ordrett som angitt.`,
      `Returner alltid gyldig JSON som passer skjemaet.`,
    ].join("\n");
  }
  return [
    `You analyze a bakery's past Instagram captions to extract their distinctive voice and writing style.`,
    `Your output will be used as context for generating new captions in that voice.`,
    ``,
    `Focus on HOW they write, not WHAT they bake:`,
    `- Tone (warm/professional/playful/etc.)`,
    `- Sentence structure and length`,
    `- Recurring vocabulary or signature phrases`,
    `- Emoji usage patterns`,
    `- How they describe products (sensory? historical? emotional?)`,
    `- How they address readers (you, we, our)`,
    ``,
    `Write the voice description in English. Return example captions verbatim as provided.`,
    `Always return valid JSON matching the schema.`,
  ].join("\n");
}

function buildBrandVoiceUserPrompt(args: BrandVoiceInputs): string {
  const header = args.language === "nb"
    ? `Her er nylige bildetekster fra ${args.bakeryName}:`
    : `Here are recent captions from ${args.bakeryName}:`;

  // Number the captions so the model can refer to them and pick exemplars
  // without ambiguity. Trim each to keep total input bounded.
  const numbered = args.captions
    .map((c, i) => `[${i + 1}]\n${c.trim()}`)
    .join("\n\n---\n\n");

  return `${header}\n\n${numbered}`;
}

/**
 * Call Claude to analyze a bakery's voice from past captions.
 *
 * Caller is responsible for filtering input to a reasonable size (we
 * recommend ~20 most-recent captions). The function itself doesn't
 * enforce a cap; that's a router concern.
 */
export async function learnBrandVoice(inputs: BrandVoiceInputs): Promise<GenerationResult<GeneratedBrandVoice>> {
  const client = requireClaudeClient();

  const response = await client.messages.parse({
    model:      CLAUDE_MODEL,
    max_tokens: BRAND_VOICE_MAX_OUTPUT_TOKENS,
    system:     buildBrandVoiceSystemPrompt(inputs.language),
    messages: [
      { role: "user", content: buildBrandVoiceUserPrompt(inputs) },
    ],
    output_config: {
      format: zodOutputFormat(brandVoiceSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude returned unparseable output");
  }

  return {
    data: response.parsed_output,
    usage: {
      inputTokens:               response.usage.input_tokens,
      outputTokens:              response.usage.output_tokens,
      cacheReadInputTokens:      response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens:  response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
