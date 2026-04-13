"use client";

import { useState, useRef } from "react";
import { LIBRARY, CATEGORY_LABELS, type Category, type LibraryItem } from "@/lib/cake-library";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 1) { return n.toFixed(dec); }

const ALLERGEN_COLOURS: Record<string, string> = {
  Gluten:      "bg-yellow-100 text-yellow-800",
  Milk:        "bg-blue-100 text-blue-800",
  Eggs:        "bg-orange-100 text-orange-800",
  "Tree Nuts": "bg-emerald-100 text-emerald-800",
  Peanuts:     "bg-red-100 text-red-800",
  Soy:         "bg-purple-100 text-purple-800",
  Sesame:      "bg-stone-200 text-stone-700",
};

const CATEGORY_COLOURS: Record<Category, string> = {
  cake:    "bg-rose-100 text-rose-700",
  pastry:  "bg-amber-100 text-amber-700",
  bread:   "bg-orange-100 text-orange-700",
  cookie:  "bg-yellow-100 text-yellow-800",
  dessert: "bg-purple-100 text-purple-700",
};

// ── Nutrition label (inline) ──────────────────────────────────────────────────

function NutritionLabel({ item, servingGrams }: { item: LibraryItem; servingGrams: number }) {
  const p = item.per100g;
  const factor = servingGrams / 100;

  const rows: Array<{ label: string; indent?: boolean; per100: number; perServing: number; unit: string }> = [
    { label: "Energy",             per100: p.calories,  perServing: p.calories  * factor, unit: "kcal" },
    { label: "Fat",                per100: p.fat,       perServing: p.fat       * factor, unit: "g"    },
    { label: "of which saturates", per100: p.saturates, perServing: p.saturates * factor, unit: "g", indent: true },
    { label: "Carbohydrates",      per100: p.carbs,     perServing: p.carbs     * factor, unit: "g"    },
    { label: "of which sugars",    per100: p.sugars,    perServing: p.sugars    * factor, unit: "g", indent: true },
    { label: "Fibre",              per100: p.fibre,     perServing: p.fibre     * factor, unit: "g"    },
    { label: "Protein",            per100: p.protein,   perServing: p.protein   * factor, unit: "g"    },
    { label: "Salt",               per100: p.salt,      perServing: p.salt      * factor, unit: "g"    },
  ];

  return (
    <div className="border-2 border-gray-900 font-mono text-sm w-full max-w-sm">
      <div className="bg-gray-900 text-white px-3 py-2">
        <p className="text-lg font-black tracking-tight">Nutrition Facts</p>
        <p className="text-xs text-gray-300 font-sans mt-0.5">{item.name}</p>
      </div>

      <div className="flex border-b-4 border-gray-900 px-3 py-1 bg-white">
        <div className="flex-1" />
        <div className="w-24 text-center text-[10px] font-bold text-gray-500 uppercase">Per 100 g</div>
        <div className="w-24 text-center text-[10px] font-bold text-gray-500 uppercase">Per {servingGrams} g</div>
      </div>

      <div className="bg-white divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center px-3 py-1">
            <span className={`flex-1 text-xs ${row.indent ? "pl-4 text-gray-500" : "font-semibold text-gray-900"}`}>
              {row.label}
            </span>
            <span className="w-24 text-right text-xs text-gray-700">
              {fmt(row.per100, row.unit === "kcal" ? 0 : 1)} {row.unit}
            </span>
            <span className="w-24 text-right text-xs text-gray-700">
              {fmt(row.perServing, row.unit === "kcal" ? 0 : 1)} {row.unit}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t-4 border-gray-900 px-3 py-1 bg-white">
        <p className="text-[9px] text-gray-400 font-sans">Values are per 100 g of finished product. Serving size: {servingGrams} g.</p>
      </div>
    </div>
  );
}

// ── Copy helper ───────────────────────────────────────────────────────────────

function buildCopyText(item: LibraryItem, servingGrams: number) {
  const p = item.per100g;
  const f = servingGrams / 100;

  function row(label: string, per100: number, perServing: number, unit: string) {
    const isKcal = unit === "kcal";
    return `${label.padEnd(26)}${fmt(per100, isKcal ? 0 : 1)} ${unit.padEnd(5)}  ${fmt(perServing, isKcal ? 0 : 1)} ${unit}`;
  }

  return [
    `NUTRITIONAL VALUES — ${item.name.toUpperCase()}`,
    "",
    `${"".padEnd(26)}Per 100 g       Per ${servingGrams} g`,
    "─".repeat(56),
    row("Energy",               p.calories,  p.calories  * f, "kcal"),
    row("Fat",                  p.fat,       p.fat       * f, "g"),
    row("  of which saturates", p.saturates, p.saturates * f, "g"),
    row("Carbohydrates",        p.carbs,     p.carbs     * f, "g"),
    row("  of which sugars",    p.sugars,    p.sugars    * f, "g"),
    row("Fibre",                p.fibre,     p.fibre     * f, "g"),
    row("Protein",              p.protein,   p.protein   * f, "g"),
    row("Salt",                 p.salt,      p.salt      * f, "g"),
    "─".repeat(56),
    `Allergens: ${item.allergens.join(", ")}`,
  ].join("\n");
}

// ── Expanded card ─────────────────────────────────────────────────────────────

function ExpandedCard({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const [servingGrams, setServingGrams] = useState(item.servingSizeG);
  const [copied, setCopied]             = useState(false);
  const timerRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText(item, servingGrams)).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card p-5 border-brand-300 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`badge text-xs ${CATEGORY_COLOURS[item.category]}`}>
              {CATEGORY_LABELS[item.category]}
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{item.description}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none flex-shrink-0 mt-0.5"
        >
          ×
        </button>
      </div>

      {/* Serving size */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
          Serving size
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="2000"
            className="form-input w-24 text-sm"
            value={servingGrams}
            onChange={(e) => setServingGrams(Number(e.target.value) || item.servingSizeG)}
          />
          <span className="text-sm text-gray-500">g</span>
          {servingGrams !== item.servingSizeG && (
            <button
              onClick={() => setServingGrams(item.servingSizeG)}
              className="text-xs text-brand-500 hover:text-brand-700 transition-colors"
            >
              Reset to {item.servingSizeG} g
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
        {/* Label */}
        <NutritionLabel item={item} servingGrams={servingGrams} />

        {/* Right column */}
        <div className="space-y-4">
          {/* Allergens */}
          <div>
            <p className="form-label mb-2">Allergens</p>
            <div className="flex flex-wrap gap-1.5">
              {item.allergens.map((a) => (
                <span key={a} className={`badge text-xs ${ALLERGEN_COLOURS[a] ?? "bg-gray-100 text-gray-700"}`}>
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Macro summary */}
          <div>
            <p className="form-label mb-2">Per 100 g at a glance</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Calories",  `${item.per100g.calories} kcal`],
                ["Fat",       `${item.per100g.fat} g`],
                ["Carbs",     `${item.per100g.carbs} g`],
                ["Protein",   `${item.per100g.protein} g`],
                ["Sugars",    `${item.per100g.sugars} g`],
                ["Salt",      `${item.per100g.salt} g`],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="w-full px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            {copied ? "Copied!" : "Copy label text"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ item, onClick }: { item: LibraryItem; onClick: () => void }) {
  const p = item.per100g;
  return (
    <button
      onClick={onClick}
      className="card p-4 text-left hover:border-brand-300 hover:shadow-md transition-all space-y-3 w-full"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`badge text-[10px] mb-1.5 ${CATEGORY_COLOURS[item.category]}`}>
            {CATEGORY_LABELS[item.category]}
          </span>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</h3>
        </div>
        <span className="text-lg font-black text-brand-600 whitespace-nowrap">{p.calories}<span className="text-xs font-normal text-gray-400 ml-0.5">kcal</span></span>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>

      {/* Mini macro bar */}
      <div className="grid grid-cols-3 gap-1 pt-1 border-t border-rose-100">
        {[
          ["Fat",    `${p.fat}g`],
          ["Carbs",  `${p.carbs}g`],
          ["Protein",`${p.protein}g`],
        ].map(([label, value]) => (
          <div key={label} className="text-center">
            <p className="text-xs font-bold text-gray-800">{value}</p>
            <p className="text-[10px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-brand-400 font-medium">Tap to open label →</p>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ id: "all" | Category; label: string }> = [
  { id: "all",     label: "All" },
  { id: "cake",    label: "Cakes" },
  { id: "pastry",  label: "Pastries" },
  { id: "bread",   label: "Breads" },
  { id: "cookie",  label: "Cookies" },
  { id: "dessert", label: "Desserts" },
];

export default function LibraryPage() {
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = LIBRARY.filter((item) => {
    const matchesCategory = category === "all" || item.category === category;
    const matchesSearch   = search === "" ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const expandedItem = expanded ? LIBRARY.find((i) => i.id === expanded) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="page-title">Recipe Library</h2>
        <p className="text-gray-500 mt-1 text-sm">
          {LIBRARY.length} pre-calculated bakery recipes — tap any card to open the nutrition label.
        </p>
      </div>

      {/* Expanded detail */}
      {expandedItem && (
        <ExpandedCard
          item={expandedItem}
          onClose={() => setExpanded(null)}
        />
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="form-input flex-1"
          placeholder="Search cakes, pastries…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpanded(null); }}
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setCategory(id); setExpanded(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                category === id
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-brand-600 border-brand-200 hover:border-brand-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          No items match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <SummaryCard
              key={item.id}
              item={item}
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-4">
        Nutritional values are standard reference figures per 100 g of finished product.
        Actual values depend on your specific recipe and ingredients.
      </p>
    </div>
  );
}
