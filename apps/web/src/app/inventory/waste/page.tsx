"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";

const WASTE_REASONS = [
  { value: "expired",        label: "Expired",        icon: "📅" },
  { value: "burnt",          label: "Burnt",           icon: "🔥" },
  { value: "dropped",        label: "Dropped",         icon: "💧" },
  { value: "overproduction", label: "Overproduction",  icon: "📦" },
  { value: "other",          label: "Other",           icon: "❓" },
] as const;

type WasteReason = (typeof WASTE_REASONS)[number]["value"];

export default function WastePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-brand-300">Loading…</div>}>
      <WastePageInner />
    </Suspense>
  );
}

function IngredientSearch({
  ingredients,
  value,
  onChange,
}: {
  ingredients: { id: string; name: string; unit: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);
  const listRef             = useRef<HTMLDivElement>(null);

  const selected = ingredients.find((i) => i.id === value);

  const filtered = query.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : ingredients;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("");
    setQuery("");
    setTimeout(() => { inputRef.current?.focus(); setOpen(true); }, 0);
  }

  return (
    <div className="relative">
      {selected && !open ? (
        // Selected state — show chip with clear button
        <div className="flex items-center justify-between gap-2 w-full rounded-lg bg-brand-50 border border-brand-300 px-4 py-3 text-sm">
          <span className="font-medium text-brand-700">{selected.name}</span>
          <span className="text-xs text-brand-400 shrink-0">{selected.unit}</span>
          <button
            type="button"
            onClick={clear}
            className="ml-1 text-brand-400 hover:text-brand-700 text-lg leading-none shrink-0"
            aria-label="Clear selection"
          >
            ×
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          autoFocus
          placeholder="Search ingredient…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="form-input"
        />
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-rose-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="max-h-56 overflow-y-auto overscroll-contain divide-y divide-rose-50">
            {filtered.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400 text-center">No ingredients found</p>
            ) : (
              filtered.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(i.id); }}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-sm text-left hover:bg-rose-50 active:bg-rose-100 transition-colors"
                >
                  <span className="font-medium text-gray-800">{i.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{i.unit}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WastePageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const { data: ingredients = [] } = api.ingredients.getAll.useQuery();
  const { mutateAsync: logWaste, isPending } = api.inventory.logWaste.useMutation();

  const [ingredientId, setIngredientId] = useState(searchParams.get("ingredientId") ?? "");
  const [quantity,     setQuantity]     = useState("");
  const [reason,       setReason]       = useState<WasteReason>("expired");
  const [notes,        setNotes]        = useState("");
  const [showNotes,    setShowNotes]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);
  const [reorderAlert, setReorderAlert] = useState(false);

  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ingredientId) { setError("Select an ingredient."); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError("Enter a valid quantity."); return; }
    try {
      const res = await logWaste({
        ingredientId,
        quantity: qty,
        unit: selectedIngredient?.unit ?? "g",
        reason,
        notes: notes || null,
      });
      setSuccess(true);
      setReorderAlert(!!res.reorderAlert);
      setTimeout(() => router.push("/inventory"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log waste.");
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-3 -ml-1 rounded-xl text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="page-title">Log Waste</h1>
      </div>

      {success && (
        <div className="space-y-2">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm font-medium">
            Waste logged. Redirecting…
          </div>
          {reorderAlert && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 text-sm">
              Stock hit reorder point — a draft purchase order has been created.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* 1. Ingredient — searchable list */}
        <div>
          <label className="form-label">Ingredient *</label>
          <IngredientSearch
            ingredients={ingredients}
            value={ingredientId}
            onChange={setIngredientId}
          />
        </div>

        {/* 2. Quantity — numeric keyboard */}
        <div>
          <label className="form-label">
            Quantity wasted
            {selectedIngredient && (
              <span className="text-brand-300 normal-case font-normal ml-1">({selectedIngredient.unit})</span>
            )} *
          </label>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            placeholder="0"
            className="form-input text-lg"
          />
        </div>

        {/* 3. Reason — horizontal scroll pills */}
        <div>
          <label className="form-label">Reason *</label>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {WASTE_REASONS.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setReason(value)}
                className={`flex flex-col items-center gap-1 py-3 px-4 rounded-xl border text-xs font-semibold transition-colors shrink-0 snap-start min-w-[72px] ${
                  reason === value
                    ? "bg-red-50 border-red-400 text-red-700"
                    : "bg-white border-rose-200 text-gray-500 active:bg-rose-50"
                }`}
              >
                <span className="text-2xl leading-none">{icon}</span>
                <span className="mt-0.5 whitespace-nowrap">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Notes — collapsed by default */}
        {showNotes ? (
          <div>
            <label className="form-label">Note (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Details about what happened…"
              className="form-input resize-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-sm text-brand-400 hover:text-brand-600 transition-colors"
          >
            + Add a note
          </button>
        )}

        {/* 5. Submit */}
        <button
          type="submit"
          disabled={isPending || success}
          className="w-full py-4 rounded-2xl bg-red-600 text-white font-bold text-base hover:bg-red-700 active:bg-red-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Logging…" : "Log waste"}
        </button>
      </form>
    </div>
  );
}
