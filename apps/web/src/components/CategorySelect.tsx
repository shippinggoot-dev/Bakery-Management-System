"use client";

import { useState } from "react";

interface Category {
  id: string;
  name: string;
}

interface CategorySelectProps {
  categories:  Category[];
  value:       string;
  onChange:    (id: string) => void;
  onCreate:    (name: string) => Promise<Category>;
  placeholder?: string;
}

export function CategorySelect({
  categories,
  value,
  onChange,
  onCreate,
  placeholder = "— No category —",
}: CategorySelectProps) {
  const [adding,   setAdding]   = useState(false);
  const [newName,  setNewName]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [extra,    setExtra]    = useState<Category[]>([]);

  const allCategories = [...categories, ...extra].sort((a, b) => a.name.localeCompare(b.name));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await onCreate(name);
      setExtra((prev) => [...prev, created]);
      onChange(created.id);
      setAdding(false);
      setNewName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <select
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {allCategories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-brand-500 hover:text-brand-700 transition-colors"
        >
          + New category
        </button>
      ) : (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            autoFocus
            className="form-input flex-1 text-sm py-1.5"
            placeholder="Category name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setNewName(""))}
          />
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="px-3 py-1.5 rounded-lg bg-brand-500/20 text-brand-600 border border-brand-500/30 text-xs font-semibold hover:bg-brand-500/30 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saving ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
