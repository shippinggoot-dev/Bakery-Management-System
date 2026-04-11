import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../../apps/web/.env.local") });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false is required for Supabase's connection pooler (pgBouncer)
const client = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

export const db = drizzle(client, { schema });
export type Database = typeof db;
