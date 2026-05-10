/**
 * Tiny localStorage-backed log of every React Query observed by the
 * client. Captures the full round-trip (network + serverless + DB)
 * from the user's perspective. Capped at MAX_ENTRIES so the store
 * stays bounded.
 *
 * Reads/writes are wrapped in try/catch — a corrupted localStorage
 * payload or a quota error must never break the rest of the app.
 */

const STORAGE_KEY = "bms-diagnostics-log";
const MAX_ENTRIES = 200;

export type DiagnosticsEntry = {
  ts: number;
  procedure: string;
  durationMs: number;
  status: "success" | "error";
  errorMessage: string | null;
};

export function loadEntries(): DiagnosticsEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendEntry(entry: DiagnosticsEntry) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadEntries();
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / parse errors
  }
}

export function clearEntries() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Aggregate per-procedure stats from a list of entries. */
export function aggregate(entries: DiagnosticsEntry[]) {
  const byProcedure = new Map<string, DiagnosticsEntry[]>();
  for (const e of entries) {
    const list = byProcedure.get(e.procedure) ?? [];
    list.push(e);
    byProcedure.set(e.procedure, list);
  }

  const rows = Array.from(byProcedure.entries()).map(([procedure, list]) => {
    const durations = list.map((e) => e.durationMs).sort((a, b) => a - b);
    const errors    = list.filter((e) => e.status === "error").length;
    const p50       = percentile(durations, 0.5);
    const p95       = percentile(durations, 0.95);
    const max       = durations.length > 0 ? durations[durations.length - 1]! : 0;
    return {
      procedure,
      count: list.length,
      errors,
      p50,
      p95,
      max,
      errorRate: list.length > 0 ? errors / list.length : 0,
    };
  });

  rows.sort((a, b) => b.max - a.max);
  return rows;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}
