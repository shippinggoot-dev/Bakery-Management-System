"use client";

export default function RecipesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-5xl mx-auto py-16 text-center space-y-4">
      <p className="text-4xl">⚠️</p>
      <p className="font-semibold text-gray-700 text-lg">Could not load recipes</p>
      <p className="text-sm text-gray-500 font-mono bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 inline-block">
        {error.message || "An unexpected error occurred"}
      </p>
      <div>
        <button
          onClick={reset}
          className="mt-2 px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
