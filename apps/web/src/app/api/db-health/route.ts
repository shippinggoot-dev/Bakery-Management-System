import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@bakery/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Diagnostics probe — runs SELECT 1 and reports timing in milliseconds.
 * Lets the diagnostics page distinguish "DB is slow" from "everything
 * around the DB is slow" (auth, network, serverless cold start).
 *
 * Gated by DIAGNOSTICS_ENABLED env var so it can't be used to fingerprint
 * the deployment when diagnostics are off.
 */
export async function GET() {
  if (process.env.DIAGNOSTICS_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const totalStart = Date.now();
  let dbDurationMs = 0;
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    dbDurationMs = Date.now() - dbStart;
    return NextResponse.json({
      ok: true,
      dbDurationMs,
      totalDurationMs: Date.now() - totalStart,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        dbDurationMs,
        totalDurationMs: Date.now() - totalStart,
        error: err instanceof Error ? err.message : "Unknown error",
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
