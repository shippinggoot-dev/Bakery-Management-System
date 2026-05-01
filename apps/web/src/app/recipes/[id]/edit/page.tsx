"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/trpc/react";
import { TrashIcon, PlusIcon } from "@/components/icons";

type IngredientRow = {
  rowKey:       string;
  id?:          string;
  ingredientId: string;
  quantity:     string;
  unit:         string;
  notes:        string;
};

let _key = 0;
function nextKey() { return String(++_key); }

export default function EditRecipePage() {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const id      = params.id;

  const { data: recipe, isLoading } = api.recipes.getById.useQuery(id);
  const { data: categories = [] }   = api.recipes.getCategories.useQuery();
  const { data: allIngredients = [], refetch: refetchIngredients } = api.ingredients.getAll.useQuery({ limit: 200 });

  const [name,         setName]         = useState("");
  const [description,  setDescription]  = useState("");
  const [categoryId,   setCategoryId]   = useState("");
  const [yieldAmount,  setYieldAmount]  = useState("");
  const [yieldUnit,    setYieldUnit]    = useState("");
  const [prepTime,     setPrepTime]     = useState("");
  const [bakeTime,     setBakeTime]     = useState("");
  const [instructions, setInstructions] = useState("");
  const [notes,        setNotes]        = useState("");
  const [rows,         setRows]         = useState<IngredientRow[]>([]);
  const [removedIds,   setRemovedIds]   = useState<string[]>([]);
  const [error,        setError]        = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);

  // Inline ingredient creation state
  const [creatingForKey, setCreatingForKey] = useState<string | null>(null);
  const [newIngName,     setNewIngName]     = useState("");
  const [newIngUnit,     setNewIngUnit]     = useState("g");
  const [creating,       setCreating]       = useState(false);

  const updateRecipe      = api.recipes.update.useMutation();
  const addIngredient     = api.recipes.addIngredient.useMutation();
  const updateIngredient  = api.recipes.updateIngredient.useMutation();
  const removeIngredient  = api.recipes.removeIngredient.useMutation();
  const createIngredient  = api.ingredients.create.useMutation();

  useEffect(() => {
    if (!recipe) return;
    setName(recipe.name);
    setDescription(recipe.description ?? "");
    setCategoryId(recipe.categoryId ?? "");
    setYieldAmount(recipe.yieldAmount);
    setYieldUnit(recipe.yieldUnit);
    setPrepTime(recipe.prepTimeMinutes ? String(recipe.prepTimeMinutes) : "");
    setBakeTime(recipe.bakeTimeMinutes ? String(recipe.bakeTimeMinutes) : "");
    setInstructions(recipe.instructions ?? "");
    setNotes(recipe.notes ?? "");
    setRows(
      recipe.ingredients.map((ri) => ({
        rowKey:       nextKey(),
        id:           ri.id,
        ingredientId: ri.ingredientId,
        quantity:     ri.quantity,
        unit:         ri.unit,
        notes:        ri.notes ?? "",
      }))
    );
  }, [recipe]);

  function addRow() {
    setRows((r) => [...r, { rowKey: nextKey(), ingredientId: "", quantity: "", unit: "g", notes: "" }]);
  }

  function removeRow(rowKey: string) {
    setRows((r) => {
      const row = r.find((x) => x.rowKey === rowKey);
      if (row?.id) setRemovedIds((ids) => [...ids, row.id!]);
      return r.filter((x) => x.rowKey !== rowKey);
    });
    if (creatingForKey === rowKey) setCreatingForKey(null);
  }

  function updateRow(rowKey: string, patch: Partial<IngredientRow>) {
    setRows((r) => r.map((row) => row.rowKey === rowKey ? { ...row, ...patch } : row));
  }

  async function handleQuickCreate(rowKey: string) {
    if (!newIngName.trim() || !newIngUnit.trim()) return;
    setCreating(true);
    try {
      const created = await createIngredient.mutateAsync({
        ingredient: { name: newIngName.trim(), unit: newIngUnit.trim() },
      });
      await refetchIngredients();
      updateRow(rowKey, { ingredientId: created!.id, unit: newIngUnit.trim() });
      setCreatingForKey(null);
      setNewIngName("");
      setNewIngUnit("g");
    } catch {
      // leave form open so user can retry
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Recipe name is required."); return; }
    if (!yieldAmount.trim() || !yieldUnit.trim()) { setError("Yield is required."); return; }
    setSaving(true);

    try {
      const validRows = rows.filter((r) => r.ingredientId && r.quantity);

      await updateRecipe.mutateAsync({
        id,
        data: {
          name:            name.trim(),
          description:     description.trim() || undefined,
          categoryId:      categoryId || null,
          yieldAmount:     yieldAmount.trim(),
          yieldUnit:       yieldUnit.trim(),
          prepTimeMinutes: prepTime ? parseInt(prepTime) : null,
          bakeTimeMinutes: bakeTime ? parseInt(bakeTime) : null,
          instructions:    instructions.trim() || null,
          notes:           notes.trim() || null,
        },
      });

      await Promise.all(removedIds.map((rid) => removeIngredient.mutateAsync(rid)));

      const existing = validRows.filter((r) => r.id);
      await Promise.all(
        existing.map((r) =>
          updateIngredient.mutateAsync({
            id: r.id!,
            data: { ingredientId: r.ingredientId, quantity: r.quantity, unit: r.unit, notes: r.notes || null },
          })
        )
      );

      const newRows = validRows.filter((r) => !r.id);
      await Promise.all(
        newRows.map((r, i) =>
          addIngredient.mutateAsync({
            recipeId: id,
            ingredient: {
              ingredientId: r.ingredientId,
              quantity:     r.quantity,
              unit:         r.unit,
              notes:        r.notes || null,
              sortOrder:    existing.length + i + 1,
            },
          })
        )
      );

      router.push(`/recipes/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
      setSaving(false);
    }
  }

  const unmatchedCount = rows.filter((r) => !r.ingredientId && r.quantity).length;

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-5 bg-rose-100 rounded w-32" />
        <div className="h-8 bg-rose-100 rounded w-48" />
        <div className="card p-6 space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-rose-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (!recipe) {
    return <div className="text-center py-16 text-gray-400">Recipe not found.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/recipes/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to recipe
        </Link>
      </div>

      <div>
        <h2 className="page-title">Edit Recipe</h2>
        <p className="text-gray-500 mt-1 text-sm">{recipe.name}</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        <div className="card p-6 space-y-4">
          <h3 className="section-title">Basic info</h3>
          <div>
            <label className="form-label">Recipe name *</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select className="form-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— No category —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="section-title">Yield & timing</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Yield amount *</label>
              <input className="form-input" value={yieldAmount} onChange={(e) => setYieldAmount(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Yield unit *</label>
              <input className="form-input" placeholder="buns, loaf…" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Prep time (min)</label>
              <input className="form-input" type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Bake time (min)</label>
              <input className="form-input" type="number" min="0" value={bakeTime} onChange={(e) => setBakeTime(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="section-title">Ingredients</h3>

          {unmatchedCount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              {unmatchedCount} ingredient{unmatchedCount !== 1 ? "s are" : " is"} not linked to your ingredient list
              and will be skipped when saving. Pick from the dropdown or create a new ingredient below.
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <div className="space-y-3 min-w-[520px]">
                {rows.map((row, i) => {
                  const sel = allIngredients.find((x) => x.id === row.ingredientId);
                  const isCreatingThis = creatingForKey === row.rowKey;
                  return (
                    <div key={row.rowKey} className="space-y-1">
                      <div className="grid grid-cols-[1fr_90px_80px_1fr_32px] gap-2 items-start">
                        <div>
                          {i === 0 && <p className="form-label mb-1">Ingredient</p>}
                          <select
                            className={`form-input ${!row.ingredientId ? "border-amber-300 bg-amber-50" : ""}`}
                            value={row.ingredientId}
                            onChange={(e) => {
                              const ing = allIngredients.find((x) => x.id === e.target.value);
                              updateRow(row.rowKey, { ingredientId: e.target.value, unit: ing?.unit ?? row.unit });
                              if (creatingForKey === row.rowKey) setCreatingForKey(null);
                            }}
                          >
                            <option value="">— pick —</option>
                            {allIngredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                          </select>
                        </div>
                        <div>
                          {i === 0 && <p className="form-label mb-1">Amount</p>}
                          <input className="form-input" placeholder="100" value={row.quantity} onChange={(e) => updateRow(row.rowKey, { quantity: e.target.value })} />
                        </div>
                        <div>
                          {i === 0 && <p className="form-label mb-1">Unit</p>}
                          <input className="form-input" value={row.unit || sel?.unit || ""} onChange={(e) => updateRow(row.rowKey, { unit: e.target.value })} />
                        </div>
                        <div>
                          {i === 0 && <p className="form-label mb-1">Notes</p>}
                          <input className="form-input" placeholder="e.g. softened" value={row.notes} onChange={(e) => updateRow(row.rowKey, { notes: e.target.value })} />
                        </div>
                        <div className={i === 0 ? "mt-6" : ""}>
                          <button type="button" onClick={() => removeRow(row.rowKey)} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
                            <TrashIcon />
                          </button>
                        </div>
                      </div>

                      {/* Inline create form — shown when no ingredient selected */}
                      {!row.ingredientId && !isCreatingThis && (
                        <button
                          type="button"
                          onClick={() => { setCreatingForKey(row.rowKey); setNewIngName(""); setNewIngUnit("g"); }}
                          className="ml-1 text-xs text-brand-500 hover:text-brand-700 transition-colors"
                        >
                          + Create new ingredient
                        </button>
                      )}

                      {isCreatingThis && (
                        <div className="ml-1 flex items-center gap-2 flex-wrap">
                          <input
                            autoFocus
                            className="form-input w-40 text-sm"
                            placeholder="Ingredient name"
                            value={newIngName}
                            onChange={(e) => setNewIngName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleQuickCreate(row.rowKey))}
                          />
                          <input
                            className="form-input w-20 text-sm"
                            placeholder="Unit"
                            value={newIngUnit}
                            onChange={(e) => setNewIngUnit(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleQuickCreate(row.rowKey))}
                          />
                          <button
                            type="button"
                            disabled={creating || !newIngName.trim()}
                            onClick={() => handleQuickCreate(row.rowKey)}
                            className="px-3 py-1.5 rounded-lg bg-brand-500/20 text-brand-600 border border-brand-500/30 text-xs font-semibold hover:bg-brand-500/30 disabled:opacity-50 transition-colors"
                          >
                            {creating ? "Adding…" : "Add"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreatingForKey(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button type="button" onClick={addRow} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-400 transition-colors">
            <PlusIcon /> Add ingredient
          </button>
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="section-title">Instructions</h3>
          <textarea className="form-input resize-none" rows={8} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="section-title">Baker's notes</h3>
          <textarea className="form-input resize-none" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center gap-3 pb-8">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/recipes/${id}`} className="px-6 py-2.5 rounded-lg text-gray-500 hover:text-gray-700 text-sm transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
