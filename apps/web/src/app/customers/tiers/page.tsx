"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

const PRESET_COLORS = ["#CD7F32", "#C0C0C0", "#FFD700", "#4ade80", "#60a5fa", "#f472b6"];

interface TierForm {
  name:       string;
  slug:       string;
  minPoints:  string;
  multiplier: string;
  color:      string;
  perks:      string;
}

const EMPTY_FORM: TierForm = {
  name: "", slug: "", minPoints: "0", multiplier: "1.0", color: "#CD7F32", perks: "",
};

export default function TiersPage() {
  const router = useRouter();
  const utils  = api.useUtils();

  const { data: tiers = [], isLoading } = api.customers.getTiers.useQuery();
  const { mutateAsync: upsertTier }    = api.customers.upsertTier.useMutation();
  const { mutateAsync: deleteTier }    = api.customers.deleteTier.useMutation();

  const [editing, setEditing] = useState<string | null>(null);
  const [form,    setForm]    = useState<TierForm>(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  function startEdit(tier?: typeof tiers[number]) {
    if (tier) {
      const perks: string[] = tier.perks ? JSON.parse(tier.perks) : [];
      setForm({ name: tier.name, slug: tier.slug, minPoints: String(tier.minPoints), multiplier: tier.multiplier, color: tier.color, perks: perks.join("\n") });
      setEditing(tier.id);
    } else {
      setForm(EMPTY_FORM);
      setEditing("new");
    }
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) { setError("Name and slug are required."); return; }
    setSaving(true); setError(null);
    try {
      await upsertTier({
        id:         editing !== "new" ? (editing ?? undefined) : undefined,
        name:       form.name.trim(),
        slug:       form.slug.trim().toLowerCase(),
        minPoints:  Number(form.minPoints),
        multiplier: form.multiplier,
        color:      form.color,
        perks:      form.perks.split("\n").map((p) => p.trim()).filter(Boolean),
      });
      utils.customers.getTiers.invalidate();
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tier? Customers in this tier won't be affected immediately.")) return;
    await deleteTier(id);
    utils.customers.getTiers.invalidate();
  }

  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);

  return (
    <div className="max-w-xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors">←</button>
        <h1 className="page-title flex-1">Loyalty Tiers</h1>
        <button onClick={() => startEdit()} className="btn-primary text-sm">
          + Add tier
        </button>
      </div>

      <p className="text-sm text-brand-400">
        Tiers are based on <strong className="text-gray-700">lifetime points earned</strong> (never drops). The highest matching tier applies automatically.
      </p>

      {isLoading && <p className="text-center text-brand-300 py-10 animate-pulse text-sm">Loading…</p>}

      {/* Edit / create form */}
      {editing !== null && (
        <form onSubmit={handleSave} className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 text-sm font-bold text-brand-600">
            {editing === "new" ? "New tier" : "Edit tier"}
          </div>
          <div className="px-4 py-4 space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Name *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                  placeholder="Gold" className="form-input" />
              </div>
              <div>
                <label className="form-label">Slug *</label>
                <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="gold" className="form-input font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Min lifetime points</label>
                <input type="number" min="0" value={form.minPoints} onChange={(e) => setForm((f) => ({ ...f, minPoints: e.target.value }))}
                  className="form-input" />
              </div>
              <div>
                <label className="form-label">Points multiplier</label>
                <input type="text" value={form.multiplier} onChange={(e) => setForm((f) => ({ ...f, multiplier: e.target.value }))}
                  placeholder="1.5" className="form-input font-mono" />
              </div>
            </div>
            <div>
              <label className="form-label">Badge colour</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {PRESET_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? "scale-125 border-gray-800" : "border-transparent hover:scale-110"}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-8 h-8 rounded-full border-2 border-rose-200 cursor-pointer bg-transparent" />
              </div>
            </div>
            <div>
              <label className="form-label">Perks (one per line)</label>
              <textarea value={form.perks} onChange={(e) => setForm((f) => ({ ...f, perks: e.target.value }))}
                rows={3} placeholder={"5% discount on every purchase\nEarly access to specials"}
                className="form-input resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save tier"}
              </button>
              <button type="button" onClick={() => setEditing(null)}
                className="px-4 rounded-xl bg-white border border-rose-200 text-gray-600 text-sm hover:bg-rose-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tiers list */}
      {sorted.map((tier) => {
        const perks: string[] = tier.perks ? JSON.parse(tier.perks) : [];
        return (
          <div key={tier.id} className="card overflow-hidden">
            <div className="px-4 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex-shrink-0 border-2"
                style={{ backgroundColor: `${tier.color}33`, borderColor: tier.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800">{tier.name}</span>
                  <span className="text-xs font-mono text-brand-400">×{tier.multiplier}</span>
                </div>
                <p className="text-xs text-brand-400 mt-0.5">
                  {tier.minPoints === 0 ? "Starting tier" : `From ${tier.minPoints.toLocaleString()} lifetime pts`}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => startEdit(tier)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-brand-600 text-xs hover:bg-rose-50 transition-colors">
                  Edit
                </button>
                <button onClick={() => handleDelete(tier.id)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors border border-red-200">
                  Delete
                </button>
              </div>
            </div>
            {perks.length > 0 && (
              <div className="border-t border-rose-100 px-4 py-2.5 flex flex-wrap gap-1.5">
                {perks.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded-full text-[10px] bg-rose-50 border border-rose-200 text-brand-500">{p}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
