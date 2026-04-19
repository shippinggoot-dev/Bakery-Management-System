export default function Loading() {
  return (
    <div className="max-w-xl mx-auto space-y-4 animate-pulse">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-rose-100 shrink-0" />
        <div className="h-7 bg-rose-100 rounded-lg w-44" />
        <div className="ml-auto h-9 w-20 bg-rose-100 rounded-lg" />
      </div>

      {/* Segment cards */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2 min-w-0">
              <div className="h-4 bg-rose-100 rounded w-2/5" />
              <div className="h-3 bg-rose-100 rounded w-3/5" />
              <div className="flex gap-1.5 pt-1">
                <div className="h-4 bg-rose-100 rounded-full w-24" />
                <div className="h-4 bg-rose-100 rounded-full w-16" />
              </div>
            </div>
            <div className="shrink-0 text-right space-y-1">
              <div className="h-6 bg-rose-100 rounded w-10 ml-auto" />
              <div className="h-3 bg-rose-100 rounded w-14" />
            </div>
          </div>
          <div className="border-t border-rose-100 px-4 py-2.5 flex gap-2">
            <div className="flex-1 h-7 bg-rose-100 rounded-lg" />
            <div className="flex-1 h-7 bg-rose-100 rounded-lg" />
            <div className="w-16 h-7 bg-rose-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
