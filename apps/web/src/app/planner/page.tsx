"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { TagCombobox } from "@/components/TagCombobox";

function AddOrderForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("planner");
  const utils = api.useUtils();
  const { data: recipes = [] } = api.recipes.getAll.useQuery({ limit: 100 });

  const [recipeId,       setRecipeId]       = useState("");
  const [customerName,   setCustomerName]   = useState("");
  const [quantity,       setQuantity]       = useState("1");
  const [dueDate,        setDueDate]        = useState("");
  const [notes,          setNotes]          = useState("");
  const [cakeFormat,     setCakeFormat]     = useState<string[]>([]);
  const [cakeStyle,      setCakeStyle]      = useState<string[]>([]);
  const [spongeFlavours, setSpongeFlavours] = useState<string[]>([]);
  const [frostings,      setFrostings]      = useState<string[]>([]);
  const [fillings,       setFillings]       = useState<string[]>([]);
  const [error,          setError]          = useState<string | null>(null);

  const selectedRecipe = recipes.find((r) => r.id === recipeId);

  const recordUsage = api.customOptions.recordUsage.useMutation();
  const create = api.cakeOrders.create.useMutation({
    onSuccess: () => {
      const fields: Array<[string, string[]]> = [
        ["cake.format",        cakeFormat],
        ["cake.style",         cakeStyle],
        ["cake.spongeFlavour", spongeFlavours],
        ["cake.frosting",      frostings],
        ["cake.filling",       fillings],
      ];
      fields.forEach(([key, vals]) => {
        if (vals.length > 0) recordUsage.mutate({ fieldKey: key, values: vals });
      });
      utils.cakeOrders.getAll.invalidate();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeId) return setError(t("selectRecipeError"));
    setError(null);
    create.mutate({
      recipeId,
      customerName:   customerName.trim() || null,
      quantity:       quantity.trim() || "1",
      dueDate:        dueDate || null,
      notes:          notes.trim() || null,
      cakeFormat:     cakeFormat[0] ?? null,
      cakeStyle:      cakeStyle[0] ?? null,
      spongeFlavours: spongeFlavours.join(",") || null,
      frostings:      frostings.join(",") || null,
      fillings:       fillings.join(",") || null,
    });
  }

  return (
    <div className="card p-5 border-brand-200 bg-brand-50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{t("newOrder")}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("recipe")} *</label>
            <select className="form-input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} required>
              <option value="">{t("selectRecipe")}</option>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">
              {t("quantity")}
              {selectedRecipe && <span className="ml-1 font-normal text-gray-400 normal-case tracking-normal">({selectedRecipe.yieldUnit})</span>}
            </label>
            <input className="form-input" type="number" min="0.01" step="any"
              placeholder={selectedRecipe ? `${t("yieldHint").replace("{amount}", selectedRecipe.yieldAmount).replace("{unit}", selectedRecipe.yieldUnit)}` : "1"}
              value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("customerName")}</label>
            <input className="form-input" placeholder={t("cancel") === "Avbryt" ? "Valgfri" : "Optional"} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t("dueDate")}</label>
            <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Format</label>
            <TagCombobox fieldKey="cake.format" values={cakeFormat} onChange={setCakeFormat} placeholder="e.g. Single Tier, Two Tier…" multi={false} />
          </div>
          <div>
            <label className="form-label">Style</label>
            <TagCombobox fieldKey="cake.style" values={cakeStyle} onChange={setCakeStyle} placeholder="e.g. Showstopper, Simple…" multi={false} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="form-label">Sponge flavour(s)</label>
            <TagCombobox fieldKey="cake.spongeFlavour" values={spongeFlavours} onChange={setSpongeFlavours} placeholder="e.g. Chocolate…" />
          </div>
          <div>
            <label className="form-label">Frosting(s)</label>
            <TagCombobox fieldKey="cake.frosting" values={frostings} onChange={setFrostings} placeholder="e.g. SMBC…" />
          </div>
          <div>
            <label className="form-label">Filling(s)</label>
            <TagCombobox fieldKey="cake.filling" values={fillings} onChange={setFillings} placeholder="e.g. Caramel…" />
          </div>
        </div>
        <div>
          <label className="form-label">{t("notes")}</label>
          <input className="form-input" placeholder={t("notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={create.isPending} className="btn-primary disabled:opacity-50">
            {create.isPending ? t("adding") : t("addOrderBtn")}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">{t("cancel")}</button>
        </div>
      </form>
    </div>
  );
}

type OrderWithRecipe = {
  id: string; customerName: string | null; quantity: string;
  dueDate: string | null; status: string; notes: string | null;
  recipe: { id: string; name: string; yieldAmount: string; yieldUnit: string };
};

function GeneratePanel({ orders, onClose, onGenerated }: {
  orders: OrderWithRecipe[]; onClose: () => void; onGenerated: (id: string) => void;
}) {
  const t = useTranslations("planner");
  const utils = api.useUtils();
  const pending = orders.filter((o) => o.status === "pending");

  const [selected, setSelected] = useState<Set<string>>(new Set(pending.map((o) => o.id)));
  const [listName, setListName] = useState(`Shopping list – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
  const [dueDate,  setDueDate]  = useState("");
  const [error,    setError]    = useState<string | null>(null);

  const generate = api.cakeOrders.generateShoppingList.useMutation({
    onSuccess: (result) => {
      utils.cakeOrders.getAll.invalidate();
      utils.shoppingLists.getAll.invalidate();
      onGenerated(result.list!.id);
    },
    onError: (e) => setError(e.message),
  });

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleGenerate() {
    if (selected.size === 0) return setError(t("selectAtLeastOne"));
    setError(null);
    generate.mutate({ orderIds: Array.from(selected), listName: listName.trim() || "Shopping list", dueDate: dueDate || undefined });
  }

  const selectable = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");

  return (
    <div className="card p-5 border-brand-200 bg-brand-50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{t("generatePanel")}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      {selectable.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noOrdersToInclude")}</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("selectOrders")}</p>
            {selectable.map((o) => {
              const multiplier = parseFloat(o.quantity) / parseFloat(o.recipe.yieldAmount);
              return (
                <label key={o.id} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-rose-100 cursor-pointer hover:border-brand-300 transition-colors">
                  <input type="checkbox" className="mt-0.5 accent-brand-600" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {o.recipe.name}{o.customerName && <span className="text-gray-500 font-normal"> — {o.customerName}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {o.quantity} {o.recipe.yieldUnit} ({isNaN(multiplier) ? "?" : multiplier.toFixed(2)}× {t("batchCount").replace("{count}", "").trim()})
                      {o.dueDate && ` · ${t("due")} ${o.dueDate}`}
                    </p>
                  </div>
                  <span className={`badge text-xs mt-0.5 ${
                    o.status === "pending" ? "bg-amber-100 text-amber-800" :
                    o.status === "planned" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-500"
                  }`}>{t(`status${o.status.charAt(0).toUpperCase() + o.status.slice(1).replace("_p","P")}` as Parameters<typeof t>[0])}</span>
                </label>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t("listName")}</label>
              <input className="form-input text-sm" value={listName} onChange={(e) => setListName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">{t("shoppingDeadline")}</label>
              <input className="form-input text-sm" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleGenerate} disabled={generate.isPending || selected.size === 0} className="btn-primary disabled:opacity-50">
            {generate.isPending ? t("generating") : (selected.size === 1 ? t("generateBtn").replace("{count}", "1") : t("generateBtnPlural").replace("{count}", String(selected.size)))}
          </button>
        </>
      )}
    </div>
  );
}

function ScheduleModal({
  orderId, recipeId, recipeName, dueDate, quantity,
  onClose,
}: {
  orderId: string; recipeId: string | null; recipeName: string | null;
  dueDate: string | null; quantity: string | number; onClose: () => void;
}) {
  const utils = api.useUtils();
  const today = new Date().toISOString().slice(0, 10);
  const [date,       setDate]       = useState(dueDate ?? today);
  const [shift,      setShift]      = useState("morning");
  const [batchCount, setBatchCount] = useState(String(Math.ceil(Number(quantity))));
  const [error,      setError]      = useState<string | null>(null);

  const create = api.production.create.useMutation({
    onSuccess: () => { utils.production.getSchedule.invalidate(); onClose(); },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return setError("Pick a date.");
    create.mutate({
      recipeId, scheduledDate: date,
      shift: shift as "morning" | "afternoon" | "evening",
      batchCount: Math.max(1, parseInt(batchCount) || 1),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Schedule batch</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-500">{recipeName}</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="form-label">Date *</label>
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Shift</label>
            <select className="form-input" value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>
          <div>
            <label className="form-label">Batch count</label>
            <input type="number" min="1" className="form-input" value={batchCount} onChange={(e) => setBatchCount(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={create.isPending} className="btn-primary disabled:opacity-50 flex-1">
              {create.isPending ? "Scheduling…" : "Add to production"}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const t = useTranslations("planner");
  const router = useRouter();
  const utils  = api.useUtils();

  const [showAdd,      setShowAdd]      = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  const { data: allOrders = [], isLoading } = api.cakeOrders.getAll.useQuery();

  const updateStatus = api.cakeOrders.update.useMutation({ onSuccess: () => utils.cakeOrders.getAll.invalidate() });
  const deleteOrder  = api.cakeOrders.delete.useMutation({ onSuccess: () => utils.cakeOrders.getAll.invalidate() });

  const displayed = allOrders.filter((o) => {
    if (filterStatus === "active") return o.status === "pending" || o.status === "planned" || o.status === "in_progress";
    if (filterStatus === "done")   return o.status === "completed" || o.status === "cancelled";
    return true;
  });

  const pendingCount = allOrders.filter((o) => o.status === "pending").length;

  const statusLabel: Record<string, string> = {
    pending:     t("statusPending"),
    planned:     t("statusPlanned"),
    in_progress: t("statusInProgress"),
    completed:   t("statusCompleted"),
    cancelled:   t("statusCancelled"),
  };

  const statusStyle: Record<string, string> = {
    pending:     "bg-amber-100 text-amber-800",
    planned:     "bg-blue-100 text-blue-800",
    in_progress: "bg-purple-100 text-purple-800",
    completed:   "bg-emerald-100 text-emerald-800",
    cancelled:   "bg-gray-100 text-gray-500",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <p className="text-gray-500 mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => { setShowGenerate((v) => !v); setShowAdd(false); }}
            className={`btn text-sm font-semibold ${showGenerate ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100"}`}>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-brand-600 text-white rounded-full mr-1">{pendingCount}</span>
            )}
            {t("generateList")}
          </button>
          <button onClick={() => { setShowAdd((v) => !v); setShowGenerate(false); }} className="btn-primary text-sm">
            {t("addOrder")}
          </button>
        </div>
      </div>

      {showAdd && <AddOrderForm onClose={() => setShowAdd(false)} />}
      {showGenerate && (
        <GeneratePanel orders={allOrders as OrderWithRecipe[]} onClose={() => setShowGenerate(false)}
          onGenerated={() => { setShowGenerate(false); router.push("/shopping-lists"); }} />
      )}
      {schedulingId && (() => {
        const o = allOrders.find((x) => x.id === schedulingId);
        return o ? (
          <ScheduleModal
            orderId={o.id}
            recipeId={o.recipeId ?? null}
            recipeName={o.recipe?.name ?? null}
            dueDate={o.dueDate ?? null}
            quantity={o.quantity}
            onClose={() => setSchedulingId(null)}
          />
        ) : null;
      })()}

      <div className="flex gap-1">
        {[
          { id: "active", label: t("filterActive") },
          { id: "done",   label: t("filterDone") },
          { id: "all",    label: t("filterAll") },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setFilterStatus(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              filterStatus === id ? "bg-brand-600 text-white border-brand-600" : "bg-white text-brand-600 border-brand-200 hover:border-brand-400"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-10 text-center text-gray-400">{t("loading")}</div>
      ) : displayed.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <p className="text-3xl mb-3">📋</p>
          <p className="font-medium text-gray-600">{t("noOrdersTitle")}</p>
          <p className="text-sm mt-1">{filterStatus === "active" ? t("noOrdersActiveHint") : t("noOrdersDoneHint")}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-rose-100 bg-rose-50">
                  <th className="table-header px-5 py-3 text-left">{t("recipeCol")}</th>
                  <th className="table-header px-5 py-3 text-left">{t("customerCol")}</th>
                  <th className="table-header px-5 py-3 text-left">{t("qtyCol")}</th>
                  <th className="table-header px-5 py-3 text-left">{t("dueCol")}</th>
                  <th className="table-header px-5 py-3 text-left">{t("statusCol")}</th>
                  <th className="table-header px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {displayed.map((order) => (
                  <tr key={order.id} className="hover:bg-rose-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {order.recipe?.name ?? <span className="text-amber-500 italic">{t("unlinkedItem")}</span>}
                      </p>
                      {order.shopifyOrderNumber && <p className="text-[10px] text-gray-400 mt-0.5">{order.shopifyOrderNumber}</p>}
                      {(order.cakeFormat ?? order.cakeStyle) && (
                        <p className="text-xs text-gray-400 mt-0.5">{[order.cakeFormat, order.cakeStyle].filter(Boolean).join(" · ")}</p>
                      )}
                      {(order.spongeFlavours ?? order.frostings ?? order.fillings) && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">
                          {[order.spongeFlavours, order.frostings, order.fillings].filter(Boolean).join(" / ")}
                        </p>
                      )}
                      {order.notes && <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{order.notes}</p>}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{order.customerName ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3 text-sm text-gray-700 whitespace-nowrap">{order.quantity}{order.recipe ? ` ${order.recipe.yieldUnit}` : ""}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">{order.dueDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3">
                      <select value={order.status} onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value as never })}
                        className={`badge text-xs cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-brand-400 ${statusStyle[order.status] ?? ""}`}>
                        {Object.entries(statusLabel).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {order.recipeId && order.status !== "completed" && order.status !== "cancelled" && (
                          <button
                            onClick={() => setSchedulingId(order.id)}
                            className="text-xs text-brand-400 hover:text-brand-600 font-medium transition-colors whitespace-nowrap"
                          >
                            + Schedule
                          </button>
                        )}
                        <button onClick={() => { if (confirm(t("deleteOrder"))) deleteOrder.mutate(order.id); }}
                          className="text-xs text-gray-300 hover:text-red-500 transition-colors">✕</button>
                      </div>
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
