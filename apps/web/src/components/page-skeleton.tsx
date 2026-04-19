function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-rose-100 ${className}`} />;
}

/** Generic table skeleton — a header row + N data rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rose-100">
      <div className="flex gap-4 border-b border-rose-100 bg-rose-50 px-4 py-3">
        {[40, 25, 20, 15].map((w, i) => (
          <SkeletonBar key={i} className={`h-3 w-[${w}%]`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rose-50 px-4 py-3 last:border-0">
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
export function PageSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="space-y-5 animate-pulse">
      {title && <SkeletonBar className="h-7 w-48" />}
      <div className="flex gap-3">
        <SkeletonBar className="h-9 w-64 rounded-lg" />
        <SkeletonBar className="h-9 w-28 rounded-lg" />
        <SkeletonBar className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      <TableSkeleton rows={rows} />
    </div>
  );
}

/** Card grid skeleton — e.g. for the recipes list. */
export function CardGridSkeleton({ cards = 9 }: { cards?: number }) {
  return (
    <div className="space-y-5 animate-pulse">
      <SkeletonBar className="h-7 w-40" />
      <div className="flex gap-3">
        <SkeletonBar className="h-9 w-64 rounded-lg" />
        <SkeletonBar className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <SkeletonBar className="h-4 w-20" />
            <SkeletonBar className="h-5 w-3/4" />
            <SkeletonBar className="h-3 w-1/2" />
            <div className="border-t border-rose-100 pt-3">
              <SkeletonBar className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
