/**
 * Reusable Zod helpers for input validation across tRPC routers.
 *
 * Two goals:
 *   1. Bound user input so a single mutation cannot fill the database
 *      with arbitrarily large payloads (storage DoS).
 *   2. Reject malformed numeric strings (NaN, Infinity, negative, exponent
 *      notation) BEFORE they reach downstream `parseFloat` calls that
 *      silently produce garbage values in cost / quantity calculations.
 *
 * Bounds rationale:
 *   - 255 chars = canonical short text limit (matches SQL VARCHAR(255))
 *   - 320 chars = RFC-compliant email upper bound
 *   - 2000 chars = generous "notes" / "description" cap
 *   - 10000 chars = recipe instructions can be long
 */

import { z } from "zod";

// ─── Length-capped text schemas ──────────────────────────────────────────────

/** Short label, max 255 chars (matches typical VARCHAR limit). */
export const shortText = (opts?: { min?: number }) =>
  z.string().min(opts?.min ?? 0).max(255);

/** Free-text notes / descriptions, max 2000 chars. */
export const longText = () => z.string().max(2000);

/** Recipe instructions etc — up to 10 KB. */
export const veryLongText = () => z.string().max(10_000);

/** Email — at most the RFC ceiling. */
export const emailField = () => z.string().email().max(320);

/** Phone number — generous, allows international formats. */
export const phoneField = () => z.string().max(50);

/** Free-text search query — capped to prevent slow LIKE scans. */
export const searchQuery = () => z.string().max(200);

// ─── Numeric strings ─────────────────────────────────────────────────────────
//
// Prices and quantities are stored as TEXT in Postgres to preserve decimal
// precision. We accept them as strings on the wire but constrain the format
// so downstream parseFloat() can't produce NaN, Infinity, or negative
// numbers that corrupt cost-of-goods calculations.

/** Non-negative decimal: 0, 5, 12.34, 1000.0 — but NOT "-5", "NaN", "1e10", "abc". */
export const nonNegativeDecimalString = () =>
  z.string().regex(/^\d+(\.\d+)?$/, "Must be a non-negative decimal number");

/** Positive decimal (excludes 0): 0.01, 5, 12.34 — typically for quantities/prices. */
export const positiveDecimalString = () =>
  z.string().regex(/^(?:0*\.0*[1-9]\d*|[1-9]\d*(?:\.\d+)?)$/, "Must be a positive decimal number");

// ─── LIKE-injection helper ───────────────────────────────────────────────────

/**
 * Strip SQL LIKE wildcards (% and _) from user-supplied search text.
 * The Drizzle / postgres binding is already parameterised, so this isn't
 * about SQL injection — it's about preventing a user from typing
 * "%%%%%a%%%%" which forces quadratic LIKE scans on large tables.
 */
export function stripLikeWildcards(s: string): string {
  return s.replace(/[%_]/g, "");
}
