import Link from "next/link";
import { api } from "@/trpc/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let recipes: Awaited<ReturnType<typeof api.recipes.getAll>> = [];
  let ingredients: Awaited<ReturnType<typeof api.ingredients.getAll>> = [];
  let suppliers: Awaited<ReturnType<typeof api.suppliers.getAll>> = [];
  let shoppingLists: Awaited<ReturnType<typeof api.shoppingLists.getAll>> = [];
  let purchaseOrders: Awaited<ReturnType<typeof api.purchaseOrders.getAll>> = [];
  let dbError: string | null = null;

  try {
    [recipes, ingredients, suppliers, shoppingLists, purchaseOrders] =
      await Promise.all([
        api.recipes.getAll({ limit: 100 }),
        api.ingredients.getAll({ limit: 100 }),
        api.suppliers.getAll(),
        api.shoppingLists.getAll({ limit: 100 }),
        api.purchaseOrders.getAll({ limit: 100 }),
      ]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    console.error("Dashboard DB error:", dbError);
  }

  const activeRecipes   = recipes.filter((r) => r.isActive).length;
  const activeSuppliers = suppliers.filter((s) => s.isActive).length;
  const pendingOrders   = purchaseOrders.filter((o) =>
    ["draft", "sent", "confirmed"].includes(o.status)
  ).length;
  const openLists = shoppingLists.filter((l) => l.status !== "completed").length;

  const stats = [
    { label: "Active Recipes",      value: activeRecipes,      href: "/recipes",          colour: "text-brand-400",  bg: "bg-brand-500/10"  },
    { label: "Ingredients",         value: ingredients.length, href: "/ingredients",      colour: "text-rose-300",   bg: "bg-rose-950/40"   },
    { label: "Active Suppliers",    value: activeSuppliers,    href: "/suppliers",        colour: "text-brand-300",  bg: "bg-brand-500/10"  },
    { label: "Open Shopping Lists", value: openLists,          href: "/shopping-lists",   colour: "text-pink-300",   bg: "bg-pink-950/40"   },
    { label: "Pending Orders",      value: pendingOrders,      href: "/purchase-orders",  colour: "text-rose-400",   bg: "bg-rose-950/50"   },
  ];

  const recentRecipes = recipes.slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="page-title">Dashboard</h2>
        <p className="text-gray-500 mt-1">Welcome back — here's your bakery at a glance.</p>
      </div>

      {/* DB error banner */}
      {dbError && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          <p className="font-semibold mb-1">Database connection error</p>
          <p className="font-mono text-xs break-all">{dbError}</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, href, colour, bg }) => (
          <Link key={href} href={href} className={`stat-card hover:border-gray-700 transition-all ${bg}`}>
            <p className={`text-3xl font-bold ${colour}`}>{value}</p>
            <p className="text-sm text-gray-400">{label}</p>
          </Link>
        ))}
      </div>

      {/* Recent Recipes */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="section-title">Recent Recipes</h3>
          <Link href="/recipes" className="text-sm text-brand-400 hover:text-brand-500 font-medium">
            View all →
          </Link>
        </div>
        <ul className="divide-y divide-gray-800">
          {recentRecipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-800/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-100">{recipe.name}</p>
                  {recipe.description && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate max-w-md">
                      {recipe.description}
                    </p>
                  )}
                </div>
                <span className="text-sm text-gray-600 ml-4 shrink-0">
                  {recipe.yieldAmount} {recipe.yieldUnit}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "➕ New Recipe",        href: "/recipes"         },
          { label: "🛒 New Shopping List", href: "/shopping-lists"  },
          { label: "📦 New Order",         href: "/purchase-orders" },
          { label: "🧂 Add Ingredient",    href: "/ingredients"     },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="card px-4 py-3 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-700 transition-all text-center"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
