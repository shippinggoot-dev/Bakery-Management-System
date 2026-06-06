"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { TagCombobox } from "@/components/TagCombobox";

type SourceMode = "custom" | "catalog";

function AddOrderForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("planner");
  const utils = api.useUtils();
  const { data: recipes  = [] } = api.recipes.getAll.useQuery({ limit: 100 });
  const { data: premades = [] } = api.premadeCakes.list.useQuery({ isActive: true });

  const [sourceMode,     setSourceMode]     = useState<SourceMode>("custom");
  const [premadeCakeId,  setPremadeCakeId]  = useState("");
  const [recipeId,       setRecipeId]       = useState("");
  const [salePrice,      setSalePrice]      = useState("");
  const [customerId,     setCustomerId]     = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerName,   setCustomerName]   = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
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
  const selectedCake   = premades.find((c) => c.id === premadeCakeId);

  const recordUsage = api.customOptions.recordUsage.useMutation();
  const lookupCustomer = api.customers.lookup.useMutation();

  // When picking a premade cake, auto-fill recipe + price
  function pickPremade(id: string) {
    setPremadeCakeId(id);
    const cake = premades.find((c) => c.id === id);
    if (cake) {
      if (cake.recipeId) setRecipeId(cake.recipeId);
      if (!salePrice && cake.basePrice) setSalePrice(cake.basePrice);
    }
  }

  // Customer search — debounced
  useEffect(() => {
    const q = customerSearch.trim();
    // Don't search if the user has already linked a customer (avoid re-triggering)
    if (!q || customerId) return;
    const timer = setTimeout(async () => {
      try {
        const result = await lookupCustomer.mutateAsync({ query: q });
        if (result) {
          setShowCustomerSuggestions(true);
        }
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch, customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectCustomerFromLookup(c: { id: string; firstName: string; lastName: string }) {
    setCustomerId(c.id);
    setCustomerName(`${c.firstName} ${c.lastName}`);
    setCustomerSearch(`${c.firstName} ${c.lastName}`);
    setShowCustomerSuggestions(false);
  }

  function clearCustomer() {
    setCustomerId(null);
    setCustomerName("");
    setCustomerSearch("");
  }

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
      customerId,
      customerName:   customerName.trim() || null,
      salePrice:      salePrice.trim() || null,
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

      {/* Source mode toggle: pick from catalog vs build custom */}
      <div className="flex gap-2 p-1 bg-white rounded-lg border border-rose-200">
        <button
          type="button"
          onClick={() => setSourceMode("custom")}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            sourceMode === "custom"
              ? "bg-brand-600 text-white"
              : "text-brand-600 hover:bg-rose-50"
          }`}
        >
          {t("sourceCustom")}
        </button>
        <button
          type="button"
          onClick={() => setSourceMode("catalog")}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            sourceMode === "catalog"
              ? "bg-brand-600 text-white"
              : "text-brand-600 hover:bg-rose-50"
          }`}
        >
          🧁 {t("sourceCatalog")}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Premade cake picker — only in catalog mode */}
        {sourceMode === "catalog" && (
          <div>
            <label className="form-label">{t("pickFromCatalog")}</label>
            <select
              className="form-input"
              value={premadeCakeId}
              onChange={(e) => pickPremade(e.target.value)}
              required={sourceMode === "catalog"}
            >
              <option value="">{t("selectPremade")}</option>
              {premades.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — kr {parseFloat(c.basePrice).toFixed(0)}
                </option>
              ))}
            </select>
            {selectedCake && !selectedCake.recipeId && (
              <p className="text-xs text-amber-600 mt-1">
                {t("premadeNoRecipe")}
              </p>
            )}
          </div>
        )}

        {/* Customer search with autocomplete — same in both modes */}
        <div>
          <label className="form-label">{t("customerLabel")}</label>
          <div className="relative">
            <input
              type="text"
              className="form-input"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerName(e.target.value);
                if (customerId) setCustomerId(null); // clear link when user types
              }}
              placeholder={t("customerSearchPlaceholder")}
            />
            {customerId && (
              <button
                type="button"
                onClick={clearCustomer}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-semibold"
              >
                ✓ {t("customerLinked")} ×
              </button>
            )}
          </div>
          {showCustomerSuggestions && lookupCustomer.data && !customerId && (
            <button
              type="button"
              onClick={() => selectCustomerFromLookup(lookupCustomer.data!)}
              className="mt-1 w-full text-left text-xs px-3 py-2 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 transition-colors"
            >
              {t("matchedCustomer").replace("{name}", `${lookupCustomer.data.firstName} ${lookupCustomer.data.lastName}`)}{" "}
              <span className="text-emerald-600 font-semibold">— {t("clickToLink")}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("recipe")} *</label>
            <select
              className="form-input"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              required
              disabled={sourceMode === "catalog" && !!selectedCake?.recipeId}
            >
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
            <label className="form-label">{t("dueDate")}</label>
            <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t("salePriceLabel")}</label>
            <input
              className="form-input"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
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

/**
 * Modal: create a recipe for an unlinked Shopify-origin order. Pre-fills
 * the name from the Shopify line-item title and pre-fills the selling
 * price from the order. On save, calls createFromShopifyTitle which
 * also auto-links every other pending order with the same Shopify title.
 */
function CreateRecipeFromOrderModal({
  shopifyTitle, suggestedPrice, onClose, onCreated,
}: {
  shopifyTitle:   string;
  suggestedPrice: string | null;
  onClose:        () => void;
  onCreated:      (linkedCount: number) => void;
}) {
  const [name,         setName]         = useState(shopifyTitle);
  const [yieldAmount,  setYieldAmount]  = useState("1");
  const [yieldUnit,    setYieldUnit]    = useState("stk");
  const [sellingPrice, setSellingPrice] = useState(suggestedPrice ?? "");
  const [error,        setError]        = useState<string | null>(null);

  const create = api.recipes.createFromShopifyTitle.useMutation({
    onSuccess: (result) => onCreated(result.linkedOrderCount),
    onError:   (e)      => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())        return setError("Recipe name is required.");
    if (!yieldAmount.trim()) return setError("Yield amount is required.");
    if (!yieldUnit.trim())   return setError("Yield unit is required.");
    setError(null);
    create.mutate({
      shopifyTitle,
      recipe: {
        name:         name.trim(),
        yieldAmount:  yieldAmount.trim(),
        yieldUnit:    yieldUnit.trim(),
        sellingPrice: sellingPrice.trim() || null,
        isActive:     true,
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Create recipe from order</h3>
            <p className="text-xs text-gray-500 mt-1">
              Saves to your recipes. Other pending orders with the same Shopify product link automatically.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold">Shopify product</p>
          <p className="text-sm text-gray-800 mt-0.5 break-words">{shopifyTitle}</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="form-label">Recipe name *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              maxLength={255}
            />
            <p className="text-[11px] text-gray-400 mt-1">Shorten to a base name like “Razzle Dazzle Wedding Cake”. Variants are handled by the matcher.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Yield amount *</label>
              <input
                className="form-input"
                type="number"
                min="0.01"
                step="any"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Yield unit *</label>
              <input
                className="form-input"
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                placeholder="stk, kg, dl…"
                required
                maxLength={32}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Selling price (kr)</label>
            <input
              className="form-input"
              type="text"
              inputMode="decimal"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-[11px] text-gray-400 mt-1">Pre-filled from the Shopify line price. Adjust if you charge differently.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={create.isPending} className="btn-primary disabled:opacity-50 flex-1">
              {create.isPending ? "Creating…" : "Create recipe"}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
          <p className="text-[11px] text-gray-400">
            You can add ingredients, instructions, and edit the variant title list on the recipe page later.
          </p>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal: schedule an unlinked Shopify-origin order as a production event
 * (no recipe authored). Used for class- or service-style products that
 * don't have anything to bake but still need a slot on the production
 * calendar — e.g. "Bakeskole - August 2026" weeks of kids' baking
 * classes.
 */
function ScheduleEventModal({
  cakeOrderId, shopifyTitle, dueDate, defaultNotes,
  onClose, onScheduled,
}: {
  cakeOrderId:  string;
  shopifyTitle: string;
  dueDate:      string | null;
  defaultNotes: string | null;
  onClose:      () => void;
  onScheduled:  () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date,  setDate]  = useState(dueDate ?? today);
  const [shift, setShift] = useState<"morning" | "afternoon" | "evening">("morning");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  const schedule = api.cakeOrders.scheduleAsEvent.useMutation({
    onSuccess: () => onScheduled(),
    onError:   (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return setError("Pick a date.");
    setError(null);
    schedule.mutate({
      cakeOrderId,
      scheduledDate: date,
      shift,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Schedule as event</h3>
            <p className="text-xs text-gray-500 mt-1">
              For services and classes that don't have a recipe to bake. Adds the booking to the production calendar.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold">Shopify product</p>
          <p className="text-sm text-gray-800 mt-0.5 break-words">{shopifyTitle}</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Date *</label>
              <input
                className="form-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Shift</label>
              <select
                className="form-input"
                value={shift}
                onChange={(e) => setShift(e.target.value as typeof shift)}
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea
              className="form-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={schedule.isPending} className="btn-primary disabled:opacity-50 flex-1">
              {schedule.isPending ? "Scheduling…" : "Add to production"}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </div>
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
  // When set, opens the "create recipe from Shopify title" modal for the
  // selected unlinked order. We carry the source order so we can pre-fill
  // the recipe form with its title and per-unit price.
  const [creatingRecipeFor, setCreatingRecipeFor] = useState<{
    shopifyTitle:   string;
    suggestedPrice: string | null;
  } | null>(null);
  // When set, opens the "schedule as event" modal — used for class- or
  // service-style Shopify products that don't get a recipe. Holds the
  // order context we need to pre-fill the form.
  const [schedulingEventFor, setSchedulingEventFor] = useState<{
    cakeOrderId:  string;
    shopifyTitle: string;
    dueDate:      string | null;
    notes:        string | null;
  } | null>(null);

  const { data: allOrders = [], isLoading } = api.cakeOrders.getAll.useQuery();

  const updateStatus = api.cakeOrders.update.useMutation({ onSuccess: () => utils.cakeOrders.getAll.invalidate() });
  const deleteOrder  = api.cakeOrders.delete.useMutation({ onSuccess: () => utils.cakeOrders.getAll.invalidate() });
  const ignoreProduct = api.shopify.ignoreProduct.useMutation();

  /**
   * Block + delete: adds the order's Shopify title to the per-workspace
   * ignore list, then deletes the order. Future imports skip this product
   * entirely until the user removes it from the ignore list (Settings →
   * Shopify → Ignored products).
   */
  async function blockAndDelete(order: { id: string; shopifyLineItemTitle: string | null }) {
    if (!order.shopifyLineItemTitle) return;
    const confirmed = confirm(
      `Block "${order.shopifyLineItemTitle}" from future Shopify imports and remove this order?\n\n` +
      `You can unblock it later under Settings → Shopify.`
    );
    if (!confirmed) return;
    await ignoreProduct.mutateAsync({ shopifyTitle: order.shopifyLineItemTitle });
    await deleteOrder.mutateAsync(order.id);
  }

  // Past-due: pending order whose due date is strictly before today.
  // Today's orders are NOT past due — they're being worked on.
  const todayIso = new Date().toISOString().slice(0, 10);
  function isPastDue(o: { status: string; dueDate: string | null }): boolean {
    return o.status === "pending" && o.dueDate != null && o.dueDate < todayIso;
  }

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

      {creatingRecipeFor && (
        <CreateRecipeFromOrderModal
          shopifyTitle={creatingRecipeFor.shopifyTitle}
          suggestedPrice={creatingRecipeFor.suggestedPrice}
          onClose={() => setCreatingRecipeFor(null)}
          onCreated={(linkedCount) => {
            setCreatingRecipeFor(null);
            utils.cakeOrders.getAll.invalidate();
            utils.recipes.getAll.invalidate();
            alert(`Recipe created. ${linkedCount} order${linkedCount === 1 ? "" : "s"} now linked.`);
          }}
        />
      )}

      {schedulingEventFor && (
        <ScheduleEventModal
          cakeOrderId={schedulingEventFor.cakeOrderId}
          shopifyTitle={schedulingEventFor.shopifyTitle}
          dueDate={schedulingEventFor.dueDate}
          defaultNotes={schedulingEventFor.notes}
          onClose={() => setSchedulingEventFor(null)}
          onScheduled={() => {
            setSchedulingEventFor(null);
            utils.cakeOrders.getAll.invalidate();
            utils.production.getSchedule.invalidate();
          }}
        />
      )}

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
                {displayed.map((order) => {
                  const pastDue   = isPastDue(order);
                  const unlinked  = !order.recipeId && !!order.shopifyLineItemTitle;
                  return (
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
                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {order.dueDate ? (
                        <span className={pastDue ? "text-red-600 font-semibold" : ""}>
                          {order.dueDate}
                          {pastDue && <span className="ml-1.5 badge text-[10px] bg-red-100 text-red-700 border border-red-200">Past due</span>}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <select value={order.status} onChange={(e) => updateStatus.mutate({ id: order.id, status: e.target.value as never })}
                        className={`badge text-xs cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-brand-400 ${statusStyle[order.status] ?? ""}`}>
                        {Object.entries(statusLabel).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {unlinked && (
                          <button
                            onClick={() => setCreatingRecipeFor({
                              shopifyTitle:   order.shopifyLineItemTitle!,
                              suggestedPrice: order.salePrice ?? null,
                            })}
                            className="text-xs text-brand-500 hover:text-brand-700 font-medium transition-colors whitespace-nowrap"
                            title="Create a recipe from this Shopify product. Other pending orders for the same product link automatically."
                          >
                            + Create recipe
                          </button>
                        )}
                        {unlinked && (
                          <button
                            onClick={() => setSchedulingEventFor({
                              cakeOrderId:  order.id,
                              shopifyTitle: order.shopifyLineItemTitle!,
                              dueDate:      order.dueDate ?? null,
                              notes:        order.notes ?? null,
                            })}
                            className="text-xs text-brand-500 hover:text-brand-700 font-medium transition-colors whitespace-nowrap"
                            title="For services and classes — adds the booking to the production calendar without creating a recipe."
                          >
                            + Schedule as event
                          </button>
                        )}
                        {order.recipeId && order.status !== "completed" && order.status !== "cancelled" && (
                          <button
                            onClick={() => setSchedulingId(order.id)}
                            className="text-xs text-brand-400 hover:text-brand-600 font-medium transition-colors whitespace-nowrap"
                          >
                            + Schedule
                          </button>
                        )}
                        {order.shopifyLineItemTitle && (
                          <button
                            onClick={() => blockAndDelete(order)}
                            className="text-xs text-gray-400 hover:text-red-600 font-medium transition-colors whitespace-nowrap"
                            title={`Block "${order.shopifyLineItemTitle}" from future Shopify imports and delete this order. Reversible from Settings.`}
                          >
                            🚫 Block
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm(t("deleteOrder"))) deleteOrder.mutate(order.id); }}
                          className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors"
                          title="Delete this order"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
