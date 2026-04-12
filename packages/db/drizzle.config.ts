import { config } from "dotenv";
import { resolve } from "path";
import type { Config } from "drizzle-kit";

config({ path: resolve(__dirname, "../../apps/web/.env.local") });

// Migrations use the Session Pooler (port 5432) — needed for DDL introspection.
// The runtime app uses the Transaction Pooler (port 6543) via DATABASE_URL.
const migrationUrl = process.env.MIGRATION_URL ?? process.env.DATABASE_URL!;

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
} satisfies Config;
