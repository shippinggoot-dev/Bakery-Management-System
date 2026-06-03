/**
 * Server-side image validation for uploaded media URLs.
 *
 * Defense in depth on top of the client-side MIME/size checks in the
 * social composer (apps/web/src/app/social/page.tsx). The Supabase Storage
 * bucket policy is the real gate, but a bypass of the client check would
 * otherwise allow malformed or non-image files to flow through to Meta.
 *
 * Two checks:
 *   1. assertSupabaseImageUrl — cheap host/path allowlist. Run this on
 *      every save so user-controlled imageUrl values can't point at
 *      arbitrary external hosts (data:, file:, attacker-controlled origins).
 *      The previous Zod .url() was satisfied by all of those.
 *
 *   2. assertImageMagicBytes — fetches the first 16 bytes and verifies the
 *      file actually starts with JPEG/PNG/WebP magic numbers. Slower (one
 *      HTTPS round-trip per call), so run it before publishing rather than
 *      on every draft save.
 */

const VALID_BUCKET_PATH_PREFIX = "/storage/v1/object/public/instagram-media/";

function getSupabaseHost(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is malformed.");
  }
}

/**
 * Verify that a stored imageUrl points at this project's Supabase Storage
 * bucket. Throws with a user-facing message if it doesn't.
 *
 * Accepts only:
 *   - https protocol
 *   - hostname matching NEXT_PUBLIC_SUPABASE_URL
 *   - path under /storage/v1/object/public/instagram-media/
 */
export function assertSupabaseImageUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid image URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Image URL must use https://.");
  }
  if (url.hostname !== getSupabaseHost()) {
    throw new Error("Image must be uploaded via the in-app picker.");
  }
  if (!url.pathname.startsWith(VALID_BUCKET_PATH_PREFIX)) {
    throw new Error("Image path is not in the instagram-media bucket.");
  }
  return url;
}

/**
 * Fetch the first few bytes of an image and verify it actually starts
 * with JPEG/PNG/WebP magic numbers. Skip the check if assertSupabaseImageUrl
 * hasn't already passed — this function does NOT validate the host.
 *
 * Why magic bytes: a `.jpg` file with the right MIME type can still
 * contain anything. Without this check, a tenant could upload a fake
 * "image" containing arbitrary bytes (CSV-stuffed-into-JPEG, etc).
 * Meta would reject it, but we'd rather give the user a clear error
 * before the publish attempt is even made.
 */
export async function assertImageMagicBytes(url: URL): Promise<"jpeg" | "png" | "webp"> {
  const res = await fetch(url.toString(), {
    headers: { Range: "bytes=0-15" },
    signal: AbortSignal.timeout(10_000),
  });
  // Servers MAY ignore Range and return 200 with the full body; both are fine.
  if (!res.ok && res.status !== 206) {
    throw new Error(`Could not fetch image for validation (HTTP ${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 12) {
    throw new Error("Image file is too small or empty.");
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  throw new Error("File is not a JPEG, PNG, or WebP image.");
}
