"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Item = {
  id: string;
  rawName: string;
  rawPrice: string | null;
  rawUnit: string | null;
  rawQuantity: string | null;
  ingredientId: string | null;
  matchScore: string | null;
  pricePerUnit: string | null;
  unit: string | null;
  applied: boolean;
  confirmed: boolean;
  rejected: boolean;
  ingredient: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
};

function scoreColour(score: string | null) {
  const n = parseFloat(score ?? "0");
  if (n >= 0.9) return "text-emerald-600";
  if (n >= 0.75) return "text-amber-600";
  return "text-red-600";
}

function IngredientCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { data: ingredients = [] } = api.ingredients.getAll.useQuery({ limit: 500 });
  return (
    <select
      className="form-input text-xs py-1"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— unmatched —</option>
      {ingredients.map((ing) => (
        <option key={ing.id} value={ing.id}>{ing.name}</option>
      ))}
    </select>
  );
}

function ItemRow({
  item,
  checked,
  onCheck,
  onReassign,
}: {
  item: Item;
  checked: boolean;
  onCheck: (id: string, v: boolean) => void;
  onReassign: (itemId: string, ingredientId: string) => void;
}) {
  const utils = api.useUtils();
  const reject = api.priceIngestion.rejectItem.useMutation({
    onSuccess: () => utils.priceIngestion.getSession.invalidate(),
  });

  if (item.applied) {
    return (
      <tr className="opacity-40">
        <td className="px-4 py-3 text-center">
          <span className="text-emerald-500 text-xs">✓ applied</span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-400">{item.rawName}</td>
        <td className="px-4 py-3 text-sm text-gray-500">{item.ingredient?.name ?? "—"}</td>
        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.pricePerUnit ?? "—"}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{item.unit ?? "—"}</td>
        <td className="px-4 py-3 text-xs text-gray-600">
          <span className={scoreColour(item.matchScore)}>
            {item.matchScore ? `${(parseFloat(item.matchScore) * 100).toFixed(0)}%` : "—"}
          </span>
        </td>
        <td />
      </tr>
    );
  }

  if (item.rejected) {
    return (
      <tr className="opacity-30 line-through">
        <td className="px-4 py-3" />
        <td className="px-4 py-3 text-sm text-gray-500">{item.rawName}</td>
        <td colSpan={5} className="px-4 py-3 text-xs text-gray-600">rejected</td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-rose-50/50 transition-colors">
      <td className="px-4 py-3 text-center">
        {item.ingredientId ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheck(item.id, e.target.checked)}
            className="rounded"
          />
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-800">{item.rawName}</p>
        {(item.rawPrice || item.rawQuantity || item.rawUnit) && (
          <p className="text-xs text-gray-600 mt-0.5">
            {[item.rawPrice && `${item.rawPrice}`, item.rawQuantity && `qty: ${item.rawQuantity}`, item.rawUnit && item.rawUnit]
              .filter(Boolean).join(" · ")}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <IngredientCombobox
          value={item.ingredientId}
          onChange={(id) => onReassign(item.id, id)}
        />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 font-mono">
        {item.pricePerUnit ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {item.unit ?? "—"}
      </td>
      <td className="px-4 py-3 text-xs">
        {item.matchScore ? (
          <span className={scoreColour(item.matchScore)}>
            {(parseFloat(item.matchScore) * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => reject.mutate(item.id)}
          className="text-xs text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
        >
          Skip
        </button>
      </td>
    </tr>
  );
}

export default function SessionReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const utils  = api.useUtils();

  const { data: session, isLoading } = api.priceIngestion.getSession.useQuery(sessionId);

  const [checked, setChecked] = useState<Set<string>>(new Set());

  const reassign = api.priceIngestion.reassignItem.useMutation({
    onSuccess: () => utils.priceIngestion.getSession.invalidate(),
  });

  const apply = api.priceIngestion.applyItems.useMutation({
    onSuccess: () => {
      utils.priceIngestion.getSession.invalidate();
      utils.priceIngestion.getSessions.invalidate();
    },
  });

  if (isLoading) {
    return <div className="card p-12 text-center text-gray-600">Loading session…</div>;
  }
  if (!session) {
    return (
      <div className="card p-12 text-center text-gray-600">
        <p>Session not found.</p>
        <a href="/price-ingestion" className="text-brand-400 text-sm">← Back</a>
      </div>
    );
  }

  const items = (session.items ?? []) as Item[];
  const reviewable = items.filter((i) => !i.applied && !i.rejected);
  const matchedReviewable = reviewable.filter((i) => i.ingredientId);

  function toggleAll(v: boolean) {
    if (v) {
      setChecked(new Set(matchedReviewable.map((i) => i.id)));
    } else {
      setChecked(new Set());
    }
  }

  function handleCheck(id: string, v: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  }

  function handleReassign(itemId: string, ingredientId: string) {
    reassign.mutate({ itemId, ingredientId });
    // Auto-check reassigned item
    setChecked((prev) => new Set([...prev, itemId]));
  }

  async function handleApply() {
    if (checked.size === 0) return;
    apply.mutate({ sessionId, confirmedItemIds: [...checked] });
    setChecked(new Set());
  }

  const appliedCount = items.filter((i) => i.applied).length;
  const allDone = reviewable.length === 0 && items.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <a href="/price-ingestion" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ← Back to Price Sync
          </a>
          <h2 className="page-title mt-1">
            {session.fileName ?? `${session.source} import`}
          </h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="badge text-xs bg-gray-100 text-gray-500 border-gray-200">{session.source}</span>
            <span className="text-xs text-gray-500">
              {new Date(session.startedAt).toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">
              {items.length} items · {items.filter((i) => i.ingredientId).length} matched ·{" "}
              {appliedCount} applied
            </span>
          </div>
        </div>
        <button
          onClick={handleApply}
          disabled={checked.size === 0 || apply.isPending}
          className="shrink-0 px-5 py-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {apply.isPending
            ? "Applying…"
            : `Apply ${checked.size > 0 ? checked.size : ""} selected`}
        </button>
      </div>

      {apply.data && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          {apply.data.applied} price{apply.data.applied !== 1 ? "s" : ""} applied successfully.
        </div>
      )}

      {apply.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {apply.error.message}
        </div>
      )}

      {allDone && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-4 text-sm text-emerald-700 flex items-center gap-3">
          <span className="text-xl">✓</span>
          <div>
            <p className="font-medium">All items reviewed</p>
            <p className="text-emerald-600 text-xs mt-0.5">
              {appliedCount} prices have been applied to your supplier data.
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {items.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p>No items were extracted from this session.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-rose-50 text-xs text-gray-500 uppercase tracking-wide border-b border-rose-100">
                <tr>
                  <th className="px-4 py-3 text-center w-10">
                    {matchedReviewable.length > 0 && (
                      <input
                        type="checkbox"
                        checked={checked.size === matchedReviewable.length && matchedReviewable.length > 0}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="rounded"
                      />
                    )}
                  </th>
                  <th className="px-4 py-3 text-left">Raw name</th>
                  <th className="px-4 py-3 text-left">Matched ingredient</th>
                  <th className="px-4 py-3 text-left">Price / unit</th>
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Confidence</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    checked={checked.has(item.id)}
                    onCheck={handleCheck}
                    onReassign={handleReassign}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {matchedReviewable.length > 0 && (
            <div className="px-4 py-3 bg-rose-50 border-t border-rose-100 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {checked.size} of {matchedReviewable.length} matched items selected
              </span>
              <button
                onClick={handleApply}
                disabled={checked.size === 0 || apply.isPending}
                className="px-4 py-1.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {apply.isPending ? "Applying…" : `Apply ${checked.size} selected`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
