"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NutritionPer100g {
  calories: number;
  fat: number;
  saturates: number;
  carbs: number;
  sugars: number;
  fibre: number;
  protein: number;
  salt: number;
}

interface LibraryEntry {
  id: string;
  name: string;
  description: string;
  servingSizeG: number;
  per100g: NutritionPer100g;
  createdAt: string;
}

const STORAGE_KEY = "bms-library-entries";

function loadEntries(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: LibraryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 1) { return n.toFixed(dec); }

function buildCopyText(entry: LibraryEntry) {
  const p = entry.per100g;
  const f = entry.servingSizeG / 100;

  function row(label: string, per100: number, perServing: number, unit: string) {
    const isKcal = unit === "kcal";
    return `${label.padEnd(26)}${fmt(per100, isKcal ? 0 : 1)} ${unit.padEnd(5)}  ${fmt(perServing, isKcal ? 0 : 1)} ${unit}`;
  }

  return [
    `NUTRITIONAL VALUES — ${entry.name.toUpperCase()}`,
    "",
    `${"".padEnd(26)}Per 100 g       Per ${entry.servingSizeG} g`,
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
  ].join("\n");
}

// ── Nutrition label ───────────────────────────────────────────────────────────

function NutritionLabel({ entry, servingGrams }: { entry: LibraryEntry; servingGrams: number }) {
  const t = useTranslations("library");
  const p = entry.per100g;
  const f = servingGrams / 100;

  const rows: Array<{ label: string; indent?: boolean; per100: number; perServing: number; unit: string }> = [
    { label: "Energy",             per100: p.calories,  perServing: p.calories  * f, unit: "kcal" },
    { label: "Fat",                per100: p.fat,       perServing: p.fat       * f, unit: "g"    },
    { label: "of which saturates", per100: p.saturates, perServing: p.saturates * f, unit: "g", indent: true },
    { label: "Carbohydrates",      per100: p.carbs,     perServing: p.carbs     * f, unit: "g"    },
    { label: "of which sugars",    per100: p.sugars,    perServing: p.sugars    * f, unit: "g", indent: true },
    { label: "Fibre",              per100: p.fibre,     perServing: p.fibre     * f, unit: "g"    },
    { label: "Protein",            per100: p.protein,   perServing: p.protein   * f, unit: "g"    },
    { label: "Salt",               per100: p.salt,      perServing: p.salt      * f, unit: "g"    },
  ];

  return (
    <div className="border-2 border-gray-900 font-mono text-sm w-full max-w-sm">
      <div className="bg-gray-900 text-white px-3 py-2">
        <p className="text-lg font-black tracking-tight">{t("nutritionFacts")}</p>
        <p className="text-xs text-gray-300 font-sans mt-0.5">{entry.name}</p>
      </div>
      <div className="flex border-b-4 border-gray-900 px-3 py-1 bg-white">
        <div className="flex-1" />
        <div className="w-24 text-center text-[10px] font-bold text-gray-500 uppercase">{t("per100g")}</div>
        <div className="w-24 text-center text-[10px] font-bold text-gray-500 uppercase">{t("perNg").replace("{n}", String(servingGrams))}</div>
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
        <p className="text-[9px] text-gray-400 font-sans">Serving size: {servingGrams} g</p>
      </div>
    </div>
  );
}

// ── Add / edit form ───────────────────────────────────────────────────────────

const BLANK: Omit<LibraryEntry, "id" | "createdAt"> = {
  name: "",
  description: "",
  servingSizeG: 100,
  per100g: { calories: 0, fat: 0, saturates: 0, carbs: 0, sugars: 0, fibre: 0, protein: 0, salt: 0 },
};

function AddForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: LibraryEntry;
  onSave: (entry: LibraryEntry) => void;
  onClose: () => void;
}) {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [name,        setName]        = useState(initial?.name         ?? "");
  const [description, setDescription] = useState(initial?.description  ?? "");
  const [serving,     setServing]     = useState(String(initial?.servingSizeG ?? 100));
  const [fields, setFields] = useState<NutritionPer100g>(
    initial?.per100g ?? { ...BLANK.per100g }
  );
  const [error, setError] = useState<string | null>(null);

  function setN(key: keyof NutritionPer100g, val: string) {
    setFields((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));
  }

  function handleSave() {
    if (!name.trim()) return setError(t("recipeNameLabel") + " required");
    setError(null);
    onSave({
      id:          initial?.id ?? crypto.randomUUID(),
      name:        name.trim(),
      description: description.trim(),
      servingSizeG: parseFloat(serving) || 100,
      per100g:     fields,
      createdAt:   initial?.createdAt ?? new Date().toISOString(),
    });
  }

  const nutrientRows: Array<[keyof NutritionPer100g, string]> = [
    ["calories",  t("calories")],
    ["fat",       t("fat")],
    ["saturates", t("saturates")],
    ["carbs",     t("carbs")],
    ["sugars",    t("sugars")],
    ["fibre",     t("fibre")],
    ["protein",   t("protein")],
    ["salt",      t("salt")],
  ];

  return (
    <div className="card p-6 border-brand-200 bg-brand-50 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{initial ? t("editRecipeTitle") : t("addRecipeTitle")}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="form-label">{t("recipeNameLabel")}</label>
          <input
            className="form-input"
            placeholder="e.g. Chocolate Layer Cake"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="form-label">{t("servingSize")}</label>
          <input
            className="form-input"
            type="number"
            min="1"
            placeholder="100"
            value={serving}
            onChange={(e) => setServing(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="form-label">{t("descriptionOpt")}</label>
        <input
          className="form-input"
          placeholder="Brief description of the recipe…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <p className="form-label mb-3">{t("nutritionHeader")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {nutrientRows.map(([key, label]) => (
            <div key={key}>
              <label className="form-label">{label}</label>
              <input
                className="form-input text-sm"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={fields[key] || ""}
                onChange={(e) => setN(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button onClick={handleSave} className="btn-primary">
          {initial ? t("saveChanges") : t("addToLibrary")}
        </button>
        <button onClick={onClose} className="btn-ghost">{tc("cancel")}</button>
      </div>
    </div>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: LibraryEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [expanded,     setExpanded]     = useState(false);
  const [servingGrams, setServingGrams] = useState(entry.servingSizeG);
  const [copied,       setCopied]       = useState(false);
  const timerRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopy() {
    const text = buildCopyText({ ...entry, servingSizeG: servingGrams });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  const p = entry.per100g;

  return (
    <div className={`card transition-all ${expanded ? "border-brand-300" : ""}`}>
      {/* Summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 text-left flex items-start justify-between gap-3"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{entry.name}</p>
          {entry.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.description}</p>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            <span>{p.calories} kcal</span>
            <span>Fat {p.fat}g</span>
            <span>Carbs {p.carbs}g</span>
            <span>Protein {p.protein}g</span>
          </div>
        </div>
        <span className="text-brand-400 text-xs mt-0.5 flex-shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-rose-100 p-4 space-y-4">
          {/* Serving size adjuster */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Serving</label>
            <input
              type="number"
              min="1"
              className="form-input w-24 text-sm"
              value={servingGrams}
              onChange={(e) => setServingGrams(Number(e.target.value) || entry.servingSizeG)}
            />
            <span className="text-sm text-gray-400">g</span>
            {servingGrams !== entry.servingSizeG && (
              <button
                onClick={() => setServingGrams(entry.servingSizeG)}
                className="text-xs text-brand-500 hover:text-brand-700"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <NutritionLabel entry={entry} servingGrams={servingGrams} />

            <div className="space-y-3">
              <button
                onClick={handleCopy}
                className="w-full btn-primary text-sm"
              >
                {copied ? "Copied!" : t("copyLabel")}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onEdit}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-brand-200 text-brand-600 text-xs font-semibold hover:bg-brand-50 transition-colors"
                >
                  {tc("edit")}
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
                >
                  {tc("delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const t = useTranslations("library");
  const [entries,  setEntries]  = useState<LibraryEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<LibraryEntry | null>(null);
  const [search,   setSearch]   = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  function handleSave(entry: LibraryEntry) {
    setEntries((prev) => {
      const exists = prev.find((e) => e.id === entry.id);
      const next   = exists
        ? prev.map((e) => (e.id === entry.id ? entry : e))
        : [...prev, entry];
      saveEntries(next);
      return next;
    });
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this recipe from the library?")) return;
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveEntries(next);
      return next;
    });
  }

  const filtered = entries.filter((e) =>
    search === "" ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <p className="text-gray-500 mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setEditing(null); }}
          className="btn-primary text-sm flex-shrink-0"
        >
          {t("addRecipe")}
        </button>
      </div>

      {/* Add / edit form */}
      {(showForm || editing) && (
        <AddForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Search */}
      {entries.length > 0 && (
        <input
          className="form-input"
          placeholder="Search your library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {/* Empty state */}
      {entries.length === 0 && !showForm && (
        <div className="card p-16 text-center space-y-4">
          <p className="text-4xl">📋</p>
          <p className="font-semibold text-gray-700">{t("emptyTitle")}</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">{t("emptyDesc")}</p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary mx-auto"
          >
            {t("addFirst")}
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => { setEditing(entry); setShowForm(false); }}
              onDelete={() => handleDelete(entry.id)}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && entries.length > 0 && (
        <div className="card p-10 text-center text-gray-400 text-sm">
          No recipes match your search.
        </div>
      )}
    </div>
  );
}
