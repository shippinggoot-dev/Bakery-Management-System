import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, sql, and, gte } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { queryMetrics } from "@bakery/db";

/**
 * Diagnostics is server-gated by the DIAGNOSTICS_ENABLED env var.
 * Even if a client guesses the URL, queries return empty unless this
 * is explicitly turned on in the deployment.
 */
function assertEnabled() {
  if (process.env.DIAGNOSTICS_ENABLED !== "true") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Diagnostics is disabled.",
    });
  }
}

export const diagnosticsRouter = createTRPCRouter({
  /** Returns recent slow/failed procedure calls. */
  recent: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).default(100),
          sinceHours: z.number().int().min(1).max(168).default(24),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      assertEnabled();
      const { limit = 100, sinceHours = 24 } = input ?? {};
      const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
      return ctx.db
        .select()
        .from(queryMetrics)
        .where(gte(queryMetrics.createdAt, since))
        .orderBy(desc(queryMetrics.createdAt))
        .limit(limit);
    }),

  /** Per-procedure aggregates (count, p50, p95, error rate). */
  summary: publicProcedure
    .input(
      z
        .object({
          sinceHours: z.number().int().min(1).max(168).default(24),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      assertEnabled();
      const { sinceHours = 24 } = input ?? {};
      const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

      const rows = await ctx.db
        .select({
          procedure: queryMetrics.procedure,
          total:     sql<number>`count(*)::int`,
          errors:    sql<number>`count(*) filter (where ${queryMetrics.status} = 'error')::int`,
          p50:       sql<number>`coalesce(percentile_cont(0.5) within group (order by ${queryMetrics.durationMs}), 0)::int`,
          p95:       sql<number>`coalesce(percentile_cont(0.95) within group (order by ${queryMetrics.durationMs}), 0)::int`,
          maxMs:     sql<number>`coalesce(max(${queryMetrics.durationMs}), 0)::int`,
        })
        .from(queryMetrics)
        .where(and(gte(queryMetrics.createdAt, since)))
        .groupBy(queryMetrics.procedure)
        .orderBy(desc(sql`max(${queryMetrics.durationMs})`));

      return rows;
    }),

  /** Clear server-side metrics older than `keepLastHours` hours. */
  clear: publicProcedure
    .input(z.object({ keepLastHours: z.number().int().min(0).max(720).default(0) }))
    .mutation(async ({ ctx, input }) => {
      assertEnabled();
      const cutoff = new Date(Date.now() - input.keepLastHours * 60 * 60 * 1000);
      await ctx.db.execute(sql`DELETE FROM query_metrics WHERE created_at < ${cutoff}`);
      return { success: true };
    }),
});
