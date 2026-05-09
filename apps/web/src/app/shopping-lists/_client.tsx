"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";
import type { AppRouter } from "@bakery/api";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ShoppingListsData = RouterOutputs["shoppingLists"]["getAll"];

const statusStyle: Record<string, string> = {
  draft:       "bg-gray-100 text-gray-500 border-gray-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed:   "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function AddListForm({ onClose }: { onClose: () => void }) {
  const t  = useTranslations("shoppingLists");
  const tc = useTranslations("common");
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
    if (!name.trim()) return setError(t("listName") + " required");
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
        <h3 className="section-title">{t("newListTitle")}</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("listName")}</label>
            <input className="form-input" placeholder={t("listNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="form-label">{t("dueDate")}</label>
            <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">{t("description")}</label>
          <input className="form-input" placeholder={t("descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="form-label">{t("notes")}</label>
          <input className="form-input" placeholder={t("notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={create.isPending}
            className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50">
            {create.isPending ? t("creating") : t("createList")}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors">{tc("cancel")}</button>
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
  const t = useTranslations("shoppingLists");
  const [showAdd, setShowAdd] = useState(false);

  const { data: lists = [] } = api.shoppingLists.getAll.useQuery(
    { limit: 100 },
    { initialData: initialLists, initialDataUpdatedAt: Date.now() }
  );

  const statusLabel: Record<string, string> = {
    draft:       t("statusDraft"),
    in_progress: t("statusInProgress"),
    completed:   t("statusCompleted"),
  };

  const subtitle = lists.length === 1
    ? t("subtitle").replace("{count}", "1")
    : t("subtitlePlural").replace("{count}", String(lists.length));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{subtitle}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          {t("newList")}
        </button>
      </div>

      {showAdd && <AddListForm onClose={() => setShowAdd(false)} />}

      {lists.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">{t("noListsTitle")}</p>
          <p className="text-sm mt-1">{t("noListsHint")}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-rose-50 border-b border-rose-100">
                <th className="table-header px-6 py-3">{t("nameCol")}</th>
                <th className="table-header px-6 py-3">{t("statusCol")}</th>
                <th className="table-header px-6 py-3">{t("dueDateCol")}</th>
                <th className="table-header px-6 py-3">{t("notesCol")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50">
              {lists.map((list) => (
                <tr key={list.id} className="hover:bg-rose-50/50">
                  <td className="px-6 py-4">
                    <Link href={`/shopping-lists/${list.id}`} className="font-medium text-gray-800 hover:text-brand-600 transition-colors">
                      {list.name}
                    </Link>
                    {list.description && <p className="text-xs text-gray-600 mt-0.5">{list.description}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`badge ${statusStyle[list.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {statusLabel[list.status] ?? list.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {list.dueDate ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {list.notes ?? <span className="text-gray-400">—</span>}
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
