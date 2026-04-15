import { api } from "@/trpc/server";
import ShoppingListsClient from "./_client";

export default async function ShoppingListsPage() {
  // Fetch server-side so the page arrives with data — no client-side waterfall.
  const initialLists = await api.shoppingLists.getAll({ limit: 100 }).catch(() => []);
  return <ShoppingListsClient initialLists={initialLists} />;
}
