import { z } from "zod";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { cakeOrders } from "@bakery/db";

export const salesRouter = createTRPCRouter({
  /**
   * Returns aggregated daily revenue, order counts, and top recipes
   * for the requested date range.
   */
  getDashboard: publicProcedure
    .input(
      z.object({
        /** ISO date string — start of range */
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        /** Number of days back (used if `from` is omitted — defaults to 30) */
        daysBack: z.number().min(1).max(365).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return emptyDashboard();

      const daysBack = input?.daysBack ?? 30;
      const from = input?.from ?? daysAgo(daysBack);

      const orders = await ctx.db.query.cakeOrders.findMany({
        where: and(
          eq(cakeOrders.ownerId, ctx.user.id),
          gte(cakeOrders.createdAt, new Date(from)),
        ),
        with: {
          recipe: { columns: { id: true, name: true } },
        },
        orderBy: [desc(cakeOrders.createdAt)],
        limit: 500,
      });

      // ── Daily revenue map ──────────────────────────────────────────────────
      const dailyMap = new Map<string, { revenue: number; orders: number }>();
      let totalRevenue = 0;
      let totalOrders  = 0;
      let paidOrders   = 0;
      let pendingOrders = 0;

      // Recipe revenue aggregation
      const recipeMap = new Map<string, { name: string; revenue: number; count: number }>();

      for (const o of orders) {
        const day      = new Date(o.createdAt).toISOString().slice(0, 10);
        const price    = o.salePrice ? parseFloat(o.salePrice) : 0;
        const qty      = parseFloat(o.quantity) || 1;
        const lineRev  = price * qty;

        // Daily
        const daily = dailyMap.get(day) ?? { revenue: 0, orders: 0 };
        daily.revenue += lineRev;
        daily.orders  += 1;
        dailyMap.set(day, daily);

        // Totals
        totalRevenue += lineRev;
        totalOrders  += 1;
        if (o.paymentStatus === "paid")    paidOrders++;
        if (o.paymentStatus === "pending" || o.paymentStatus === "unpaid") pendingOrders++;

        // By recipe
        if (o.recipe) {
          const key   = o.recipe.id;
          const entry = recipeMap.get(key) ?? { name: o.recipe.name, revenue: 0, count: 0 };
          entry.revenue += lineRev;
          entry.count   += qty;
          recipeMap.set(key, entry);
        }
      }

      // ── Fill in missing days with 0 ────────────────────────────────────────
      const dailySeries = fillDailyGaps(from, new Date().toISOString().slice(0, 10), dailyMap);

      // ── Top recipes ────────────────────────────────────────────────────────
      const topRecipes = [...recipeMap.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)
        .map((r) => ({ ...r, revenue: parseFloat(r.revenue.toFixed(2)) }));

      // ── Status breakdown ───────────────────────────────────────────────────
      const statusCounts: Record<string, number> = {};
      for (const o of orders) {
        statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      }

      return {
        totalRevenue:  parseFloat(totalRevenue.toFixed(2)),
        totalOrders,
        paidOrders,
        pendingOrders,
        averageOrderValue: totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0,
        dailySeries,
        topRecipes,
        statusCounts,
        from,
        to: new Date().toISOString().slice(0, 10),
      };
    }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyDashboard() {
  return {
    totalRevenue: 0, totalOrders: 0, paidOrders: 0, pendingOrders: 0,
    averageOrderValue: 0, dailySeries: [], topRecipes: [], statusCounts: {},
    from: daysAgo(30), to: new Date().toISOString().slice(0, 10),
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fillDailyGaps(
  from: string,
  to: string,
  map: Map<string, { revenue: number; orders: number }>
): { date: string; revenue: number; orders: number }[] {
  const series: { date: string; revenue: number; orders: number }[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    const day = cur.toISOString().slice(0, 10);
    const entry = map.get(day) ?? { revenue: 0, orders: 0 };
    series.push({ date: day, revenue: parseFloat(entry.revenue.toFixed(2)), orders: entry.orders });
    cur.setDate(cur.getDate() + 1);
  }
  return series;
}
