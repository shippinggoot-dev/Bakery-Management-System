/**
 * One-off migration: encrypt existing plaintext tokens in shopify_settings,
 * email_settings, and instagram_connections.
 *
 * Run this ONCE per environment before deploying the code that requires
 * encrypted-only reads. Idempotent: re-running skips rows already in v1
 * format.
 *
 * Usage:
 *   # Make sure TOKEN_ENCRYPTION_KEY and DATABASE_URL are set in .env first.
 *   pnpm --filter @bakery/scripts encrypt-tokens
 *
 * Deploy sequence:
 *   1. Generate TOKEN_ENCRYPTION_KEY and set it in Vercel (Production + Preview)
 *      AND in your local .env (must match Vercel — same value, same environment).
 *   2. Run this script against the same database the production deploy will
 *      read from (DATABASE_URL in .env should point there).
 *   3. Verify the output — every existing token row should now show as encrypted.
 *   4. Push the deploy. Production code now reads/writes via encryptToken/
 *      decryptToken; legacy plaintext reads will throw a clear error.
 *
 * If something goes wrong: the script does not delete the original plaintext,
 * but DOES overwrite the column. There is no automatic rollback. Take a
 * Supabase backup (Database → Backups) BEFORE running.
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import {
  db,
  shopifySettings,
  emailSettings,
  instagramConnections,
  encryptToken,
  isEncrypted,
} from "@bakery/db";

interface TableStats {
  scanned:    number;
  encrypted:  number;
  alreadyOk:  number;
  emptyNull:  number;
}

function newStats(): TableStats {
  return { scanned: 0, encrypted: 0, alreadyOk: 0, emptyNull: 0 };
}

function logStats(name: string, s: TableStats) {
  console.log(
    `  ${name.padEnd(28)} scanned=${s.scanned}  ` +
    `encrypted=${s.encrypted}  already=${s.alreadyOk}  empty=${s.emptyNull}`,
  );
}

async function migrateShopifySettings(): Promise<TableStats> {
  const stats = newStats();
  const rows = await db.query.shopifySettings.findMany({
    columns: { id: true, accessToken: true, webhookSecret: true },
  });
  for (const row of rows) {
    stats.scanned++;
    const updates: { accessToken?: string; webhookSecret?: string } = {};

    if (!row.accessToken) {
      // accessToken is NOT NULL in the schema, so this is unusual; log it.
      console.warn(`  ! shopify_settings ${row.id}: accessToken is empty`);
    } else if (isEncrypted(row.accessToken)) {
      // Skip
    } else {
      updates.accessToken = encryptToken(row.accessToken);
    }

    if (!row.webhookSecret) {
      // Optional column — nothing to do
    } else if (isEncrypted(row.webhookSecret)) {
      // Skip
    } else {
      updates.webhookSecret = encryptToken(row.webhookSecret);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(shopifySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(shopifySettings.id, row.id));
      stats.encrypted++;
      console.log(`  + shopify_settings ${row.id}: encrypted ${Object.keys(updates).join(", ")}`);
    } else {
      stats.alreadyOk++;
    }
  }
  return stats;
}

async function migrateEmailSettings(): Promise<TableStats> {
  const stats = newStats();
  const rows = await db.query.emailSettings.findMany({
    columns: { id: true, resendApiKey: true },
  });
  for (const row of rows) {
    stats.scanned++;
    if (!row.resendApiKey) {
      stats.emptyNull++;
      continue;
    }
    if (isEncrypted(row.resendApiKey)) {
      stats.alreadyOk++;
      continue;
    }
    await db.update(emailSettings)
      .set({ resendApiKey: encryptToken(row.resendApiKey), updatedAt: new Date() })
      .where(eq(emailSettings.id, row.id));
    stats.encrypted++;
    console.log(`  + email_settings ${row.id}: encrypted resendApiKey`);
  }
  return stats;
}

async function migrateInstagramConnections(): Promise<TableStats> {
  const stats = newStats();
  const rows = await db.query.instagramConnections.findMany({
    columns: { id: true, accessToken: true },
  });
  for (const row of rows) {
    stats.scanned++;
    if (!row.accessToken) {
      stats.emptyNull++;
      continue;
    }
    if (isEncrypted(row.accessToken)) {
      stats.alreadyOk++;
      continue;
    }
    await db.update(instagramConnections)
      .set({ accessToken: encryptToken(row.accessToken), updatedAt: new Date() })
      .where(eq(instagramConnections.id, row.id));
    stats.encrypted++;
    console.log(`  + instagram_connections ${row.id}: encrypted accessToken`);
  }
  return stats;
}

async function main() {
  // Fail fast if the key isn't set. encryptToken throws with a clear message,
  // but probing here lets us refuse to start instead of partially migrating.
  try {
    encryptToken("self-check");
  } catch (err) {
    console.error("Refusing to start migration:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("Encrypting existing third-party tokens at rest...");
  console.log("");

  const shopify   = await migrateShopifySettings();
  const email     = await migrateEmailSettings();
  const instagram = await migrateInstagramConnections();

  console.log("");
  console.log("Summary:");
  logStats("shopify_settings",      shopify);
  logStats("email_settings",        email);
  logStats("instagram_connections", instagram);
  console.log("");
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
