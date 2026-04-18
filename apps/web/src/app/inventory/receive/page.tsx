"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";

type ScanState = "idle" | "scanning" | "found" | "error";

interface Ingredient { id: string; name: string; unit: string; }

export default function ReceivePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-brand-300">Loading…</div>}>
      <ReceivePageInner />
    </Suspense>
  );
}

function IngredientSearch({
  ingredients,
  value,
  onChange,
}: {
  ingredients: Ingredient[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const inputRef          = useRef<HTMLInputElement>(null);
  const listRef           = useRef<HTMLDivElement>(null);

  const selected = ingredients.find((i) => i.id === value);

  const filtered = query.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : ingredients;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("");
    setQuery("");
    setTimeout(() => { inputRef.current?.focus(); setOpen(true); }, 0);
  }

  return (
    <div className="relative">
      {selected && !open ? (
        <div className="flex items-center justify-between gap-2 w-full rounded-lg bg-brand-50 border border-brand-300 px-4 py-3 text-sm">
          <span className="font-medium text-brand-700">{selected.name}</span>
          <span className="text-xs text-brand-400 shrink-0">{selected.unit}</span>
          <button
            type="button"
            onClick={clear}
            className="ml-1 text-brand-400 hover:text-brand-700 text-lg leading-none shrink-0"
            aria-label="Clear selection"
          >×</button>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder="Search ingredient…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="form-input"
        />
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-rose-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="max-h-56 overflow-y-auto overscroll-contain divide-y divide-rose-50">
            {filtered.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400 text-center">No ingredients found</p>
            ) : (
              filtered.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(i.id); }}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-sm text-left hover:bg-rose-50 active:bg-rose-100 transition-colors"
                >
                  <span className="font-medium text-gray-800">{i.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{i.unit}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReceivePageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const utils        = api.useUtils();

  const { data: ingredients = [] } = api.ingredients.getAll.useQuery();
  const { mutateAsync: receiveDelivery, isPending } = api.inventory.receiveDelivery.useMutation();
  const { data: suppliers = [] } = api.suppliers.getAll.useQuery();

  const [ingredientId, setIngredientId] = useState(searchParams.get("ingredientId") ?? "");
  const [supplierId,   setSupplierId]   = useState("");
  const [quantity,     setQuantity]     = useState("");
  const [lotNumber,    setLotNumber]    = useState("");
  const [expiryDate,   setExpiryDate]   = useState("");
  const [notes,        setNotes]        = useState("");
  const [showNotes,    setShowNotes]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  const [scanState,   setScanState]   = useState<ScanState>("idle");
  const [barcodeText, setBarcodeText] = useState("");
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null);
  const animRef     = useRef<number | null>(null);

  const selectedIngredient: Ingredient | undefined = ingredients.find((i) => i.id === ingredientId);

  function stopCamera() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => () => stopCamera(), []);

  async function startScanner() {
    setScanState("scanning");
    setError(null);
    try {
      if (!("BarcodeDetector" in window)) {
        setError("Barcode scanning is not supported in this browser. Please enter the barcode manually.");
        setScanState("error");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      detectorRef.current = new (window as any).BarcodeDetector({ formats: ["ean_13", "ean_8", "qr_code", "code_128", "code_39"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }

      async function tick() {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue as string;
            stopCamera();
            setBarcodeText(code);
            setScanState("found");
            const found = await utils.inventory.lookupBarcode.fetch(code);
            if (found) { setIngredientId(found.id); } else { setError(`Barcode "${code}" not matched. Select manually.`); }
            return;
          }
        } catch { /* detect() can throw on empty frames */ }
        animRef.current = requestAnimationFrame(tick);
      }
      animRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setScanState("error");
      setError(err instanceof Error ? err.message : "Camera access denied.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ingredientId) { setError("Select an ingredient."); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError("Enter a valid quantity."); return; }
    try {
      await receiveDelivery({
        ingredientId,
        supplierId:      supplierId || null,
        quantity:        qty,
        unit:            selectedIngredient?.unit ?? "g",
        lotNumber:       lotNumber || null,
        expiryDate:      expiryDate || null,
        purchaseOrderId: null,
        notes:           notes || null,
      });
      setSuccess(true);
      setTimeout(() => router.push("/inventory"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record delivery.");
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-3 -ml-1 rounded-xl text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="page-title">Receive Delivery</h1>
      </div>

      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm font-medium">
          Delivery recorded! Redirecting…
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {/* Barcode scanner */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-rose-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">Scan barcode</span>
          {scanState === "scanning" && (
            <button
              onClick={() => { stopCamera(); setScanState("idle"); setBarcodeText(""); }}
              className="text-sm font-medium text-brand-400 hover:text-brand-600 px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {scanState === "scanning" && (
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-2/3 h-1/3 border-2 border-brand-400 rounded-lg opacity-70" />
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70">Point camera at barcode</p>
          </div>
        )}

        {scanState !== "scanning" && (
          <div className="px-4 py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={startScanner}
              className="py-3.5 sm:flex-1 rounded-xl bg-brand-50 text-brand-600 border border-brand-200 text-sm font-semibold hover:bg-brand-100 active:bg-brand-200 transition-colors"
            >
              📷 Open camera
            </button>
            <span className="text-brand-300 text-xs text-center">or enter manually</span>
            <input
              type="text"
              inputMode="text"
              placeholder="Barcode number"
              value={barcodeText}
              onChange={(e) => setBarcodeText(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && barcodeText) {
                  const found = await utils.inventory.lookupBarcode.fetch(barcodeText);
                  if (found) setIngredientId(found.id);
                  else setError("Barcode not matched. Select manually.");
                }
              }}
              className="form-input sm:flex-1"
            />
          </div>
        )}
      </div>

      {/* Delivery form */}
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Ingredient — searchable */}
        <div>
          <label className="form-label">Ingredient *</label>
          <IngredientSearch
            ingredients={ingredients}
            value={ingredientId}
            onChange={setIngredientId}
          />
        </div>

        {/* Quantity — numeric keyboard */}
        <div>
          <label className="form-label">
            Quantity
            {selectedIngredient && (
              <span className="text-brand-300 normal-case font-normal ml-1">({selectedIngredient.unit})</span>
            )} *
          </label>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            placeholder="0"
            className="form-input text-lg"
          />
        </div>

        {/* Supplier */}
        <div>
          <label className="form-label">Supplier (optional)</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="form-input"
          >
            <option value="">No supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Lot + Expiry — stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Lot / Batch #</label>
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="e.g. L-2024-01"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Expiry date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        {/* Notes — collapsed by default */}
        {showNotes ? (
          <div>
            <label className="form-label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              autoFocus
              className="form-input resize-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-sm text-brand-400 hover:text-brand-600 transition-colors"
          >
            + Add a note
          </button>
        )}

        <button
          type="submit"
          disabled={isPending || success}
          className="w-full py-4 rounded-2xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Recording…" : "Record delivery"}
        </button>
      </form>
    </div>
  );
}
