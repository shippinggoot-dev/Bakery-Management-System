"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import type { AppRouter } from "@bakery/api";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type InitialData   = RouterOutputs["customers"]["getSegments"];
type Segment       = InitialData["segments"][number];

interface CriteriaForm {
  tier:               string;
  minPoints:          string;
  maxDaysSinceVisit:  string;
  dietaryRequirement: string;
  minLifetimeSpend:   string;
}

const DEFAULT_CRITERIA: CriteriaForm = {
  tier: "", minPoints: "", maxDaysSinceVisit: "", dietaryRequirement: "", minLifetimeSpend: "",
};

export function SegmentsClient({ initialData }: { initialData: InitialData }) {
  const router = useRouter();
  const utils  = api.useUtils();

  const { mutateAsync: createSegment }                         = api.customers.createSegment.useMutation();
  const { mutateAsync: refreshSegment, isPending: refreshing } = api.customers.refreshSegment.useMutation();
  const { mutateAsync: deleteSegment }                         = api.customers.deleteSegment.useMutation();

  // Initialise directly from server-prefetched data — no loading state on first render
  const [allSegments, setAllSegments] = useState<Segment[]>(initialData.segments);
  const [hasMore,     setHasMore]     = useState(initialData.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: page1Data } = api.customers.getSegments.useQuery(
    { limit: 25, offset: 0 },
    { initialData },
  );

  // Sync whenever the query refreshes (e.g. after a mutation invalidation)
  useEffect(() => {
    if (page1Data) {
      setAllSegments(page1Data.segments);
      setHasMore(page1Data.hasMore);
    }
  }, [page1Data]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await utils.customers.getSegments.fetch({ limit: 25, offset: allSegments.length });
      setAllSegments((prev) => [...prev, ...next.segments]);
      setHasMore(next.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const [showForm,    setShowForm]    = useState(false);
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [criteria,    setCriteria]    = useState<CriteriaForm>(DEFAULT_CRITERIA);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  function buildCriteria() {
    const c: Record<string, unknown> = {};
    if (criteria.tier)               c.tier               = criteria.tier;
    if (criteria.minPoints)          c.minPoints          = Number(criteria.minPoints);
    if (criteria.maxDaysSinceVisit)  c.maxDaysSinceVisit  = Number(criteria.maxDaysSinceVisit);
    if (criteria.dietaryRequirement) c.dietaryRequirement = criteria.dietaryRequirement;
    if (criteria.minLifetimeSpend)   c.minLifetimeSpend   = Number(criteria.minLifetimeSpend);
    return c;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      await createSegment({ name: name.trim(), description: description.trim() || null, criteria: buildCriteria() });
      await utils.customers.getSegments.invalidate();
      setShowForm(false);
      setName(""); setDescription(""); setCriteria(DEFAULT_CRITERIA);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create segment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh(id: string) {
    await refreshSegment(id);
    await utils.customers.getSegments.invalidate();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this segment?")) return;
    await deleteSegment(id);
    await utils.customers.getSegments.invalidate();
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <h1 className="page-title flex-1">Customer Segments</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          + New
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 text-sm font-bold text-brand-600">New segment</div>
          <div className="px-4 py-4 space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name *"
              className="form-input" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
              className="form-input" />
            <p className="text-xs font-bold text-brand-400 uppercase tracking-wider pt-1">Filters (leave blank to include all)</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={criteria.tier} onChange={(e) => setCriteria((c) => ({ ...c, tier: e.target.value }))}
                className="form-input">
                <option value="">Any tier</option>
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
              </select>
              <select value={criteria.dietaryRequirement} onChange={(e) => setCriteria((c) => ({ ...c, dietaryRequirement: e.target.value }))}
                className="form-input">
                <option value="">Any dietary</option>
                <option value="gluten_free">Gluten-free</option>
                <option value="vegan">Vegan</option>
                <option value="nut_free">Nut-free</option>
              </select>
              <input type="number" value={criteria.minPoints} onChange={(e) => setCriteria((c) => ({ ...c, minPoints: e.target.value }))}
                placeholder="Min points" min="0" className="form-input" />
              <input type="number" value={criteria.maxDaysSinceVisit} onChange={(e) => setCriteria((c) => ({ ...c, maxDaysSinceVisit: e.target.value }))}
                placeholder="Max days since visit" min="0" className="form-input" />
              <input type="number" value={criteria.minLifetimeSpend} onChange={(e) => setCriteria((c) => ({ ...c, minLifetimeSpend: e.target.value }))}
                placeholder="Min lifetime spend (NOK)" min="0" className="form-input col-span-2" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {saving ? "Creating…" : "Create & evaluate"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 rounded-xl bg-white border border-rose-200 text-gray-600 text-sm hover:bg-rose-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {allSegments.length === 0 && !showForm && (
        <div className="text-center py-16">
          <p className="text-brand-400 mb-3">No segments yet.</p>
          <button onClick={() => setShowForm(true)} className="text-sm text-brand-600 hover:text-brand-800 font-medium">
            Create your first segment
          </button>
        </div>
      )}

      {allSegments.map((seg) => {
        const crit = JSON.parse(seg.criteria) as Record<string, unknown>;
        const tags = Object.entries(crit)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`);

        return (
          <div key={seg.id} className="card overflow-hidden">
            <div className="px-4 py-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800">{seg.name}</p>
                {seg.description && <p className="text-xs text-brand-400 mt-0.5">{seg.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-rose-50 text-brand-500 text-[10px] border border-rose-200">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-xl font-bold text-brand-600">{seg.memberCount}</div>
                <div className="text-[10px] text-brand-400">members</div>
              </div>
            </div>
            <div className="border-t border-rose-100 px-4 py-2.5 flex gap-2">
              <button onClick={() => handleRefresh(seg.id)} disabled={refreshing}
                className="flex-1 py-1.5 rounded-lg bg-white border border-rose-200 text-brand-600 text-xs font-medium hover:bg-rose-50 transition-colors disabled:opacity-50">
                Refresh members
              </button>
              <Link href={`/customers?segment=${seg.id}`}
                className="flex-1 text-center py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-medium border border-brand-200 hover:bg-brand-100 transition-colors">
                View members
              </Link>
              <button onClick={() => handleDelete(seg.id)}
                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors border border-red-200">
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl bg-white border border-rose-200 text-brand-600 text-sm font-medium hover:bg-rose-50 transition-colors disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
