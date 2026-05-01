"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { parseInvoiceText } from "@/lib/invoice-parser";

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const EXAMPLE = `Hvetemel tipo 00   1kg   45.50
Sukker             2kg   32.00
Smør               500g  28.90
Egg str. L         12stk 49.00
Vaniljesukker      10g    8.50`;

export default function InvoiceIngestionPage() {
  const router = useRouter();

  const [text, setText]             = useState("");
  const [supplierId, setSupplierId] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("invoice-last-supplier") ?? "") : ""
  );
  const [fileName, setFileName]     = useState("invoice");

  useEffect(() => {
    if (supplierId) localStorage.setItem("invoice-last-supplier", supplierId);
  }, [supplierId]);
  const [error, setError]           = useState<string | null>(null);
  const [preview, setPreview]       = useState<ReturnType<typeof parseInvoiceText>>([]);
  const [isParsed, setIsParsed]     = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileLoading(true);
    setIsParsed(false);
    setPreview([]);
    try {
      const extracted = await extractTextFromFile(file);
      setText(extracted);
      setFileName(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setError("Could not read the file. Try copying the text manually.");
    } finally {
      setFileLoading(false);
    }
  }

  const { data: suppliers = [] } = api.suppliers.getAll.useQuery({ limit: 200 });

  const ingest = api.priceIngestion.ingestCSV.useMutation({
    onSuccess: (data) => router.push(`/price-ingestion/${data.sessionId}`),
    onError:   (err)  => setError(err.message),
  });

  function handleParse() {
    setError(null);
    const items = parseInvoiceText(text);
    if (items.length === 0) {
      setError("No product lines found. Make sure the text includes product names and prices.");
      setIsParsed(false);
      return;
    }
    setPreview(items);
    setIsParsed(true);
  }

  function handleSubmit() {
    if (!supplierId || preview.length === 0) return;
    setError(null);

    // Convert extracted items back to CSV so the existing ingestCSV endpoint can handle them
    const csvRows = [
      "name,price,unit,quantity",
      ...preview.map((item) =>
        [
          `"${item.rawName.replace(/"/g, '""')}"`,
          item.rawPrice ?? "",
          item.rawUnit ?? "",
          item.rawQuantity ?? "",
        ].join(",")
      ),
    ].join("\n");

    ingest.mutate({
      csvText: csvRows,
      fileName: fileName || "invoice",
      supplierId,
      columnMapping: { nameCol: 0, priceCol: 1, unitCol: 2, quantityCol: 3, hasHeader: true },
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <a href="/price-ingestion" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          ← Back to Price Sync
        </a>
        <h2 className="page-title mt-2">Invoice Text Import</h2>
        <p className="text-gray-500 mt-1">
          Upload a PDF or text file, or paste the invoice text directly — no AI, runs in your browser.
        </p>
      </div>

      <div className="card p-5 space-y-5">

        {/* File drop zone */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-colors ${
              dragOver ? "border-brand-400 bg-brand-50" : "border-rose-200 hover:border-brand-300 hover:bg-rose-50/50"
            }`}
          >
            {fileLoading ? (
              <p className="text-sm text-brand-400 animate-pulse">Reading file…</p>
            ) : (
              <>
                <span className="text-3xl">📄</span>
                <p className="text-sm font-medium text-gray-700">Drop invoice file here, or <span className="text-brand-500 underline">browse</span></p>
                <p className="text-xs text-gray-400">PDF, TXT or CSV</p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-rose-100" />
          or paste text below
          <div className="flex-1 h-px bg-rose-100" />
        </div>

        {/* Paste area */}
        <div>
          <label className="form-label">Invoice text *</label>
          <textarea
            className="form-input font-mono text-xs min-h-40 resize-y"
            placeholder={`Paste your invoice text here…\n\nExample:\n${EXAMPLE}`}
            value={text}
            onChange={(e) => { setText(e.target.value); setIsParsed(false); setPreview([]); }}
            spellCheck={false}
          />
          <p className="text-xs text-gray-600 mt-1">
            Works with any invoice format. The script looks for lines that contain a product name and a price.
          </p>
        </div>

        <button
          type="button"
          onClick={handleParse}
          disabled={text.trim().length < 10}
          className="w-full py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium transition-colors disabled:opacity-40"
        >
          Extract items
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Preview */}
        {isParsed && preview.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">
                {preview.length} item{preview.length !== 1 ? "s" : ""} found
              </p>
              <button
                onClick={() => { setIsParsed(false); setPreview([]); }}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="rounded-lg border border-rose-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-rose-50 text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Price</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {preview.map((item, i) => (
                    <tr key={i} className="text-gray-700">
                      <td className="px-3 py-2">{item.rawName}</td>
                      <td className="px-3 py-2 font-mono text-emerald-600">{item.rawPrice ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-gray-500">{item.rawQuantity ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{item.rawUnit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Supplier + name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Supplier *</label>
                <select
                  className="form-input"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Label (optional)</label>
                <input
                  className="form-input"
                  placeholder="e.g. April invoice"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!supplierId || ingest.isPending}
              className="w-full py-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ingest.isPending ? "Matching ingredients…" : `Import ${preview.length} items`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
