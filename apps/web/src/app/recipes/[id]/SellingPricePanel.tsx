"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

interface Props {
  recipeId:     string;
  totalCost:    number;
  yieldAmount:  string;
  initialPrice: string | null;
}

export function SellingPricePanel({ recipeId, totalCost, yieldAmount, initialPrice }: Props) {
  const [price, setPrice]   = useState(initialPrice ?? "");
  const [saved, setSaved]   = useState(false);
  const update = api.recipes.update.useMutation({
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const sellingPrice = parseFloat(price);
  const cost         = totalCost;
  const yield_       = parseFloat(yieldAmount) || 1;
  const costPerUnit  = cost / yield_;
  const valid        = !isNaN(sellingPrice) && sellingPrice > 0;
  const margin       = valid ? ((sellingPrice - costPerUnit) / sellingPrice) * 100 : null;
  const markup       = valid ? ((sellingPrice - costPerUnit) / costPerUnit) * 100 : null;
  const profit       = valid ? sellingPrice - costPerUnit : null;

  return (
    <div className="card p-6 space-y-4">
      <h3 className="section-title">Pricing &amp; Margin</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ingredient cost</p>
          <p className="font-semibold text-gray-800 mt-0.5">kr{cost.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cost per unit</p>
          <p className="font-semibold text-gray-800 mt-0.5">kr{costPerUnit.toFixed(2)}</p>
        </div>
        {profit !== null && (
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wide">Profit / unit</p>
            <p className={`font-semibold mt-0.5 ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              kr{profit.toFixed(2)}
            </p>
          </div>
        )}
        {margin !== null && (
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wide">Gross margin</p>
            <p className={`font-bold text-lg mt-0.5 ${margin >= 60 ? "text-emerald-400" : margin >= 40 ? "text-amber-400" : "text-red-400"}`}>
              {margin.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Margin bar */}
      {margin !== null && (
        <div>
          <div className="h-2 bg-rose-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                margin >= 60 ? "bg-emerald-500" : margin >= 40 ? "bg-amber-400" : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, margin))}%` }}
            />
          </div>
          {markup !== null && (
            <p className="text-xs text-gray-600 mt-1">Markup: {markup.toFixed(1)}%</p>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-3 pt-2 border-t border-rose-100">
        <label className="text-sm text-gray-600 flex-shrink-0">Selling price (per unit)</label>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-gray-500 text-sm">kr</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="form-input w-28 text-sm"
          />
          <button
            onClick={() => update.mutate({ id: recipeId, data: { sellingPrice: price || null } })}
            disabled={update.isPending}
            className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40"
          >
            {saved ? "Saved!" : update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
