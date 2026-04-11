import Link from "next/link";
import { api } from "@/trpc/server";

export const dynamic = "force-dynamic";

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

export default async function ShoppingListsPage() {
  const lists = await api.shoppingLists.getAll({ limit: 100 });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="page-title">Shopping Lists</h2>
        <p className="text-gray-500 mt-1">{lists.length} list{lists.length !== 1 ? "s" : ""}</p>
      </div>

      {lists.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">No shopping lists yet</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
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
                    {list.description && (
                      <p className="text-xs text-gray-600 mt-0.5">{list.description}</p>
                    )}
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
      )}
    </div>
  );
}
