"use client";

import Link from "next/link";

export default function RecipeError() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/recipes" className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to Recipes
      </Link>
      <div className="card p-8 text-center space-y-3">
        <p className="text-gray-400 text-lg">Could not load recipe</p>
        <p className="text-sm text-gray-400">Try refreshing the page.</p>
      </div>
    </div>
  );
}
