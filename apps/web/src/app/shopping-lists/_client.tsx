"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";
import type { AppRouter } from "@bakery/api";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ShoppingListsData = RouterOutputs["shoppingLists"]["getAll"];

const statusStyle: Record<string, string> = {
  draft:       "bg-gray-800 text-gray-400",
  in_progress: "bg-blue-950/60 text-blue-400",
  completed:   "bg-emerald-950/60 text-emerald-400",
};

const statusLabel: Record<string, string> = {
  draft:       "Draft",
  in_progress: "In Progress",
  completed:   "Completed",
};

function AddListForm({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils();
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate]         = useState("");
  const [notes, setNotes]             = useState("");
  const [error, setError]             = useState<string | null>(null);

  const create = api.shoppingLists.create.useMutation({
    onSuccess: () => { utils.shoppingLists.getAll.invalidate(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    setError(null);
    create.mutate({
      name: name.trim(),
      description: description.trim() || null,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="card p-6 border-brand-500/30 bg-brand-500/5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">New Shopping List</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Name *</label>
            <input className="form-input" placeholder="e.g. Weekly Bake – Week 20" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="form-label">Due date</label>
            <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Description</label>
          <input className="form-input" placeholder="What is this list for?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Notes</label>
          <input className="form-input" placeholder="Any extra notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={create.isPending}
            className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create List"}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function ShoppingListsClient({
  initialLists,
}: {
  initialLists: ShoppingListsData;
}) {
  const [showAdd, setShowAdd] = useState(false);
  // initialData means the query is considered already populated — no extra
  // fetch on mount. React Query will still refetch in the background after
  // staleTime (5 min) or when invalidated by a mutation.
  const { data: lists = [] } = api.shoppingLists.getAll.useQuery(
    { limit: 100 },
    { initialData: initialLists, initialDataUpdatedAt: Date.now() }
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Shopping Lists</h2>
          <p className="text-gray-500 mt-1">{lists.length} list{lists.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          New List
        </button>
      </div>

      {showAdd && <AddListForm onClose={() => setShowAdd(false)} />}

      {lists.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">No shopping lists yet</p>
          <p className="text-sm mt-1">Use the button above to create one.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-800/50 border-b border-gray-800">
                <th className="table-header px-6 py-3">Name</th>
                <th className="table-header px-6 py-3">Status</th>
                <th className="table-header px-6 py-3">Due date</th>
                <th className="table-header px-6 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lists.map((list) => (
                <tr key={list.id} className="hover:bg-gray-800/40">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-100">{list.name}</p>
                    {list.description && <p className="text-xs text-gray-600 mt-0.5">{list.description}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`badge ${statusStyle[list.status] ?? "bg-gray-800 text-gray-400"}`}>
                      {statusLabel[list.status] ?? list.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {list.dueDate ?? <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {list.notes ?? <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
