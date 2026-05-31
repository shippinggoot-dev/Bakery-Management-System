/**
 * Cost calculation for Anthropic API usage.
 *
 * Pricing (per 1M tokens, Sonnet 4.6, as of skill cache 2026-05-26):
 *   - Input:        $3.00
 *   - Output:      $15.00
 *   - Cache write:  1.25× input price = $3.75 (5-minute TTL)
 *   - Cache read:   0.10× input price = $0.30
 *
 * If the model is ever swapped (e.g. to Haiku for cheaper or Opus for higher
 * quality), update CLAUDE_MODEL in ai-client.ts AND the rates here together —
 * they're coupled because the per-token price is model-specific.
 */

/** Per-million-token prices in USD, Sonnet 4.6 */
const PRICE_INPUT_PER_MTOK         = 3.00;
const PRICE_OUTPUT_PER_MTOK        = 15.00;
const PRICE_CACHE_WRITE_PER_MTOK   = PRICE_INPUT_PER_MTOK * 1.25;  // $3.75
const PRICE_CACHE_READ_PER_MTOK    = PRICE_INPUT_PER_MTOK * 0.10;  // $0.30

export interface ClaudeUsage {
  /** Tokens billed at full input price (not cached, not in cache) */
  inputTokens:               number;
  /** Tokens served from cache at 0.1× input price */
  cacheReadInputTokens:      number;
  /** Tokens written to cache at 1.25× input price */
  cacheCreationInputTokens:  number;
  /** Output tokens billed at output price */
  outputTokens:              number;
}

/**
 * Compute the total cost of a single Claude API call in cents (with
 * sub-cent precision). The DB column `ai_usage.cost_cents` is numeric(10,4)
 * so up to 4 decimal places of cents are preserved.
 */
export function calculateCostCents(usage: ClaudeUsage): number {
  const usd =
    (usage.inputTokens              / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (usage.cacheReadInputTokens     / 1_000_000) * PRICE_CACHE_READ_PER_MTOK +
    (usage.cacheCreationInputTokens / 1_000_000) * PRICE_CACHE_WRITE_PER_MTOK +
    (usage.outputTokens             / 1_000_000) * PRICE_OUTPUT_PER_MTOK;
  return usd * 100;
}
