import { eq, and, gte, ne, desc, inArray, sql } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  todos,
  purchaseOrders,
  productionSchedules,
  cakeOrders,
  customerSales,
  wasteLogs,
  recipes,
} from "@bakery/db";
import { inventoryService } from "../services/inventory";

/** Monday 00:00:00 local time of the current ISO week. */
function currentWeekStart(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export const dashboardRouter = createTRPCRouter({
  /**
   * Everything needed to render the "Today" zone.
   * All five sub-queries run in parallel.
   */
  getTodaySummary: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;

    const todayIso = new Date().toISOString().slice(0, 10);

    const [openTasks, stockLevels, deliveries, batches] = await Promise.all([
      // All open tasks for count + first 3 titles
      ctx.db.query.todos.findMany({
        where: and(eq(todos.ownerId, ctx.user.id), eq(todos.completed, false)),
        columns: { id: true, title: true, dueDate: true },
        // Overdue first, then undated, then by creation
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      }),

      // Stock levels — reuse the inventory service (calculates from lots)
      inventoryService.getStockLevels(ctx.user.id),

      // Purchase orders with expected delivery = today
      ctx.db.query.purchaseOrders.findMany({
        where: and(
          eq(purchaseOrders.ownerId, ctx.user.id),
          inArray(purchaseOrders.status, ["sent", "confirmed"]),
          sql`DATE(${purchaseOrders.expectedDeliveryAt}) = CURRENT_DATE`,
        ),
        with: { supplier: { columns: { name: true } } },
        columns: { id: true, orderNumber: true, status: true },
      }),

      // Production schedule entries for today that aren't done/cancelled
      ctx.db.query.productionSchedules.findMany({
        where: and(
          eq(productionSchedules.ownerId, ctx.user.id),
          eq(productionSchedules.scheduledDate, todayIso),
          inArray(productionSchedules.status, ["planned", "in_progress"]),
        ),
        with: { recipe: { columns: { name: true } } },
        columns: { id: true, recipeName: true, shift: true, batchCount: true, status: true },
        orderBy: (ps, { asc }) => [asc(ps.shift)],
      }),
    ]);

    const alerts = stockLevels.filter((s) => s.status !== "ok");

    return {
      tasks: {
        count:  openTasks.length,
        titles: openTasks.slice(0, 3).map((t) => t.title),
      },
      stockAlerts: alerts.slice(0, 6).map((s) => ({
        ingredientId: s.ingredientId,
        name:         s.name,
        unit:         s.unit,
        currentStock: s.currentStock,
        status:       s.status,
      })),
      deliveriesToday: deliveries,
      batchesToday:    batches,
    };
  }),

  /**
   * Everything needed to render the "This week" KPI zone.
   * Revenue combines cake_orders (sale_price × qty) and customer_sales (POS).
   *
   * TODO: multi-currency — currently sums all values regardless of currency
   * and assumes NOK. When per-workspace currency is added, filter by currency
   * and/or convert before summing.
   */
  getWeekSummary: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;

    const weekStart = currentWeekStart();

    const [orderRevenueRows, posRevenueRows, orderCountRows, topSellerRows, wasteCountRows] =
      await Promise.all([
        // Revenue from bespoke cake orders that have a sale price set
        ctx.db
          .select({
            total: sql<string>`COALESCE(
              SUM(
                CAST(${cakeOrders.salePrice} AS numeric) *
                CAST(${cakeOrders.quantity}  AS numeric)
              ), 0
            )`,
          })
          .from(cakeOrders)
          .where(
            and(
              eq(cakeOrders.ownerId, ctx.user.id),
              gte(cakeOrders.createdAt, weekStart),
              ne(cakeOrders.status, "cancelled"),
              sql`${cakeOrders.salePrice} IS NOT NULL`,
            )
          ),

        // Revenue from walk-in POS sales (customer_sales)
        ctx.db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${customerSales.amount} AS numeric)), 0)`,
          })
          .from(customerSales)
          .where(
            and(
              eq(customerSales.ownerId, ctx.user.id),
              gte(customerSales.soldAt, weekStart),
            )
          ),

        // Non-cancelled order count this week
        ctx.db
          .select({ count: sql<string>`COUNT(*)` })
          .from(cakeOrders)
          .where(
            and(
              eq(cakeOrders.ownerId, ctx.user.id),
              gte(cakeOrders.createdAt, weekStart),
              ne(cakeOrders.status, "cancelled"),
            )
          ),

        // Top-selling recipe this week by quantity ordered
        ctx.db
          .select({
            recipeName: recipes.name,
            totalQty:   sql<string>`SUM(CAST(${cakeOrders.quantity} AS numeric))`,
          })
          .from(cakeOrders)
          .leftJoin(recipes, eq(cakeOrders.recipeId, recipes.id))
          .where(
            and(
              eq(cakeOrders.ownerId, ctx.user.id),
              gte(cakeOrders.createdAt, weekStart),
              ne(cakeOrders.status, "cancelled"),
              sql`${cakeOrders.recipeId} IS NOT NULL`,
            )
          )
          .groupBy(cakeOrders.recipeId, recipes.name)
          .orderBy(desc(sql`SUM(CAST(${cakeOrders.quantity} AS numeric))`))
          .limit(1),

        // Waste events this week (monetary value not available — see phase notes)
        ctx.db
          .select({ count: sql<string>`COUNT(*)` })
          .from(wasteLogs)
          .where(
            and(
              eq(wasteLogs.ownerId, ctx.user.id),
              gte(wasteLogs.loggedAt, weekStart),
            )
          ),
      ]);

    const orderRevenue = parseFloat(orderRevenueRows[0]?.total ?? "0");
    const posRevenue   = parseFloat(posRevenueRows[0]?.total   ?? "0");
    const weekRevenue  = orderRevenue + posRevenue;

    const topRow = topSellerRows[0];

    return {
      // null signals "no data" — UI renders "—", not "0"
      weekRevenue:     weekRevenue > 0 ? weekRevenue : null,
      orderCount:      parseInt(orderCountRows[0]?.count  ?? "0", 10),
      topSeller:       topRow?.recipeName
        ? { name: topRow.recipeName, totalQty: parseFloat(topRow.totalQty) }
        : null,
      wasteEventCount: parseInt(wasteCountRows[0]?.count ?? "0", 10),
    };
  }),
});
