/**
 * Reusable skeleton blocks used by loading.tsx files.
 * Next.js App Router shows loading.tsx instantly while the page
 * component fetches data, giving users immediate visual feedback.
 */

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
  );
}

/** Generic table skeleton — a header row + N data rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {/* header */}
      <div className="flex gap-4 border-b bg-gray-50 px-4 py-3">
        {[40, 25, 20, 15].map((w, i) => (
          <SkeletonBar key={i} className={`h-3 w-[${w}%]`} />
        ))}
      </div>
      {/* rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <SkeletonBar className="h-3 w-[40%]" />
          <SkeletonBar className="h-3 w-[25%]" />
          <SkeletonBar className="h-3 w-[20%]" />
          <SkeletonBar className="h-3 w-[15%]" />
        </div>
      ))}
    </div>
  );
}

/** Page with a title bar + toolbar + table. */
export function PageSkeleton({
  rows = 6,
  title = true,
}: {
  rows?: number;
  title?: boolean;
}) {
  return (
    <div className="p-6 space-y-5">
      {title && <SkeletonBar className="h-7 w-48" />}
      {/* toolbar */}
      <div className="flex gap-3">
        <SkeletonBar className="h-9 w-64 rounded-lg" />
        <SkeletonBar className="h-9 w-28 rounded-lg" />
        <SkeletonBar className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      <TableSkeleton rows={rows} />
    </div>
  );
}

/** Card grid skeleton — e.g. for recipes. */
export function CardGridSkeleton({ cards = 9 }: { cards?: number }) {
  return (
    <div className="p-6 space-y-5">
      <SkeletonBar className="h-7 w-40" />
      <div className="flex gap-3">
        <SkeletonBar className="h-9 w-64 rounded-lg" />
        <SkeletonBar className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 p-4 space-y-3">
            <SkeletonBar className="h-4 w-3/4" />
            <SkeletonBar className="h-3 w-1/2" />
            <SkeletonBar className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
