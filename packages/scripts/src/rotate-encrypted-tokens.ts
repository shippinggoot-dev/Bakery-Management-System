/**
 * Key rotation: re-encrypt every stored third-party token with the current
 * TOKEN_ENCRYPTION_KEY. Used after generating a new key and demoting the
 * old one to TOKEN_ENCRYPTION_KEY_PREVIOUS.
 *
 * How rotation works end-to-end:
 *   1. Generate a new key:
 *        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 *   2. Set the env so the app can still decrypt legacy rows during the
 *      transition. Both Vercel (Production + Preview) and your .env:
 *        TOKEN_ENCRYPTION_KEY_PREVIOUS=<the current key>
 *        TOKEN_ENCRYPTION_KEY=<the new key>
 *
 *   3. Deploy. The app now encrypts new writes with the new key and falls
 *      back to the previous one when decrypting older rows.
 *
 *   4. Run this script against the production database. It walks every
 *      encrypted column, decrypts (falling back as needed), and writes
 *      it back encrypted under the new key.
 *        pnpm --filter @bakery/scripts rotate-tokens
 *
 *   5. Once the script reports zero remaining rows that need rotation,
 *      remove TOKEN_ENCRYPTION_KEY_PREVIOUS from Vercel and .env. Deploy.
 *      The old key is now retired.
 *
 * Safety: the script processes one row at a time and only commits writes
 * that succeed. If decryption fails for ANY row, the script aborts so you
 * can investigate before continuing — partial rotation is recoverable;
 * silently dropping rows is not.
 *
 * Take a Supabase backup before running. Always.
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import {
  db,
  shopifySettings,
  emailSettings,
  instagramConnections,
  encryptToken,
  decryptToken,
} from "@bakery/db";

interface RotationStats {
  scanned:  number;
  rotated:  number;
  empty:    number;
  errors:   number;
}

function newStats(): RotationStats {
  return { scanned: 0, rotated: 0, empty: 0, errors: 0 };
}

function logStats(name: string, s: RotationStats) {
  console.log(
    `  ${name.padEnd(28)} scanned=${s.scanned}  ` +
    `rotated=${s.rotated}  empty=${s.empty}  errors=${s.errors}`,
  );
}

/**
 * Decrypt + re-encrypt a single column value. Returns the new ciphertext,
 * or null if the input was empty. Throws on decryption failure (caller
 * decides whether to abort or continue).
 */
function rotateValue(stored: string): string {
  const plain = decryptToken(stored);
  return encryptToken(plain);
}

async function rotateShopifySettings(): Promise<RotationStats> {
  const stats = newStats();
  const rows = await db.query.shopifySettings.findMany({
    columns: { id: true, accessToken: true, webhookSecret: true },
  });
  for (const row of rows) {
    stats.scanned++;
    const updates: { accessToken?: string; webhookSecret?: string } = {};
    try {
      if (row.accessToken) {
        updates.accessToken = rotateValue(row.accessToken);
      }
      if (row.webhookSecret) {
        updates.webhookSecret = rotateValue(row.webhookSecret);
      }
    } catch (err) {
      stats.errors++;
      console.error(`  ! shopify_settings ${row.id}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(shopifySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(shopifySettings.id, row.id));
      stats.rotated++;
    } else {
      stats.empty++;
    }
  }
  return stats;
}

async function rotateEmailSettings(): Promise<RotationStats> {
  const stats = newStats();
  const rows = await db.query.emailSettings.findMany({
    columns: { id: true, resendApiKey: true },
  });
  for (const row of rows) {
    stats.scanned++;
    if (!row.resendApiKey) { stats.empty++; continue; }
    try {
      const rotated = rotateValue(row.resendApiKey);
      await db.update(emailSettings)
        .set({ resendApiKey: rotated, updatedAt: new Date() })
        .where(eq(emailSettings.id, row.id));
      stats.rotated++;
    } catch (err) {
      stats.errors++;
      console.error(`  ! email_settings ${row.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return stats;
}

async function rotateInstagramConnections(): Promise<RotationStats> {
  const stats = newStats();
  const rows = await db.query.instagramConnections.findMany({
    columns: { id: true, accessToken: true },
  });
  for (const row of rows) {
    stats.scanned++;
    if (!row.accessToken) { stats.empty++; continue; }
    try {
      const rotated = rotateValue(row.accessToken);
      await db.update(instagramConnections)
        .set({ accessToken: rotated, updatedAt: new Date() })
        .where(eq(instagramConnections.id, row.id));
      stats.rotated++;
    } catch (err) {
      stats.errors++;
      console.error(`  ! instagram_connections ${row.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return stats;
}

async function main() {
  // Self-check: confirm both encrypt and decrypt work with the configured
  // env before scanning the database.
  try {
    const test = encryptToken("rotation-self-check");
    const back = decryptToken(test);
    if (back !== "rotation-self-check") {
      throw new Error("self-check round-trip mismatch");
    }
  } catch (err) {
    console.error("Refusing to start rotation:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (!process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS) {
    console.log(
      "Note: TOKEN_ENCRYPTION_KEY_PREVIOUS is not set. " +
      "Rotation will still work for rows already encrypted with the current " +
      "key, but if any row was encrypted under a different key it will be " +
      "reported as an error.\n",
    );
  }

  console.log("Rotating third-party token encryption to the current key...");
  console.log("");

  const shopify   = await rotateShopifySettings();
  const email     = await rotateEmailSettings();
  const instagram = await rotateInstagramConnections();

  console.log("");
  console.log("Summary:");
  logStats("shopify_settings",      shopify);
  logStats("email_settings",        email);
  logStats("instagram_connections", instagram);
  console.log("");

  const totalErrors = shopify.errors + email.errors + instagram.errors;
  if (totalErrors > 0) {
    console.error(`Completed with ${totalErrors} error(s). Investigate before retiring TOKEN_ENCRYPTION_KEY_PREVIOUS.`);
    process.exit(1);
  }
  console.log("Done. Safe to unset TOKEN_ENCRYPTION_KEY_PREVIOUS once the deploy with the new key reads cleanly.");
}

main().catch((err) => {
  console.error("Rotation failed:", err);
  process.exit(1);
});
