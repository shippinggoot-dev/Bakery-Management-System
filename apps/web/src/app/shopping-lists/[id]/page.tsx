"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

export default function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t  = useTranslations("shoppingLists");
  const tc = useTranslations("common");
  const utils = api.useUtils();

  const { data: list, isLoading } = api.shoppingLists.getById.useQuery(id);

  const togglePurchased = api.shoppingLists.markItemPurchased.useMutation({
    onSuccess: () => utils.shoppingLists.getById.invalidate(id),
  });

  const generatePo = api.purchaseOrders.generateFromShoppingList.useMutation({
    onSuccess: (po) => router.push(`/purchase-orders/${po!.id}`),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 bg-rose-100 rounded w-48" />
        <div className="card p-6 space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-rose-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/shopping-lists" className="text-sm text-gray-500 hover:text-gray-700">
          ← {tc("back")}
        </Link>
        <p className="text-center py-16 text-gray-400">{t("notFound")}</p>
      </div>
    );
  }

  // Group items by their ingredient's preferred supplier.
  // null bucket = ingredients without a preferred supplier set.
  type Item = (typeof list.items)[number];
  const buckets = new Map<string, { supplierName: string; supplierId: string | null; items: Item[] }>();

  for (const item of list.items) {
    const pref = item.ingredient.ingredientSuppliers?.[0]?.supplier ?? null;
    const key  = pref?.id ?? "__none__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        supplierName: pref?.name ?? t("noPreferredSupplierGroup"),
        supplierId:   pref?.id ?? null,
        items:        [],
      });
    }
    buckets.get(key)!.items.push(item);
  }

  const groups = [...buckets.values()].sort((a, b) => {
    // No-supplier bucket last
    if (a.supplierId === null) return 1;
    if (b.supplierId === null) return -1;
    return a.supplierName.localeCompare(b.supplierName);
  });

  const totalItems     = list.items.length;
  const purchasedItems = list.items.filter((i) => i.isPurchased).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/shopping-lists" className="text-sm text-gray-500 hover:text-gray-700">
          ← {t("backToLists")}
        </Link>
        <span className="text-xs text-brand-400">
          {t("itemsProgress")
            .replace("{purchased}", String(purchasedItems))
            .replace("{total}", String(totalItems))}
        </span>
      </div>

      <div className="card p-6">
        <h2 className="page-title">{list.name}</h2>
        {list.description && <p className="text-gray-500 mt-1">{list.description}</p>}
        {list.dueDate && (
          <p className="text-xs text-brand-400 mt-2">
            {t("dueDate")}: <span className="font-medium">{list.dueDate}</span>
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <p className="text-3xl mb-2">🛒</p>
          <p className="text-sm">{t("emptyList")}</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.supplierId ?? "__none__"} className="card overflow-hidden">
            <div className="px-5 py-3 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚚</span>
                <h3 className="font-semibold text-gray-800 text-sm">{group.supplierName}</h3>
                <span className="text-xs text-brand-400">
                  ({group.items.length} {group.items.length === 1 ? t("itemSingular") : t("itemPlural")})
                </span>
              </div>
              {group.supplierId && (
                <button
                  onClick={() => generatePo.mutate({ shoppingListId: list.id, supplierId: group.supplierId! })}
                  disabled={generatePo.isPending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {generatePo.isPending ? t("generatingPo") : t("generatePo")}
                </button>
              )}
            </div>
            <div className="divide-y divide-rose-50">
              {group.items.map((item) => (
                <label key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-rose-50/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.isPurchased}
                    onChange={(e) =>
                      togglePurchased.mutate({ id: item.id, isPurchased: e.target.checked })
                    }
                    className="w-4 h-4 rounded accent-brand-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${item.isPurchased ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {item.ingredient.name}
                    </p>
                    {item.notes && <p className="text-xs text-gray-500 truncate">{item.notes}</p>}
                  </div>
                  <span className="text-xs font-mono font-semibold text-brand-700 tabular-nums">
                    {item.quantityToPurchase} {item.unit}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))
      )}

      {generatePo.error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {generatePo.error.message}
        </div>
      )}
    </div>
  );
}
