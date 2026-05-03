"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/trpc/react";
import { TrashIcon, PlusIcon } from "@/components/icons";
import { parseRecipeText } from "@/lib/recipe-parser";
import { TagCombobox } from "@/components/TagCombobox";

type IngredientRow = {
  ingredientId: string;
  importedName: string; // name from AI parse — shown when ingredientId is not yet matched
  quantity: string;
  unit: string;
  notes: string;
};

function ImportPanel({ onImport }: {
  onImport: (data: {
    name: string; description: string | null; category: string | null;
    yieldAmount: string; yieldUnit: string;
    prepTimeMinutes: number | null; bakeTimeMinutes: number | null;
    ingredients: { name: string; quantity: string; unit: string; notes: string | null }[];
    instructions: string | null; notes: string | null;
  }) => void;
}) {
  const [open, setOpen]           = useState(false);
  const [text, setText]           = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  function handleParse() {
    setParseError(null);
    try {
      const result = parseRecipeText(text);
      onImport(result);
      setOpen(false);
      setText("");
    } catch {
      setParseError("Could not parse the recipe. Try tidying the text a little and try again.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full card px-5 py-4 flex items-center gap-3 text-left hover:border-brand-500/40 hover:bg-brand-500/5 transition-all group"
      >
        <span className="text-2xl">📋</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-700 group-hover:text-brand-600 transition-colors">
            Import from text
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            Paste a recipe from a website, Word doc, or anywhere — the form fills in automatically
          </p>
        </div>
        <span className="text-gray-600 group-hover:text-brand-400 transition-colors text-lg">→</span>
      </button>
    );
  }

  return (
    <div className="card p-6 border-brand-500/30 bg-brand-500/5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="section-title">Import from text</h3>
          <p className="text-sm text-gray-500 mt-1">
            Paste any recipe below — the parser will extract the name, ingredients, times, and instructions.
            Review the result and correct anything it missed.
          </p>
        </div>
        <button onClick={() => { setOpen(false); setParseError(null); }}
          className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0">×</button>
      </div>

      <textarea
        className="form-input resize-none text-sm"
        rows={10}
        placeholder={"Paste the recipe here…\n\nWorks best when the recipe has clear sections:\n  Ingredients:\n  250g flour\n  2 eggs\n\n  Instructions:\n  1. Mix the flour…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />

      {parseError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {parseError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleParse}
          disabled={text.trim().length < 10}
          className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50"
        >
          Fill in form
        </button>
        <button onClick={() => { setOpen(false); setParseError(null); }}
          className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-700 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function NewRecipePage() {
  const router = useRouter();

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId]   = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [yieldUnit, setYieldUnit]     = useState("");
  const [prepTime, setPrepTime]       = useState("");
  const [bakeTime, setBakeTime]       = useState("");
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes]             = useState("");
  const [flavours, setFlavours]       = useState<string[]>([]);
  const [rows, setRows]               = useState<IngredientRow[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [importBanner, setImportBanner] = useState<string | null>(null);

  const { data: categories = [] } = api.recipes.getCategories.useQuery();
  const { data: allIngredients = [] } = api.ingredients.getAll.useQuery({ limit: 200 });

  const recordUsage = api.customOptions.recordUsage.useMutation();
  const createMutation = api.recipes.create.useMutation({
    onSuccess: (recipe) => {
      if (flavours.length > 0) recordUsage.mutate({ fieldKey: "recipe.flavours", values: flavours });
      router.push(`/recipes/${recipe!.id}`);
    },
    onError: (err) => setError(err.message),
  });

  // Called when the AI returns parsed recipe data
  function handleImport(data: {
    name: string; description: string | null; category: string | null;
    yieldAmount: string; yieldUnit: string;
    prepTimeMinutes: number | null; bakeTimeMinutes: number | null;
    ingredients: { name: string; quantity: string; unit: string; notes: string | null }[];
    instructions: string | null; notes: string | null;
  }) {
    setName(data.name);
    setDescription(data.description ?? "");
    setYieldAmount(data.yieldAmount);
    setYieldUnit(data.yieldUnit);
    setPrepTime(data.prepTimeMinutes ? String(data.prepTimeMinutes) : "");
    setBakeTime(data.bakeTimeMinutes ? String(data.bakeTimeMinutes) : "");
    setInstructions(data.instructions ?? "");
    setNotes(data.notes ?? "");

    // Match category by name
    if (data.category) {
      const matched = categories.find(
        (c) => c.name.toLowerCase() === data.category!.toLowerCase()
      );
      setCategoryId(matched?.id ?? "");
    } else {
      setCategoryId("");
    }

    // Match ingredients by name (case-insensitive), leave unmatched for user to pick
    const newRows: IngredientRow[] = data.ingredients.map((ing) => {
      const matched = allIngredients.find(
        (db) => db.name.toLowerCase() === ing.name.toLowerCase()
      );
      return {
        ingredientId: matched?.id ?? "",
        importedName: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        notes: ing.notes ?? "",
      };
    });
    setRows(newRows);

    const unmatched = newRows.filter((r) => !r.ingredientId).length;
    const isPlaceholderName = data.name === "Imported Recipe";
    const nameNote = isPlaceholderName ? " Give the recipe a name above." : "";
    setImportBanner(
      unmatched === 0
        ? `Imported ${newRows.length} ingredient${newRows.length !== 1 ? "s" : ""}.${nameNote} Review and save.`
        : `Imported ${newRows.length} ingredient${newRows.length !== 1 ? "s" : ""} — ${unmatched} not matched to your list yet, select them below.${nameNote}`
    );
  }

  function addRow() {
    setRows((r) => [...r, { ingredientId: "", importedName: "", quantity: "", unit: "g", notes: "" }]);
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<IngredientRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validRows = rows.filter((r) => r.ingredientId && r.quantity);
    if (!name.trim()) return setError("Recipe name is required.");
    if (!yieldAmount.trim() || !yieldUnit.trim()) return setError("Yield amount and unit are required.");

    createMutation.mutate({
      recipe: {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId || null,
        yieldAmount: yieldAmount.trim(),
        yieldUnit: yieldUnit.trim(),
        prepTimeMinutes: prepTime ? parseInt(prepTime) : null,
        bakeTimeMinutes: bakeTime ? parseInt(bakeTime) : null,
        instructions: instructions.trim() || null,
        notes: notes.trim() || null,
        flavours: flavours.join(",") || null,
        isActive: true,
      },
      ingredients: validRows.map((r, i) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
        unit: r.unit,
        notes: r.notes || null,
        sortOrder: i + 1,
      })),
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/recipes" className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to Recipes
      </Link>

      <div>
        <h2 className="page-title">New Recipe</h2>
        <p className="text-gray-500 mt-1">Fill in the details below, or paste an existing recipe to import it.</p>
      </div>

      {/* AI Import panel */}
      <ImportPanel onImport={handleImport} />

      {/* Import success banner */}
      {importBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>✓</span>
          <span className="flex-1">{importBanner}</span>
          <button onClick={() => setImportBanner(null)} className="text-emerald-500 hover:text-emerald-700 leading-none">×</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Basic info */}
        <div className="card p-6 space-y-4">
          <h3 className="section-title">Basic info</h3>

          <div>
            <label className="form-label">Recipe name *</label>
            <input
              className="form-input"
              placeholder="e.g. Cardamom Buns"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-input resize-none"
              rows={2}
              placeholder="A short description of the recipe…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Flavours</label>
            <TagCombobox
              fieldKey="recipe.flavours"
              values={flavours}
              onChange={setFlavours}
              placeholder="e.g. Chocolate, Vanilla, Strawberry…"
            />
          </div>

          <div>
            <label className="form-label">Category</label>
            <select
              className="form-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— No category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Yield & timing */}
        <div className="card p-6 space-y-4">
          <h3 className="section-title">Yield & timing</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Yield amount *</label>
              <input
                className="form-input"
                placeholder="e.g. 12"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Yield unit *</label>
              <input
                className="form-input"
                placeholder="e.g. buns, loaf, pieces"
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Prep time (min)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="e.g. 30"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Bake time (min)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="e.g. 25"
                value={bakeTime}
                onChange={(e) => setBakeTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div className="card p-6 space-y-4">
          <h3 className="section-title">Ingredients</h3>

          {rows.length > 0 && (
            <div className="overflow-x-auto">
            <div className="space-y-2 min-w-[560px]">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_80px_1fr_32px] gap-2 items-start">
                  <div>
                    {i === 0 && <p className="form-label mb-1">Ingredient</p>}
                    <select
                      className={`form-input ${!row.ingredientId && row.importedName ? "border-amber-700/60 focus:border-amber-500/60 focus:ring-amber-500/20" : ""}`}
                      value={row.ingredientId}
                      onChange={(e) => updateRow(i, { ingredientId: e.target.value })}
                    >
                      <option value="">
                        {row.importedName ? `⚠ ${row.importedName}` : "— pick —"}
                      </option>
                      {allIngredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>{ing.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {i === 0 && <p className="form-label mb-1">Amount</p>}
                    <input
                      className="form-input"
                      placeholder="100"
                      value={row.quantity}
                      onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    {i === 0 && <p className="form-label mb-1">Unit</p>}
                    <input
                      className="form-input"
                      placeholder="g"
                      value={row.unit}
                      onChange={(e) => updateRow(i, { unit: e.target.value })}
                    />
                  </div>
                  <div>
                    {i === 0 && <p className="form-label mb-1">Notes (optional)</p>}
                    <input
                      className="form-input"
                      placeholder="e.g. softened"
                      value={row.notes}
                      onChange={(e) => updateRow(i, { notes: e.target.value })}
                    />
                  </div>
                  <div className={i === 0 ? "mt-6" : ""}>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </div>
          )}

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-400 transition-colors"
          >
            <PlusIcon />
            Add ingredient
          </button>
        </div>

        {/* Instructions */}
        <div className="card p-6 space-y-4">
          <h3 className="section-title">Instructions</h3>
          <textarea
            className="form-input resize-none"
            rows={8}
            placeholder={"Step-by-step instructions…\n\nTip: number your steps for clarity."}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {/* Baker's notes */}
        <div className="card p-6 space-y-4">
          <h3 className="section-title">Baker's notes</h3>
          <textarea
            className="form-input resize-none"
            rows={3}
            placeholder="Tips, substitutions, storage info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pb-8">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-6 py-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving…" : "Save Recipe"}
          </button>
          <Link
            href="/recipes"
            className="px-6 py-2.5 rounded-lg text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
