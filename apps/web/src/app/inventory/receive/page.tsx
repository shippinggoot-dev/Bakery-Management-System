"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";

type ScanState = "idle" | "scanning" | "found" | "error";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

export default function ReceivePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const utils = api.useUtils();
  const { data: ingredients = [] } = api.ingredients.getAll.useQuery();
  const { mutateAsync: receiveDelivery, isPending } = api.inventory.receiveDelivery.useMutation();
  const { data: suppliers = [] } = api.suppliers.getAll.useQuery();

  // Form state
  const [ingredientId, setIngredientId] = useState(searchParams.get("ingredientId") ?? "");
  const [supplierId,   setSupplierId]   = useState("");
  const [quantity,     setQuantity]     = useState("");
  const [lotNumber,    setLotNumber]    = useState("");
  const [expiryDate,   setExpiryDate]   = useState("");
  const [notes,        setNotes]        = useState("");
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  // Barcode scanning
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [barcodeText, setBarcodeText] = useState("");
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null);
  const animRef   = useRef<number | null>(null);

  const selectedIngredient: Ingredient | undefined = ingredients.find((i) => i.id === ingredientId);

  // Stop camera on unmount or when scanning ends
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

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      async function tick() {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue as string;
            stopCamera();
            setBarcodeText(code);
            setScanState("found");
            // Look up the ingredient
            const found = await utils.inventory.lookupBarcode.fetch(code);
            if (found) {
              setIngredientId(found.id);
            } else {
              setError(`Barcode "${code}" not matched to an ingredient. Select one manually.`);
            }
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

  function cancelScan() {
    stopCamera();
    setScanState("idle");
    setBarcodeText("");
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
        supplierId:  supplierId || null,
        quantity:    qty,
        unit:        selectedIngredient?.unit ?? "g",
        lotNumber:   lotNumber || null,
        expiryDate:  expiryDate || null,
        purchaseOrderId: null,
        notes:       notes || null,
      });
      setSuccess(true);
      setTimeout(() => router.push("/inventory"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record delivery.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
          ←
        </button>
        <h1 className="text-lg font-bold">Receive Delivery</h1>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5 lg:px-8">
        {success && (
          <div className="rounded-xl bg-emerald-900/40 border border-emerald-700 text-emerald-300 px-4 py-3 text-sm font-medium">
            Delivery recorded! Redirecting…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Barcode scanner ───────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold">Scan barcode</span>
            {scanState === "scanning" && (
              <button onClick={cancelScan} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
            )}
          </div>

          {scanState === "scanning" && (
            <div className="relative aspect-video bg-black">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {/* Crosshair overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2/3 h-1/3 border-2 border-brand-400 rounded-lg opacity-70" />
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70">
                Point camera at barcode
              </p>
            </div>
          )}

          {scanState !== "scanning" && (
            <div className="px-4 py-4 flex items-center gap-3">
              <button
                type="button"
                onClick={startScanner}
                className="flex-1 py-3 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 text-sm font-semibold hover:bg-brand-500/30 transition-colors"
              >
                📷 Open camera
              </button>
              <span className="text-gray-600 text-xs">or</span>
              <input
                type="text"
                placeholder="Enter barcode"
                value={barcodeText}
                onChange={(e) => setBarcodeText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && barcodeText) {
                    const found = await utils.inventory.lookupBarcode.fetch(barcodeText);
                    if (found) setIngredientId(found.id);
                    else setError(`Barcode not matched. Select manually.`);
                  }
                }}
                className="flex-1 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          )}
        </div>

        {/* ── Delivery form ─────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ingredient */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ingredient *</label>
            <select
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">Select ingredient…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Quantity {selectedIngredient && <span className="text-gray-600">({selectedIngredient.unit})</span>} *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder="0"
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Supplier (optional)</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Lot number + Expiry side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Lot / Batch #</label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="e.g. L-2024-01"
                className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Expiry date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm resize-none focus:outline-none focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || success}
            className="w-full py-4 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Recording…" : "Record delivery"}
          </button>
        </form>
      </div>
    </div>
  );
}
