import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// prepare: false is required for Supabase's connection pooler (pgBouncer).
// max: 1 keeps connection count low in serverless environments where each
// function instance is short-lived. idle_timeout and connect_timeout ensure
// we don't hang waiting for a stale or unreachable connection.
const client = postgres(process.env.DATABASE_URL, {
  prepare:         false,
  max:             1,
  idle_timeout:    20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
