"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const MAX_SIZE_MB = 5;

function detectColumns(lines: string[][]): {
  nameCol: number; priceCol: number; unitCol?: number; quantityCol?: number;
} {
  const firstRow = lines[0] ?? [];
  let nameCol = 0, priceCol = 1, unitCol: number | undefined, quantityCol: number | undefined;

  for (let i = 0; i < firstRow.length; i++) {
    const h = (firstRow[i] ?? "").toLowerCase().replace(/[^a-z]/g, "");
    if (/name|product|item|ingredient|beskrivelse|produkt/.test(h)) nameCol = i;
    else if (/price|pris|cost|kostnad|unitprice/.test(h)) priceCol = i;
    else if (/unit|enhet/.test(h)) unitCol = i;
    else if (/qty|quantity|mengde|weight|vekt|size/.test(h)) quantityCol = i;
  }
  return { nameCol, priceCol, unitCol, quantityCol };
}

function parseCSVPreview(text: string): string[][] {
  const rows = text
    .split(/\r?\n/)
    .slice(0, 6)
    .filter((l) => l.trim().length > 0)
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  return rows;
}

export default function CSVIngestionPage() {
  const router = useRouter();
  const [csvText, setCsvText]       = useState("");
  const [fileName, setFileName]     = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [hasHeader, setHasHeader]   = useState(true);
  const [nameCol, setNameCol]       = useState(0);
  const [priceCol, setPriceCol]     = useState(1);
  const [unitCol, setUnitCol]       = useState<number | "">("");
  const [quantityCol, setQuantityCol] = useState<number | "">("");
  const [error, setError]           = useState<string | null>(null);

  const { data: suppliers = [] } = api.suppliers.getAll.useQuery({ limit: 200 });

  const ingest = api.priceIngestion.ingestCSV.useMutation({
    onSuccess: (data) => router.push(`/price-ingestion/${data.sessionId}`),
    onError:   (err) => setError(err.message),
  });

  const previewRows = csvText ? parseCSVPreview(csvText) : [];
  const colCount    = Math.max(...previewRows.map((r) => r.length), 0);
  const colOptions  = Array.from({ length: colCount }, (_, i) => i);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_SIZE_MB} MB.`);
      return;
    }
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setError(null);
      // Auto-detect columns
      const rows = parseCSVPreview(text);
      if (rows.length > 0) {
        const detected = detectColumns(rows);
        setNameCol(detected.nameCol);
        setPriceCol(detected.priceCol);
        setUnitCol(detected.unitCol ?? "");
        setQuantityCol(detected.quantityCol ?? "");
      }
    };
    reader.readAsText(f);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText || !supplierId) return;
    setError(null);
    ingest.mutate({
      csvText,
      fileName: fileName || "import.csv",
      supplierId,
      columnMapping: {
        nameCol,
        priceCol,
        unitCol:     unitCol !== "" ? unitCol : undefined,
        quantityCol: quantityCol !== "" ? quantityCol : undefined,
        hasHeader,
      },
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <a href="/price-ingestion" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Back to Price Sync
        </a>
        <h2 className="page-title mt-2">CSV Import</h2>
        <p className="text-gray-500 mt-1">
          Upload a CSV price list from your supplier, map the columns, and review matches.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Supplier */}
        <div className="card p-5 space-y-4">
          <h3 className="section-title">Source</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Supplier *</label>
              <select
                className="form-input"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">CSV file *</label>
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                className="form-input text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-brand-500/20 file:text-brand-400 cursor-pointer"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        {/* Column mapping — shown once CSV is loaded */}
        {csvText && (
          <div className="card p-5 space-y-5">
            <h3 className="section-title">Column Mapping</h3>

            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="rounded"
              />
              First row is a header
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Name column *",   value: nameCol,    setter: (v: number) => setNameCol(v),    required: true },
                { label: "Price column *",  value: priceCol,   setter: (v: number) => setPriceCol(v),   required: true },
              ].map(({ label, value, setter, required }) => (
                <div key={label}>
                  <label className="form-label">{label}</label>
                  <select
                    className="form-input"
                    value={value}
                    onChange={(e) => setter(Number(e.target.value))}
                    required={required}
                  >
                    {colOptions.map((i) => (
                      <option key={i} value={i}>Column {i + 1}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="form-label">Unit column</label>
                <select
                  className="form-input"
                  value={unitCol}
                  onChange={(e) => setUnitCol(e.target.value !== "" ? Number(e.target.value) : "")}
                >
                  <option value="">(none)</option>
                  {colOptions.map((i) => (
                    <option key={i} value={i}>Column {i + 1}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Qty / size column</label>
                <select
                  className="form-input"
                  value={quantityCol}
                  onChange={(e) => setQuantityCol(e.target.value !== "" ? Number(e.target.value) : "")}
                >
                  <option value="">(none)</option>
                  {colOptions.map((i) => (
                    <option key={i} value={i}>Column {i + 1}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview table */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Preview (first 6 rows)</p>
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className={ri === 0 && hasHeader ? "bg-gray-800/60 text-gray-400" : "text-gray-300"}>
                        {row.map((cell, ci) => {
                          const isName  = ci === nameCol;
                          const isPrice = ci === priceCol;
                          const isUnit  = unitCol !== "" && ci === unitCol;
                          const isQty   = quantityCol !== "" && ci === quantityCol;
                          const highlight =
                            isName  ? "bg-brand-500/10 text-brand-300" :
                            isPrice ? "bg-emerald-950/30 text-emerald-400" :
                            isUnit  ? "bg-purple-950/30 text-purple-300" :
                            isQty   ? "bg-cyan-950/30 text-cyan-300" : "";
                          return (
                            <td key={ci} className={`px-3 py-2 border-r border-gray-800 last:border-r-0 ${highlight}`}>
                              {cell || <span className="text-gray-700">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="text-brand-300">■ Name</span>
                <span className="text-emerald-400">■ Price</span>
                {unitCol !== "" && <span className="text-purple-300">■ Unit</span>}
                {quantityCol !== "" && <span className="text-cyan-300">■ Qty/size</span>}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!csvText || !supplierId || ingest.isPending}
          className="w-full py-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ingest.isPending ? "Matching items…" : "Import & Match"}
        </button>
      </form>
    </div>
  );
}
