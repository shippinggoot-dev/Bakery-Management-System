"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { TrashIcon } from "@/components/icons";

export function DeleteRecipeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const del = api.recipes.delete.useMutation({
    onSuccess: () => router.push("/recipes"),
  });

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Delete "{name}"?</span>
        <button
          onClick={() => del.mutate(id)}
          disabled={del.isPending}
          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {del.isPending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 text-sm transition-colors"
    >
      <TrashIcon />
      Delete recipe
    </button>
  );
}
