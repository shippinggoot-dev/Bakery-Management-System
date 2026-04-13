"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { parseInvoiceText } from "@/lib/invoice-parser";

const EXAMPLE = `Hvetemel tipo 00   1kg   45.50
Sukker             2kg   32.00
Smør               500g  28.90
Egg str. L         12stk 49.00
Vaniljesukker      10g    8.50`;

export default function InvoiceIngestionPage() {
  const router = useRouter();

  const [text, setText]             = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [fileName, setFileName]     = useState("invoice");
  const [error, setError]           = useState<string | null>(null);
  const [preview, setPreview]       = useState<ReturnType<typeof parseInvoiceText>>([]);
  const [isParsed, setIsParsed]     = useState(false);

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
        <a href="/price-ingestion" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Back to Price Sync
        </a>
        <h2 className="page-title mt-2">Invoice Text Import</h2>
        <p className="text-gray-500 mt-1">
          Copy the text from your supplier invoice and paste it below — no file upload, no AI.
        </p>
      </div>

      <div className="card p-5 space-y-5">

        {/* How to get text from a PDF */}
        <div className="bg-gray-800/50 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400">How to copy invoice text</p>
          <p>1. Open the invoice PDF in your browser or PDF viewer.</p>
          <p>2. Press <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-xs">Ctrl+A</kbd> to select all, then <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-xs">Ctrl+C</kbd> to copy.</p>
          <p>3. Click in the box below and press <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-xs">Ctrl+V</kbd> to paste.</p>
          <p>4. Click <strong className="text-gray-300">Extract items</strong> — the script finds the product lines for you.</p>
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
          className="w-full py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm font-medium transition-colors disabled:opacity-40"
        >
          Extract items
        </button>

        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Preview */}
        {isParsed && preview.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-300">
                {preview.length} item{preview.length !== 1 ? "s" : ""} found
              </p>
              <button
                onClick={() => { setIsParsed(false); setPreview([]); }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-800/60 text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Price</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {preview.map((item, i) => (
                    <tr key={i} className="text-gray-300">
                      <td className="px-3 py-2">{item.rawName}</td>
                      <td className="px-3 py-2 font-mono text-emerald-400">{item.rawPrice ?? <span className="text-gray-600">—</span>}</td>
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
