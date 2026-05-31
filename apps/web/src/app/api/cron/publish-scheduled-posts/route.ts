/**
 * Cron worker — publishes scheduled Instagram drafts that have reached their
 * scheduledFor time. Not wired to any automatic trigger yet (no entry in
 * vercel.json), so this only fires when manually invoked with the
 * CRON_SECRET header. When ready to go live, add this to vercel.json:
 *
 *   {
 *     "crons": [
 *       { "path": "/api/cron/publish-scheduled-posts", "schedule": "* * * * *" }
 *     ]
 *   }
 *
 * Concurrency safety: each due draft is atomically claimed by flipping its
 * status from "scheduled" to "publishing" in a single UPDATE...RETURNING.
 * If two cron invocations overlap, only one wins the row; the other sees
 * no rows returned and skips.
 *
 * Retry policy: failed publishes are rescheduled with exponential backoff
 * (5min, 25min) up to MAX_RETRIES attempts before being marked "failed".
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { db, instagramDrafts } from "@bakery/db";
import { publishToInstagram } from "@bakery/api/lib/instagram-publish";

export const dynamic = "force-dynamic";
// Allow up to 60s — publishing a batch of drafts can chain several Graph
// API calls, each of which can take a few seconds.
export const maxDuration = 60;

const MAX_RETRIES = 2;
const BACKOFF_MINUTES = [5, 25]; // index = retryCount before this attempt

/**
 * Auth — Vercel cron requests include `Authorization: Bearer ${CRON_SECRET}`
 * when CRON_SECRET is set in env. We accept the same header for manual
 * testing. If CRON_SECRET is unset (local dev), the endpoint is open —
 * acceptable because the worker is idempotent and only acts on the user's
 * own data.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // Find due drafts. We do this in two passes:
  //   1. SELECT all rows that look due (read-only).
  //   2. For each, atomically claim it by flipping status to "publishing".
  //
  // The atomic claim is what prevents double-publish if two cron runs overlap.
  const due = await db.query.instagramDrafts.findMany({
    where: and(
      eq(instagramDrafts.status, "scheduled"),
      lte(instagramDrafts.scheduledFor, now),
    ),
    limit: 50, // safety cap; if more than 50 are due, next tick picks up the rest
  });

  const results: Array<{
    id:       string;
    outcome:  "published" | "retry" | "failed";
    error?:   string;
  }> = [];

  for (const draft of due) {
    // Atomic claim — only proceed if we can flip "scheduled" → "publishing"
    const [claimed] = await db
      .update(instagramDrafts)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(and(
        eq(instagramDrafts.id, draft.id),
        eq(instagramDrafts.status, "scheduled"),
      ))
      .returning();

    if (!claimed) continue; // Another worker beat us to it

    if (!claimed.imageUrl || !claimed.caption) {
      // Misconfigured draft — can't publish. Fail it permanently.
      await db
        .update(instagramDrafts)
        .set({
          status:       "failed",
          errorMessage: "Draft is missing image or caption.",
          updatedAt:    new Date(),
        })
        .where(eq(instagramDrafts.id, claimed.id));
      results.push({ id: claimed.id, outcome: "failed", error: "missing fields" });
      continue;
    }

    const result = await publishToInstagram({
      ownerId:  claimed.ownerId,
      imageUrl: claimed.imageUrl,
      caption:  claimed.caption,
    });

    if (result.status === "posted") {
      await db
        .update(instagramDrafts)
        .set({
          status:       "published",
          igMediaId:    result.igMediaId,
          publishedAt:  new Date(),
          errorMessage: null,
          updatedAt:    new Date(),
        })
        .where(eq(instagramDrafts.id, claimed.id));
      results.push({ id: claimed.id, outcome: "published" });
      continue;
    }

    // Failed — decide whether to retry or give up.
    const attemptsMade = (claimed.retryCount ?? 0) + 1;
    if (attemptsMade > MAX_RETRIES) {
      await db
        .update(instagramDrafts)
        .set({
          status:       "failed",
          retryCount:   attemptsMade,
          errorMessage: result.errorMessage,
          updatedAt:    new Date(),
        })
        .where(eq(instagramDrafts.id, claimed.id));
      results.push({ id: claimed.id, outcome: "failed", error: result.errorMessage ?? undefined });
    } else {
      const backoffMins = BACKOFF_MINUTES[attemptsMade - 1] ?? 25;
      const nextRunAt   = new Date(Date.now() + backoffMins * 60 * 1000);
      await db
        .update(instagramDrafts)
        .set({
          status:        "scheduled",
          scheduledFor:  nextRunAt,
          retryCount:    attemptsMade,
          errorMessage:  result.errorMessage,
          updatedAt:     new Date(),
        })
        .where(eq(instagramDrafts.id, claimed.id));
      results.push({ id: claimed.id, outcome: "retry", error: result.errorMessage ?? undefined });
    }
  }

  return NextResponse.json({
    processedAt: now.toISOString(),
    processed:   results.length,
    results,
  });
}
