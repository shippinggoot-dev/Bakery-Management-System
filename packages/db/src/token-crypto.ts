import crypto from "crypto";

/**
 * AES-256-GCM at-rest encryption for third-party API tokens stored in
 * shopify_settings, email_settings, and instagram_connections.
 *
 * Storage format: `v1.{base64url(iv)}.{base64url(tag)}.{base64url(ciphertext)}`.
 * The `v1.` prefix is a versioning hook for future algorithm migrations
 * (e.g. algorithm change) without a schema change.
 *
 * Required env var:
 *   TOKEN_ENCRYPTION_KEY — 32 random bytes hex-encoded (64 chars).
 *   Generate with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Optional env var:
 *   TOKEN_ENCRYPTION_KEY_PREVIOUS — the prior key (same format) used during
 *   rotation. When present, decryption is tried with the current key first
 *   and falls back to the previous one on auth-tag failure. New writes
 *   ALWAYS use the current key. Once all rows have been re-encrypted with
 *   the new key (run `packages/scripts/src/rotate-encrypted-tokens.ts`),
 *   this env var can be unset.
 *
 * Fail-closed by design. If the (current) key is missing or malformed,
 * the first encrypt/decrypt call throws. Silently writing plaintext (the
 * rate-limit fail-open pattern) would be worse here: it would defeat the
 * protection we're paying for without anyone noticing.
 */

const VERSION = "v1";
const ALGO    = "aes-256-gcm";
const IV_LEN  = 12;
const TAG_LEN = 16;

let currentKeyCache:  Buffer | null = null;
let previousKeyCache: Buffer | null | undefined;  // undefined = not yet checked

function parseKey(raw: string, envName: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`${envName} must be 32 bytes hex-encoded (64 hex chars).`);
  }
  return Buffer.from(raw, "hex");
}

function getCurrentKey(): Buffer {
  if (currentKeyCache) return currentKeyCache;
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  currentKeyCache = parseKey(raw, "TOKEN_ENCRYPTION_KEY");
  return currentKeyCache;
}

function getPreviousKey(): Buffer | null {
  if (previousKeyCache !== undefined) return previousKeyCache;
  const raw = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  previousKeyCache = raw ? parseKey(raw, "TOKEN_ENCRYPTION_KEY_PREVIOUS") : null;
  return previousKeyCache;
}

/** Encrypt a plaintext token to the v1 storage format. */
export function encryptToken(plain: string): string {
  const key    = getCurrentKey();
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct     = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/**
 * Decrypt a v1 storage string. Throws if the input is plaintext, in an
 * unknown format, or fails authentication.
 *
 * During key rotation the current key is tried first; if it fails the
 * GCM auth tag check (wrong key), the previous key is tried as a fallback.
 * GCM's authenticated decryption guarantees a wrong key cannot return
 * garbage — it either decrypts cleanly or throws.
 */
export function decryptToken(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(
      "decryptToken: stored value is not in encrypted v1 format. " +
      "Run packages/scripts/src/encrypt-existing-tokens.ts against this database first.",
    );
  }
  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const iv  = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct  = Buffer.from(ctB64, "base64url");
  if (iv.length  !== IV_LEN)  throw new Error("decryptToken: bad IV length");
  if (tag.length !== TAG_LEN) throw new Error("decryptToken: bad tag length");

  // Try the current key first.
  try {
    return decryptWithKey(getCurrentKey(), iv, tag, ct);
  } catch (currentErr) {
    // If a previous key is configured, try it as a rotation fallback.
    const prev = getPreviousKey();
    if (!prev) throw currentErr;
    return decryptWithKey(prev, iv, tag, ct);
  }
}

function decryptWithKey(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Cheap prefix check — used by the migration script to skip already-encrypted rows. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(VERSION + ".");
}
