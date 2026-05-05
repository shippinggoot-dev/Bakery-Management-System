import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@bakery/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Keep-alive endpoint — runs SELECT 1 to keep the Supabase Postgres
 * instance warm. Hit this every 5 minutes from an external pinger
 * (UptimeRobot, GitHub Actions schedule, etc.) to prevent cold-start
 * timeouts on the free tier.
 *
 * Returns 200 with { ok: true } when the DB responds, or 503 with
 * { ok: false, error } if the query fails (which is informative for
 * the pinger so it can alert).
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 },
    );
  }
}
