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
import { and, eq, lte, sql } from "drizzle-orm";
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
 * testing.
 *
 * Fail-closed policy: in production, CRON_SECRET MUST be set. If it isn't,
 * we refuse every request rather than risk exposing a world-callable
 * publishing endpoint. Local dev (NODE_ENV !== "production") is the only
 * place an unset secret is tolerated.
 */
type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

function authorized(req: NextRequest): AuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[cron/publish-scheduled-posts] CRON_SECRET is not set in production. " +
        "Refusing all requests. Set CRON_SECRET in Vercel env to enable the cron.",
      );
      return { ok: false, status: 503, message: "Cron is not configured." };
    }
    return { ok: true }; // dev convenience only
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) {
    return new NextResponse(auth.message, { status: auth.status });
  }

  const now = new Date();

  // ── Sweeper ────────────────────────────────────────────────────────────────
  // Recover rows that got stuck in "publishing" because a previous invocation
  // crashed mid-flight (the function timed out, the process was killed, an
  // unhandled exception escaped the per-row try/catch, etc.). Anything still
  // "publishing" after 5 minutes is definitely orphaned — Vercel's
  // maxDuration on this route is 60s, so no legitimate publish takes that long.
  const swept = await db
    .update(instagramDrafts)
    .set({ status: "scheduled", updatedAt: new Date() })
    .where(and(
      eq(instagramDrafts.status, "publishing"),
      lte(instagramDrafts.updatedAt, sql`now() - interval '5 minutes'`),
    ))
    .returning({ id: instagramDrafts.id });
  if (swept.length > 0) {
    console.warn(
      `[cron/publish-scheduled-posts] Swept ${swept.length} stuck "publishing" row(s) back to "scheduled".`,
      swept.map((r) => r.id),
    );
  }

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
    outcome:  "published" | "retry" | "failed" | "error";
    error?:   string;
  }> = [];

  for (const draft of due) {
    // Per-row try/catch — an exception on one row (network blip, Graph
    // outage, db hiccup) must not abort the whole batch and must not leave
    // the row stuck in "publishing".
    let claimedId: string | null = null;
    let claimedRetryCount = 0;
    try {
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
      claimedId = claimed.id;
      claimedRetryCount = claimed.retryCount ?? 0;

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[cron/publish-scheduled-posts] Unhandled error for draft ${claimedId ?? draft.id}:`,
        err,
      );
      if (claimedId) {
        // Revert claim so the next tick (or sweeper) will retry. Bump
        // retryCount so a poisoned row eventually gives up via the normal
        // MAX_RETRIES path on subsequent passes.
        try {
          await db
            .update(instagramDrafts)
            .set({
              status:       "scheduled",
              retryCount:   claimedRetryCount + 1,
              errorMessage: msg,
              updatedAt:    new Date(),
            })
            .where(eq(instagramDrafts.id, claimedId));
        } catch (revertErr) {
          // If even the revert fails, the sweeper at the top of the next
          // invocation is our backstop.
          console.error(
            `[cron/publish-scheduled-posts] Revert failed for ${claimedId}:`,
            revertErr,
          );
        }
      }
      results.push({ id: claimedId ?? draft.id, outcome: "error", error: msg });
    }
  }

  return NextResponse.json({
    processedAt: now.toISOString(),
    swept:       swept.length,
    processed:   results.length,
    results,
  });
}
