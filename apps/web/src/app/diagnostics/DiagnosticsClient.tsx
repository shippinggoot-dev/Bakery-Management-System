"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import {
  loadEntries,
  clearEntries,
  aggregate,
  type DiagnosticsEntry,
} from "@/lib/diagnostics-store";

type ProbeResult = {
  ok: boolean;
  dbDurationMs: number;
  totalDurationMs: number;
  ts: string;
  error?: string;
};

export function DiagnosticsClient() {
  const t = useTranslations("diagnostics");
  const [entries, setEntries] = useState<DiagnosticsEntry[]>([]);
  const [probeResults, setProbeResults] = useState<ProbeResult[]>([]);
  const [probing, setProbing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Load client log + tick clock for "x seconds ago" labels.
  useEffect(() => {
    setEntries(loadEntries());
    const tick = setInterval(() => {
      setEntries(loadEntries());
      setNow(Date.now());
    }, 2000);
    return () => clearInterval(tick);
  }, []);

  const serverRecent  = api.diagnostics.recent.useQuery({ limit: 100, sinceHours: 24 });
  const serverSummary = api.diagnostics.summary.useQuery({ sinceHours: 24 });
  const utils         = api.useUtils();
  const clearMutation = api.diagnostics.clear.useMutation({
    onSuccess: () => {
      utils.diagnostics.recent.invalidate();
      utils.diagnostics.summary.invalidate();
    },
  });

  const clientStats = aggregate(entries);

  async function runProbe() {
    setProbing(true);
    setProbeResults([]);
    try {
      const results: ProbeResult[] = [];
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
          const res = await fetch("/api/db-health", { cache: "no-store" });
          const json = await res.json();
          results.push({ ...json, totalDurationMs: Date.now() - start });
        } catch (err) {
          results.push({
            ok: false,
            dbDurationMs: 0,
            totalDurationMs: Date.now() - start,
            ts: new Date().toISOString(),
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
        setProbeResults([...results]);
      }
    } finally {
      setProbing(false);
    }
  }

  function handleClearLocal() {
    clearEntries();
    setEntries([]);
  }

  function handleClearServer() {
    if (!confirm(t("confirmClearServer"))) return;
    clearMutation.mutate({ keepLastHours: 0 });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="page-title">{t("title")}</h2>
        <p className="text-gray-500 mt-2 text-sm">{t("subtitle")}</p>
      </div>

      {/* DB health probe */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="section-title">{t("probe.title")}</h3>
            <p className="text-sm text-gray-500 mt-1">{t("probe.description")}</p>
          </div>
          <button
            onClick={runProbe}
            disabled={probing}
            className="btn-primary disabled:opacity-50"
          >
            {probing ? t("probe.running") : t("probe.run")}
          </button>
        </div>
        {probeResults.length > 0 && (
          <div className="space-y-2">
            {probeResults.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm font-mono px-3 py-2 rounded border ${
                  r.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                <span className="font-semibold">#{i + 1}</span>
                <span>{r.ok ? t("probe.ok") : t("probe.fail")}</span>
                <span className="ml-auto">
                  {t("probe.db")}: <strong>{r.dbDurationMs}</strong> {t("probe.ms")}
                </span>
                <span>
                  {t("probe.total")}: <strong>{r.totalDurationMs}</strong> {t("probe.ms")}
                </span>
                {r.error && <span className="ml-2 text-xs">{r.error}</span>}
              </div>
            ))}
            <p className="text-xs text-gray-500 mt-2">{t("probe.hint")}</p>
          </div>
        )}
      </section>

      {/* Server-side aggregates (slow/failed queries from all users) */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="section-title">{t("server.title")}</h3>
            <p className="text-sm text-gray-500 mt-1">{t("server.description")}</p>
          </div>
          <button
            onClick={handleClearServer}
            disabled={clearMutation.isPending}
            className="btn-ghost disabled:opacity-50"
          >
            {t("server.clear")}
          </button>
        </div>

        {serverSummary.isLoading ? (
          <p className="text-sm text-gray-500">{t("loading")}</p>
        ) : serverSummary.isError ? (
          <p className="text-sm text-rose-600">{serverSummary.error.message}</p>
        ) : (serverSummary.data ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">{t("server.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-rose-100">
                  <th className="table-header">{t("table.procedure")}</th>
                  <th className="table-header text-right">{t("table.count")}</th>
                  <th className="table-header text-right">{t("table.errors")}</th>
                  <th className="table-header text-right">{t("table.p50")}</th>
                  <th className="table-header text-right">{t("table.p95")}</th>
                  <th className="table-header text-right">{t("table.max")}</th>
                </tr>
              </thead>
              <tbody>
                {(serverSummary.data ?? []).map((row) => (
                  <tr key={row.procedure} className="border-b border-rose-50">
                    <td className="py-2 font-mono">{row.procedure}</td>
                    <td className="py-2 text-right">{row.total}</td>
                    <td className={`py-2 text-right ${row.errors > 0 ? "text-rose-600 font-semibold" : ""}`}>
                      {row.errors}
                    </td>
                    <td className="py-2 text-right">{row.p50}</td>
                    <td className="py-2 text-right">{row.p95}</td>
                    <td className="py-2 text-right">{row.maxMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Server-side recent log */}
      <section className="card p-5 space-y-4">
        <div>
          <h3 className="section-title">{t("recent.title")}</h3>
          <p className="text-sm text-gray-500 mt-1">{t("recent.description")}</p>
        </div>
        {serverRecent.isLoading ? (
          <p className="text-sm text-gray-500">{t("loading")}</p>
        ) : serverRecent.isError ? (
          <p className="text-sm text-rose-600">{serverRecent.error.message}</p>
        ) : (serverRecent.data ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">{t("recent.empty")}</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-500 border-b border-rose-100">
                  <th className="table-header">{t("table.when")}</th>
                  <th className="table-header">{t("table.procedure")}</th>
                  <th className="table-header text-right">{t("table.duration")}</th>
                  <th className="table-header">{t("table.status")}</th>
                  <th className="table-header">{t("table.error")}</th>
                </tr>
              </thead>
              <tbody>
                {(serverRecent.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-rose-50 align-top">
                    <td className="py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatRelative(new Date(row.createdAt).getTime(), now)}
                    </td>
                    <td className="py-2 font-mono text-xs">{row.procedure}</td>
                    <td className="py-2 text-right">{row.durationMs}</td>
                    <td className={`py-2 ${row.status === "error" ? "text-rose-600" : "text-emerald-700"}`}>
                      {row.status}
                    </td>
                    <td className="py-2 text-xs text-gray-600 max-w-md truncate">
                      {row.errorMessage ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Client-side stats */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="section-title">{t("client.title")}</h3>
            <p className="text-sm text-gray-500 mt-1">{t("client.description")}</p>
          </div>
          <button onClick={handleClearLocal} className="btn-ghost">
            {t("client.clear")}
          </button>
        </div>

        {clientStats.length === 0 ? (
          <p className="text-sm text-gray-500">{t("client.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-rose-100">
                  <th className="table-header">{t("table.procedure")}</th>
                  <th className="table-header text-right">{t("table.count")}</th>
                  <th className="table-header text-right">{t("table.errors")}</th>
                  <th className="table-header text-right">{t("table.p50")}</th>
                  <th className="table-header text-right">{t("table.p95")}</th>
                  <th className="table-header text-right">{t("table.max")}</th>
                </tr>
              </thead>
              <tbody>
                {clientStats.map((row) => (
                  <tr key={row.procedure} className="border-b border-rose-50">
                    <td className="py-2 font-mono">{row.procedure}</td>
                    <td className="py-2 text-right">{row.count}</td>
                    <td className={`py-2 text-right ${row.errors > 0 ? "text-rose-600 font-semibold" : ""}`}>
                      {row.errors}
                    </td>
                    <td className="py-2 text-right">{row.p50}</td>
                    <td className="py-2 text-right">{row.p95}</td>
                    <td className="py-2 text-right">{row.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Client-side recent log */}
      <section className="card p-5 space-y-4">
        <div>
          <h3 className="section-title">{t("clientRecent.title")}</h3>
          <p className="text-sm text-gray-500 mt-1">{t("clientRecent.description")}</p>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">{t("clientRecent.empty")}</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-500 border-b border-rose-100">
                  <th className="table-header">{t("table.when")}</th>
                  <th className="table-header">{t("table.procedure")}</th>
                  <th className="table-header text-right">{t("table.duration")}</th>
                  <th className="table-header">{t("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 50).map((e, i) => (
                  <tr key={i} className="border-b border-rose-50">
                    <td className="py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatRelative(e.ts, now)}
                    </td>
                    <td className="py-2 font-mono text-xs">{e.procedure}</td>
                    <td className="py-2 text-right">{e.durationMs}</td>
                    <td className={`py-2 ${e.status === "error" ? "text-rose-600" : "text-emerald-700"}`}>
                      {e.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatRelative(then: number, now: number): string {
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60)   return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24)    return `${hr}h`;
  return new Date(then).toLocaleString();
}
