"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

type Category = { id: string; name: string; description: string | null };

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const utils = api.useUtils();
  const [open, setOpen]       = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError]     = useState<string | null>(null);

  const createCategory = api.recipes.createCategory.useMutation({
    onSuccess: () => {
      utils.recipes.getCategories.invalidate();
      setNewName("");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteCategory = api.recipes.deleteCategory.useMutation({
    onSuccess: () => utils.recipes.getCategories.invalidate(),
    onError: (err) => setError(err.message),
  });

  const { data: categories = initialCategories } = api.recipes.getCategories.useQuery(undefined, {
    initialData: initialCategories,
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createCategory.mutate({ name: newName.trim() });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2"
      >
        Manage categories
      </button>
    );
  }

  return (
    <div className="card p-5 space-y-4 border-gray-700/50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Recipe Categories</h3>
        <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <span key={cat.id} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-800 text-gray-300 text-sm">
            {cat.name}
            <button
              onClick={() => {
                if (confirm(`Delete category "${cat.name}"? Recipes using it will be set to uncategorised.`)) {
                  deleteCategory.mutate(cat.id);
                }
              }}
              className="text-gray-600 hover:text-red-400 transition-colors leading-none"
              aria-label={`Delete ${cat.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-gray-600">No categories yet.</p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          className="form-input flex-1 text-sm"
          placeholder="New category name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
        />
        <button
          type="submit"
          disabled={createCategory.isPending || !newName.trim()}
          className="px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {createCategory.isPending ? "Adding…" : "Add"}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
