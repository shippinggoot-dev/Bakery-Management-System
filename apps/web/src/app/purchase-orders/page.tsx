import { api } from "@/trpc/server";
import PurchaseOrdersClient from "./_client";

export default async function PurchaseOrdersPage() {
  const initialOrders = await api.purchaseOrders.getAll({ limit: 100 }).catch(() => []);
  return <PurchaseOrdersClient initialOrders={initialOrders} />;
}
