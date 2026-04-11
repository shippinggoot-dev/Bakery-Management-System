"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/trpc/react";
import { TrashIcon, PlusIcon } from "@/components/icons";

type IngredientRow = {
  ingredientId: string;
  quantity: string;
  unit: string;
  notes: string;
};

export default function NewRecipePage() {
  const router = useRouter();

  // form state
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId]   = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [yieldUnit, setYieldUnit]     = useState("");
  const [prepTime, setPrepTime]       = useState("");
  const [bakeTime, setBakeTime]       = useState("");
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes]             = useState("");
  const [rows, setRows]               = useState<IngredientRow[]>([]);
  const [error, setError]             = useState<string | null>(null);

  const { data: categories = [] } = api.recipes.getCategories.useQuery();
  const { data: allIngredients = [] } = api.ingredients.getAll.useQuery({ limit: 200 });

  const createMutation = api.recipes.create.useMutation({
    onSuccess: (recipe) => {
      router.push(`/recipes/${recipe!.id}`);
    },
    onError: (err) => setError(err.message),
  });

  function addRow() {
    setRows((r) => [...r, { ingredientId: "", quantity: "", unit: "g", notes: "" }]);
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
      <Link href="/recipes" className="text-sm text-gray-500 hover:text-gray-300">
        ← Back to Recipes
      </Link>

      <div>
        <h2 className="page-title">New Recipe</h2>
        <p className="text-gray-500 mt-1">Fill in the details below to add a recipe.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Name */}
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_80px_1fr_32px] gap-2 items-start">
                  <div>
                    {i === 0 && <p className="form-label mb-1">Ingredient</p>}
                    <select
                      className="form-input"
                      value={row.ingredientId}
                      onChange={(e) => updateRow(i, { ingredientId: e.target.value })}
                    >
                      <option value="">— pick —</option>
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
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
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
            className="px-6 py-2.5 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
