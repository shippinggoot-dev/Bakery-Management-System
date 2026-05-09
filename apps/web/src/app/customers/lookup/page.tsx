"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const TIER_COLOR: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold:   "#FFD700",
};

type LineKind = "recipe" | "premade" | "freeform";

type SaleLine = {
  key:           string;
  kind:          LineKind;
  description:   string;
  recipeId:      string | null;
  premadeCakeId: string | null;
  quantity:      string;
  unitPrice:     string;
};

function emptyLine(kind: LineKind = "freeform"): SaleLine {
  return {
    key:           crypto.randomUUID(),
    kind,
    description:   "",
    recipeId:      null,
    premadeCakeId: null,
    quantity:      "1",
    unitPrice:     "",
  };
}

function parseNumber(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export default function POSLookupPage() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const utils    = api.useUtils();

  const [query,        setQuery]       = useState("");
  const [searching,    setSearching]   = useState(false);
  const [cashMode,     setCashMode]    = useState(false);
  const [saleSuccess,  setSaleSuccess] = useState<string | null>(null);
  const [saleError,    setSaleError]   = useState<string | null>(null);
  const [lines,        setLines]       = useState<SaleLine[]>([emptyLine()]);

  const { mutateAsync: lookup }     = api.customers.lookup.useMutation();
  const { data: recipes  = [] }     = api.recipes.getAll.useQuery({ limit: 200 });
  const { data: premades = [] }     = api.premadeCakes.list.useQuery();
  const { mutateAsync: recordSale, isPending: posting } = api.customers.recordSale.useMutation();

  const [found,    setFound]    = useState<Awaited<ReturnType<typeof lookup>> | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Debounced customer search — fires 200 ms after the user stops typing
  useEffect(() => {
    if (cashMode) return;
    const q = query.trim();
    if (!q) {
      setFound(null);
      setNotFound(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await lookup({ query: q });
        if (result) { setFound(result); setNotFound(false); }
        else         { setFound(null);  setNotFound(true);  }
      } catch {
        setFound(null);
        setNotFound(false);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query, cashMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearSearch() {
    setQuery("");
    setFound(null);
    setNotFound(false);
    setSaleSuccess(null);
    setLines([emptyLine()]);
    setCashMode(false);
    inputRef.current?.focus();
  }

  function updateLine(key: string, patch: Partial<SaleLine>) {
    setLines((curr) => curr.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine(kind: LineKind = "freeform") {
    setLines((curr) => [...curr, emptyLine(kind)]);
  }

  function removeLine(key: string) {
    setLines((curr) => (curr.length === 1 ? curr : curr.filter((l) => l.key !== key)));
  }

  // When a recipe is picked, default the description if empty
  function onRecipePick(line: SaleLine, recipeId: string) {
    const recipe = recipes.find((r) => r.id === recipeId);
    updateLine(line.key, {
      kind:          "recipe",
      recipeId,
      premadeCakeId: null,
      description:   line.description || recipe?.name || "",
    });
  }

  function onPremadePick(line: SaleLine, cakeId: string) {
    const cake = premades.find((c) => c.id === cakeId);
    updateLine(line.key, {
      kind:          "premade",
      premadeCakeId: cakeId,
      recipeId:      null,
      description:   line.description || cake?.name || "",
      unitPrice:     line.unitPrice || (cake?.basePrice ?? ""),
    });
  }

  const totals = lines.reduce(
    (acc, l) => {
      const q = parseNumber(l.quantity);
      const p = parseNumber(l.unitPrice);
      return acc + q * p;
    },
    0,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaleError(null);
    setSaleSuccess(null);

    const valid = lines.filter((l) => l.description.trim() && parseNumber(l.quantity) > 0);
    if (valid.length === 0) {
      setSaleError("Add at least one item with description and quantity.");
      return;
    }

    try {
      const res = await recordSale({
        customerId: cashMode ? null : (found?.id ?? null),
        currency:   "NOK",
        notes:      null,
        items: valid.map((l) => ({
          description:   l.description.trim(),
          recipeId:      l.kind === "recipe"  ? l.recipeId      : null,
          premadeCakeId: l.kind === "premade" ? l.premadeCakeId : null,
          quantity:      parseNumber(l.quantity),
          unitPrice:     l.unitPrice ? parseNumber(l.unitPrice) : null,
        })),
      });

      const insufficientCount = res.deductions.filter((d) => d.insufficient).length;
      const parts: string[] = [];
      parts.push(`Sale recorded · kr ${res.amount.toFixed(2)}`);
      if (res.pointsAwarded > 0) parts.push(`+${res.pointsAwarded} pts`);
      if (res.tierUpgraded)      parts.push(`Tier → ${res.tierUpgraded}!`);
      if (insufficientCount > 0) parts.push(`⚠ ${insufficientCount} ingredient(s) ran short`);
      if (res.reorderAlerts.length > 0) parts.push(`📦 ${res.reorderAlerts.length} draft PO(s) created`);
      setSaleSuccess(parts.join(" · "));

      setLines([emptyLine()]);
      utils.inventory.getStockLevels.invalidate();

      if (!cashMode && found) {
        const refreshed = await lookup({ query: query.trim() });
        if (refreshed) setFound(refreshed);
      }
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "Failed to record sale.");
    }
  }

  const showSaleForm = cashMode || (found !== null);

  const activeRewards = found?.rewards?.filter(
    (r) => r.status === "pending" && new Date(r.validUntil) > new Date()
  ) ?? [];

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-3 -ml-1 rounded-xl text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <div>
          <h1 className="page-title">Customer Lookup</h1>
          <p className="text-xs text-brand-400">
            {cashMode ? "Cash sale — no customer attached" : "Search by name, phone, email or card #"}
          </p>
        </div>
      </div>

      {/* Search field — disabled in cash mode */}
      {!cashMode && (
        <div className="relative">
          <input
            ref={inputRef}
            type="search"
            inputMode="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, email or card #"
            autoFocus
            autoComplete="off"
            className="form-input text-base py-4 pr-12"
          />
          {searching && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-300 text-sm animate-pulse">
              …
            </span>
          )}
          {query && !searching && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-rose-50 transition-colors text-lg leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Cash sale toggle */}
      {!found && !cashMode && (
        <button
          onClick={() => { setCashMode(true); setQuery(""); setNotFound(false); }}
          className="w-full text-sm py-2 rounded-lg border border-rose-200 text-brand-600 hover:bg-rose-50 transition-colors"
        >
          💵 Cash sale (no customer)
        </button>
      )}

      {cashMode && (
        <button
          onClick={clearSearch}
          className="w-full text-sm py-2 rounded-lg border border-rose-200 text-brand-600 hover:bg-rose-50 transition-colors"
        >
          ← Back to customer search
        </button>
      )}

      {/* Not found */}
      {notFound && !cashMode && (
        <div className="card px-4 py-5 bg-amber-50 border-amber-200 text-center space-y-3">
          <p className="text-amber-700 font-semibold">No customer found</p>
          <p className="text-sm text-amber-600">No match for &ldquo;{query}&rdquo;</p>
          <Link
            href="/customers/register"
            className="inline-block btn bg-white border border-rose-200 text-brand-600 hover:bg-rose-50 text-sm"
          >
            Register new customer
          </Link>
        </div>
      )}

      {/* Found customer card */}
      {found && !cashMode && (
        <Link href={`/customers/${found.id}`} className="card overflow-hidden block hover:border-brand-200 hover:shadow-md transition-all">
          <div className="px-4 py-4 flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
              style={{ backgroundColor: `${TIER_COLOR[found.tier]}22`, color: TIER_COLOR[found.tier] }}
            >
              {found.firstName[0]}{found.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-gray-800">{found.firstName} {found.lastName}</span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold capitalize shrink-0"
                  style={{
                    backgroundColor: `${TIER_COLOR[found.tier]}22`,
                    color: TIER_COLOR[found.tier],
                    border: `1px solid ${TIER_COLOR[found.tier]}66`,
                  }}
                >
                  {found.tier}
                </span>
              </div>
              <p className="text-sm text-brand-400 truncate">{found.phone ?? found.email}</p>
              <p className="text-xs font-mono text-brand-300">{found.cardNumber}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-black text-brand-600">{found.points.toLocaleString()}</div>
              <div className="text-xs text-brand-400">points</div>
            </div>
          </div>

          {activeRewards.length > 0 && (
            <div className="border-t border-rose-100 bg-emerald-50 px-4 py-2.5">
              <p className="text-xs font-semibold text-emerald-700">
                {activeRewards.length} active reward{activeRewards.length > 1 ? "s" : ""}: {activeRewards[0]?.description}
                {activeRewards.length > 1 && ` +${activeRewards.length - 1} more`}
              </p>
            </div>
          )}
        </Link>
      )}

      {/* Sale form — line items */}
      {showSaleForm && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 text-xs font-bold text-brand-400 uppercase tracking-wider">
            {cashMode ? "Cash sale" : "Record sale & award points"}
          </div>
          <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
            {saleError && <p className="text-sm text-red-600">{saleError}</p>}
            {saleSuccess && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 font-semibold">
                {saleSuccess}
              </div>
            )}

            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.key} className="rounded-xl border border-rose-100 bg-rose-50/30 p-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={line.kind}
                      onChange={(e) => updateLine(line.key, {
                        kind: e.target.value as LineKind,
                        recipeId: null,
                        premadeCakeId: null,
                      })}
                      className="form-input text-xs flex-1"
                    >
                      <option value="freeform">Free-form</option>
                      <option value="recipe">Recipe</option>
                      <option value="premade">Premade cake</option>
                    </select>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="text-gray-400 hover:text-red-500 px-2 text-lg"
                        aria-label="Remove line"
                      >×</button>
                    )}
                  </div>

                  {line.kind === "recipe" && (
                    <select
                      value={line.recipeId ?? ""}
                      onChange={(e) => onRecipePick(line, e.target.value)}
                      className="form-input text-sm"
                    >
                      <option value="">— Pick recipe —</option>
                      {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}

                  {line.kind === "premade" && (
                    <select
                      value={line.premadeCakeId ?? ""}
                      onChange={(e) => onPremadePick(line, e.target.value)}
                      className="form-input text-sm"
                    >
                      <option value="">— Pick premade cake —</option>
                      {premades.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}

                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="Description (shown on receipt)"
                    className="form-input text-sm"
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      placeholder="Qty"
                      className="form-input text-sm w-20 text-center font-mono"
                    />
                    <span className="self-center text-gray-400 text-sm">×</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                      placeholder="Unit price (NOK)"
                      className="form-input text-sm flex-1 font-mono"
                    />
                    <span className="self-center text-xs font-mono text-brand-700 min-w-[70px] text-right">
                      = kr {(parseNumber(line.quantity) * parseNumber(line.unitPrice)).toFixed(2)}
                    </span>
                  </div>

                  {line.kind !== "freeform" && (
                    <p className="text-[10px] text-emerald-600">
                      ✓ Stock will deduct via FEFO when this sale is recorded
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addLine()}
              className="w-full text-xs py-2 rounded-lg border border-dashed border-rose-200 text-brand-500 hover:bg-rose-50 transition-colors"
            >
              + Add line
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-rose-100">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-2xl font-black text-brand-700 tabular-nums">
                kr {totals.toFixed(2)}
              </span>
            </div>

            <button
              type="submit"
              disabled={posting || totals <= 0}
              className="btn-primary w-full text-base py-3 disabled:opacity-40"
            >
              {posting
                ? "Recording…"
                : cashMode
                  ? "Record cash sale"
                  : "Record sale & award points"}
            </button>
          </form>
        </div>
      )}

      {/* Quick links */}
      {found && !cashMode && (
        <div className="flex gap-2">
          <Link
            href={`/customers/${found.id}`}
            className="flex-1 text-center py-3.5 card text-sm font-medium text-brand-600 hover:border-brand-200 transition-colors"
          >
            Full profile
          </Link>
          <Link
            href={`/customers/${found.id}/card`}
            className="flex-1 text-center py-3.5 card text-sm font-medium text-brand-600 hover:border-brand-200 transition-colors"
          >
            Loyalty card
          </Link>
        </div>
      )}
    </div>
  );
}
