import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../../apps/web/.env.local") });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add your Supabase connection string to apps/web/.env.local"
  );
}

// prepare: false is required for Supabase's connection pooler (pgBouncer)
const client = postgres(process.env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
export type Database = typeof db;
