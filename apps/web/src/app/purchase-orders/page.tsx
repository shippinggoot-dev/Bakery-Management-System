"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";

const statusStyle: Record<string, string> = {
  draft:     "bg-gray-800 text-gray-400",
  sent:      "bg-blue-950/60 text-blue-400",
  confirmed: "bg-violet-950/60 text-violet-400",
  delivered: "bg-emerald-950/60 text-emerald-400",
  cancelled: "bg-red-950/60 text-red-400",
};

const statusLabel: Record<string, string> = {
  draft:     "Draft",
  sent:      "Sent",
  confirmed: "Confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function AddOrderForm({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils();
  const [supplierId, setSupplierId]   = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [notes, setNotes]             = useState("");
  const [error, setError]             = useState<string | null>(null);

  const { data: suppliers = [] } = api.suppliers.getAll.useQuery({ isActive: true });

  const create = api.purchaseOrders.create.useMutation({
    onSuccess: () => { utils.purchaseOrders.getAll.invalidate(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return setError("Please select a supplier.");
    setError(null);
    create.mutate({
      supplierId,
      orderNumber: orderNumber.trim() || null,
      notes: notes.trim() || null,
      items: [],
    });
  }

  return (
    <div className="card p-6 border-brand-500/30 bg-brand-500/5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">New Purchase Order</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Supplier *</label>
            <select className="form-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Order number</label>
            <input className="form-input" placeholder="e.g. PO-2024-001" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Notes</label>
          <input className="form-input" placeholder="Any instructions or notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={create.isPending}
            className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create Order"}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: orders = [], isLoading } = api.purchaseOrders.getAll.useQuery({ limit: 100 });

  if (isLoading) {
    return <div className="max-w-5xl mx-auto"><div className="card p-10 text-center text-gray-600">Loading…</div></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Purchase Orders</h2>
          <p className="text-gray-500 mt-1">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          New Order
        </button>
      </div>

      {showAdd && <AddOrderForm onClose={() => setShowAdd(false)} />}

      {orders.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">No purchase orders yet</p>
          <p className="text-sm mt-1">Use the button above to create one.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-800/50 border-b border-gray-800">
                <th className="table-header px-6 py-3">Order #</th>
                <th className="table-header px-6 py-3">Supplier</th>
                <th className="table-header px-6 py-3">Status</th>
                <th className="table-header px-6 py-3">Ordered</th>
                <th className="table-header px-6 py-3">Expected delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-800/40">
                  <td className="px-6 py-4 font-mono text-sm text-gray-400">
                    {order.orderNumber ?? <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-200">
                    {order.supplier?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`badge ${statusStyle[order.status] ?? "bg-gray-800 text-gray-400"}`}>
                      {statusLabel[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {order.orderedAt
                      ? new Date(order.orderedAt).toLocaleDateString("nb-NO")
                      : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {order.expectedDeliveryAt
                      ? new Date(order.expectedDeliveryAt).toLocaleDateString("nb-NO")
                      : <span className="text-gray-700">—</span>}
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
