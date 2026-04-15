"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending:     "Pending",
  planned:     "Planned",
  in_progress: "In progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  pending:     "bg-amber-100 text-amber-800",
  planned:     "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed:   "bg-emerald-100 text-emerald-800",
  cancelled:   "bg-gray-100 text-gray-500",
};

// ── Add order form ────────────────────────────────────────────────────────────

function AddOrderForm({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils();
  const { data: recipes = [] } = api.recipes.getAll.useQuery({ limit: 100 });

  const [recipeId,     setRecipeId]     = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quantity,     setQuantity]     = useState("1");
  const [dueDate,      setDueDate]      = useState("");
  const [notes,        setNotes]        = useState("");
  const [error,        setError]        = useState<string | null>(null);

  const selectedRecipe = recipes.find((r) => r.id === recipeId);

  const create = api.cakeOrders.create.useMutation({
    onSuccess: () => { utils.cakeOrders.getAll.invalidate(); onClose(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeId) return setError("Please select a recipe.");
    setError(null);
    create.mutate({
      recipeId,
      customerName: customerName.trim() || null,
      quantity:     quantity.trim() || "1",
      dueDate:      dueDate || null,
      notes:        notes.trim() || null,
    });
  }

  return (
    <div className="card p-5 border-brand-200 bg-brand-50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">New order</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Recipe *</label>
            <select
              className="form-input"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              required
            >
              <option value="">— Select recipe —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">
              Quantity
              {selectedRecipe && (
                <span className="ml-1 font-normal text-gray-400 normal-case tracking-normal">
                  ({selectedRecipe.yieldUnit})
                </span>
              )}
            </label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="any"
              placeholder={selectedRecipe ? `Recipe yields ${selectedRecipe.yieldAmount} ${selectedRecipe.yieldUnit}` : "1"}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Customer name</label>
            <input
              className="form-input"
              placeholder="Optional"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Due date</label>
            <input
              className="form-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="form-label">Notes</label>
          <input
            className="form-input"
            placeholder="Flavour preferences, allergens, delivery info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={create.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {create.isPending ? "Adding…" : "Add order"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ── Generate panel ────────────────────────────────────────────────────────────

type OrderWithRecipe = {
  id: string;
  customerName: string | null;
  quantity: string;
  dueDate: string | null;
  status: string;
  notes: string | null;
  recipe: { id: string; name: string; yieldAmount: string; yieldUnit: string };
};

function GeneratePanel({
  orders,
  onClose,
  onGenerated,
}: {
  orders: OrderWithRecipe[];
  onClose: () => void;
  onGenerated: (listId: string) => void;
}) {
  const utils = api.useUtils();
  const pending = orders.filter((o) => o.status === "pending");

  const [selected, setSelected]   = useState<Set<string>>(new Set(pending.map((o) => o.id)));
  const [listName, setListName]   = useState(`Shopping list – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
  const [dueDate,  setDueDate]    = useState("");
  const [error,    setError]      = useState<string | null>(null);

  const generate = api.cakeOrders.generateShoppingList.useMutation({
    onSuccess: (result) => {
      utils.cakeOrders.getAll.invalidate();
      utils.shoppingLists.getAll.invalidate();
      onGenerated(result.list!.id);
    },
    onError: (e) => setError(e.message),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleGenerate() {
    if (selected.size === 0) return setError("Select at least one order.");
    setError(null);
    generate.mutate({
      orderIds: Array.from(selected),
      listName: listName.trim() || "Shopping list",
      dueDate:  dueDate || undefined,
    });
  }

  const selectableOrders = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");

  return (
    <div className="card p-5 border-brand-200 bg-brand-50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Generate shopping list</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      {selectableOrders.length === 0 ? (
        <p className="text-sm text-gray-500">No pending orders to include. Add some orders first.</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Select orders to include</p>
            {selectableOrders.map((o) => {
              const multiplier = parseFloat(o.quantity) / parseFloat(o.recipe.yieldAmount);
              return (
                <label
                  key={o.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white border border-rose-100 cursor-pointer hover:border-brand-300 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-brand-600"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {o.recipe.name}
                      {o.customerName && <span className="text-gray-500 font-normal"> — {o.customerName}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {o.quantity} {o.recipe.yieldUnit}
                      {" "}({isNaN(multiplier) ? "?" : multiplier.toFixed(2)}× batch)
                      {o.dueDate && ` · Due ${o.dueDate}`}
                    </p>
                  </div>
                  <span className={`badge text-xs mt-0.5 ${STATUS_STYLE[o.status] ?? ""}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">List name</label>
              <input
                className="form-input text-sm"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Shopping deadline</label>
              <input
                className="form-input text-sm"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={generate.isPending || selected.size === 0}
            className="btn-primary disabled:opacity-50"
          >
            {generate.isPending
              ? "Generating…"
              : `Generate list from ${selected.size} order${selected.size !== 1 ? "s" : ""}`}
          </button>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const router  = useRouter();
  const utils   = api.useUtils();

  const [showAdd,      setShowAdd]      = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("active");

  const { data: allOrders = [], isLoading } = api.cakeOrders.getAll.useQuery();

  const updateStatus = api.cakeOrders.update.useMutation({
    onSuccess: () => utils.cakeOrders.getAll.invalidate(),
  });

  const deleteOrder = api.cakeOrders.delete.useMutation({
    onSuccess: () => utils.cakeOrders.getAll.invalidate(),
  });

  const displayed = allOrders.filter((o) => {
    if (filterStatus === "active") return o.status === "pending" || o.status === "planned" || o.status === "in_progress";
    if (filterStatus === "done")   return o.status === "completed" || o.status === "cancelled";
    return true;
  });

  const pendingCount = allOrders.filter((o) => o.status === "pending").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="page-title">Order Planner</h2>
          <p className="text-gray-500 mt-1 text-sm">
            Log incoming cake orders, then generate a shopping list in one click.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => { setShowGenerate((v) => !v); setShowAdd(false); }}
            className={`btn text-sm font-semibold ${showGenerate ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100"}`}
          >
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-brand-600 text-white rounded-full mr-1">
                {pendingCount}
              </span>
            )}
            Generate list
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setShowGenerate(false); }}
            className="btn-primary text-sm"
          >
            + Add order
          </button>
        </div>
      </div>

      {/* Forms */}
      {showAdd      && <AddOrderForm   onClose={() => setShowAdd(false)} />}
      {showGenerate && (
        <GeneratePanel
          orders={allOrders as OrderWithRecipe[]}
          onClose={() => setShowGenerate(false)}
          onGenerated={(listId) => {
            setShowGenerate(false);
            router.push("/shopping-lists");
          }}
        />
      )}

      {/* Filter tabs */}
      <div className="flex gap-1">
        {[
          { id: "active", label: "Active" },
          { id: "done",   label: "Completed / Cancelled" },
          { id: "all",    label: "All" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilterStatus(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              filterStatus === id
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-brand-600 border-brand-200 hover:border-brand-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      {isLoading ? (
        <div className="card p-10 text-center text-gray-400">Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <p className="text-3xl mb-3">📋</p>
          <p className="font-medium text-gray-600">No orders here</p>
          <p className="text-sm mt-1">
            {filterStatus === "active"
              ? "Use \"Add order\" to log an incoming cake order."
              : "No completed or cancelled orders yet."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-rose-100 bg-rose-50">
                  <th className="table-header px-5 py-3 text-left">Recipe</th>
                  <th className="table-header px-5 py-3 text-left">Customer</th>
                  <th className="table-header px-5 py-3 text-left">Qty</th>
                  <th className="table-header px-5 py-3 text-left">Due</th>
                  <th className="table-header px-5 py-3 text-left">Status</th>
                  <th className="table-header px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {displayed.map((order) => (
                  <tr key={order.id} className="hover:bg-rose-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {order.recipe?.name ?? <span className="text-amber-500 italic">Unlinked item</span>}
                      </p>
                      {order.shopifyOrderNumber && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{order.shopifyOrderNumber}</p>
                      )}
                      {order.notes && <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{order.notes}</p>}
                    </td>

                    <td className="px-5 py-3 text-sm text-gray-600">
                      {order.customerName ?? <span className="text-gray-300">—</span>}
                    </td>

                    <td className="px-5 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {order.quantity}{order.recipe ? ` ${order.recipe.yieldUnit}` : ""}
                    </td>

                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {order.dueDate ?? <span className="text-gray-300">—</span>}
                    </td>

                    <td className="px-5 py-3">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          updateStatus.mutate({ id: order.id, status: e.target.value as never })
                        }
                        className={`badge text-xs cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-brand-400 ${STATUS_STYLE[order.status] ?? ""}`}
                      >
                        {Object.entries(STATUS_LABEL).map(([val, lbl]) => (
                          <option key={val} value={val}>{lbl}</option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete this order?`)) deleteOrder.mutate(order.id);
                        }}
                        className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
