import crypto from "crypto";

/**
 * AES-256-GCM at-rest encryption for third-party API tokens stored in
 * shopify_settings, email_settings, and instagram_connections.
 *
 * Storage format: `v1.{base64url(iv)}.{base64url(tag)}.{base64url(ciphertext)}`.
 * The `v1.` prefix is a versioning hook for future algorithm migrations
 * (e.g. key rotation, algorithm change) without a schema change.
 *
 * Required env var:
 *   TOKEN_ENCRYPTION_KEY — 32 random bytes hex-encoded (64 chars).
 *   Generate with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Fail-closed by design. If the key is missing or malformed, the first
 * encrypt/decrypt call throws. Silently writing plaintext (the rate-limit
 * fail-open pattern) would be worse here: it would defeat the protection
 * we're paying for without anyone noticing.
 */

const VERSION = "v1";
const ALGO    = "aes-256-gcm";
const IV_LEN  = 12;
const TAG_LEN = 16;

let keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (keyCache) return keyCache;
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex chars).");
  }
  keyCache = Buffer.from(raw, "hex");
  return keyCache;
}

/** Encrypt a plaintext token to the v1 storage format. */
export function encryptToken(plain: string): string {
  const key    = getKey();
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct     = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/**
 * Decrypt a v1 storage string. Throws if the input is plaintext, in an
 * unknown format, or fails authentication. The error message points at
 * the migration script so a deploy-before-migrate mistake is recoverable.
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

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Cheap prefix check — used by the migration script to skip already-encrypted rows. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(VERSION + ".");
}
