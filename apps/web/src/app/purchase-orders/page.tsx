import { api } from "@/trpc/server";

export const dynamic = "force-dynamic";

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

export default async function PurchaseOrdersPage() {
  const orders = await api.purchaseOrders.getAll({ limit: 100 });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="page-title">Purchase Orders</h2>
        <p className="text-gray-500 mt-1">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">No purchase orders yet</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
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
                    {order.orderNumber ?? <span className="text-gray-700">No number</span>}
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
                      ? new Date(order.orderedAt).toLocaleDateString("en-GB")
                      : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {order.expectedDeliveryAt
                      ? new Date(order.expectedDeliveryAt).toLocaleDateString("en-GB")
                      : <span className="text-gray-700">—</span>}
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
