"use client";

import { useState, useCallback } from "react";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";

const GROUP_LABELS: Record<string, string> = {
  MENY_NO:   "Meny",
  KIWI:      "Kiwi",
  REMA_1000: "Rema 1000",
  SPAR_NO:   "Spar",
  JOKER_NO:  "Joker",
  BUNNPRIS:  "Bunnpris",
  ODA:       "Oda",
};

const GROUP_COLOURS: Record<string, string> = {
  MENY_NO:   "bg-red-950/60 text-red-300",
  KIWI:      "bg-yellow-950/60 text-yellow-300",
  REMA_1000: "bg-blue-950/60 text-blue-300",
  SPAR_NO:   "bg-emerald-950/60 text-emerald-300",
  JOKER_NO:  "bg-purple-950/60 text-purple-300",
  BUNNPRIS:  "bg-orange-950/60 text-orange-300",
};

type Tab = "local" | "manual";

function AddSupplierForm({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils();
  const [name, setName]               = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail]             = useState("");
  const [phone, setPhone]             = useState("");
  const [address, setAddress]         = useState("");
  const [notes, setNotes]             = useState("");
  const [error, setError]             = useState<string | null>(null);

  const create = api.suppliers.create.useMutation({
    onSuccess: () => { utils.suppliers.getAll.invalidate(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Supplier name is required.");
    setError(null);
    create.mutate({
      name: name.trim(),
      contactName: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      isActive: true,
    });
  }

  return (
    <div className="card p-6 border-brand-500/30 bg-brand-500/5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">New Supplier</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Supplier name *</label>
            <input className="form-input" placeholder="e.g. Bergen Mel AS" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="form-label">Contact person</label>
            <input className="form-input" placeholder="Full name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="orders@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input className="form-input" placeholder="+47 000 00 000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Address</label>
          <input className="form-input" placeholder="Street, city" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Notes</label>
          <input className="form-input" placeholder="Delivery days, lead times…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={create.isPending}
            className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50">
            {create.isPending ? "Saving…" : "Add Supplier"}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function StoreCard({
  store,
  onToggle,
  disabled,
  dimmed = false,
}: {
  store: { id: string; name: string; address?: string | null; kassalappGroup?: string | null; isActive: boolean };
  onToggle: () => void;
  disabled: boolean;
  dimmed?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`card p-4 text-left transition-all hover:border-brand-500/50 space-y-2 w-full ${
        dimmed ? "opacity-40 hover:opacity-70" : "border-brand-500/40 bg-brand-500/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-100 text-sm leading-snug">{store.name}</p>
          {store.address && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{store.address}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {store.kassalappGroup && (
            <span className={`badge text-xs ${GROUP_COLOURS[store.kassalappGroup] ?? "bg-gray-800 text-gray-400"}`}>
              {GROUP_LABELS[store.kassalappGroup] ?? store.kassalappGroup}
            </span>
          )}
          <span className={`text-xs font-medium ${dimmed ? "text-gray-600" : "text-brand-400"}`}>
            {dimmed ? "+ Add" : "✓ Selected"}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function SuppliersPage() {
  const [tab, setTab] = useState<Tab>("local");
  const [showAvailable, setShowAvailable] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const utils = api.useUtils();

  const { data: allSuppliers = [], isLoading } = api.suppliers.getAll.useQuery({ limit: 100 });

  const importStores = api.suppliers.importLocalStores.useMutation({
    onSuccess: () => utils.suppliers.getAll.invalidate(),
  });

  const toggle = api.suppliers.update.useMutation({
    onSuccess: () => utils.suppliers.getAll.invalidate(),
  });

  const localStores = allSuppliers.filter((s) => s.kassalappStoreId);
  const manualSuppliers = allSuppliers.filter((s) => !s.kassalappStoreId);
  const selectedCount = localStores.filter((s) => s.isActive).length;

  const displayed = tab === "local" ? localStores : manualSuppliers;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "local",  label: "Local stores", count: localStores.length },
    { key: "manual", label: "Manual",        count: manualSuppliers.length },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Suppliers</h2>
          <p className="text-gray-500 mt-1">
            {localStores.length === 0
              ? "No stores imported yet"
              : `${selectedCount} of ${localStores.length} local stores selected`}
            {manualSuppliers.length > 0 && ` · ${manualSuppliers.length} manual`}
          </p>
        </div>
        <button
          onClick={() => importStores.mutate()}
          disabled={importStores.isPending}
          className="btn-primary text-sm"
        >
          {importStores.isPending ? "Importing…" : "⟳ Import local stores"}
        </button>
      </div>

      {/* Import result */}
      {importStores.data && (
        <div className="card px-5 py-3 text-sm text-gray-400">
          Found {importStores.data.total} stores within 8 km of Fana —{" "}
          {importStores.data.created} added, {importStores.data.updated} updated.
          {importStores.data.created > 0 && " Select the ones you use below."}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-brand-500 text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              tab === t.key ? "bg-brand-500/20 text-brand-400" : "bg-gray-800 text-gray-600"
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Local stores */}
      {tab === "local" && (
        isLoading ? (
          <div className="card p-10 text-center text-gray-600">Loading…</div>
        ) : localStores.length === 0 ? (
          <div className="card p-12 text-center text-gray-600">
            <p className="text-4xl mb-3">🚚</p>
            <p className="font-medium">No local stores imported yet</p>
            <p className="text-sm mt-1">
              Click <strong className="text-gray-400">Import local stores</strong> to find grocery stores near Fana.
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Selected stores */}
            {localStores.filter((s) => s.isActive).length === 0 ? (
              <div className="card p-8 text-center text-gray-600">
                <p className="font-medium">No stores selected yet</p>
                <p className="text-sm mt-1">Open <strong className="text-gray-400">Available stores</strong> below and click any store to add it.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {localStores.filter((s) => s.isActive).map((s) => (
                  <StoreCard
                    key={s.id}
                    store={s}
                    onToggle={() => toggle.mutate({ id: s.id, data: { isActive: false } })}
                    disabled={toggle.isPending}
                  />
                ))}
              </div>
            )}

            {/* Collapsible unselected stores */}
            {localStores.filter((s) => !s.isActive).length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowAvailable((v) => !v)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <span className={`transition-transform ${showAvailable ? "rotate-90" : ""}`}>▶</span>
                  Available stores ({localStores.filter((s) => !s.isActive).length})
                </button>

                {showAvailable && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {localStores.filter((s) => !s.isActive).map((s) => (
                      <StoreCard
                        key={s.id}
                        store={s}
                        onToggle={() => toggle.mutate({ id: s.id, data: { isActive: true } })}
                        disabled={toggle.isPending}
                        dimmed
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}

      {/* Manual suppliers */}
      {tab === "manual" && (
        isLoading ? (
          <div className="card p-10 text-center text-gray-600">Loading…</div>
        ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddSupplier((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-colors text-sm font-medium"
            >
              <PlusIcon />
              Add Supplier
            </button>
          </div>
          {showAddSupplier && <AddSupplierForm onClose={() => setShowAddSupplier(false)} />}
          {manualSuppliers.length === 0 ? (
          <div className="card p-12 text-center text-gray-600">
            <p className="text-4xl mb-3">🚚</p>
            <p className="font-medium">No manual suppliers added</p>
            <p className="text-sm mt-1">Use the button above to add one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {manualSuppliers.map((s) => (
              <div key={s.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-100 leading-snug">{s.name}</h3>
                  <span className={`badge shrink-0 ${s.isActive ? "bg-emerald-950/60 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-400">
                  {s.contactName && <p>👤 {s.contactName}</p>}
                  {s.email && <p>📧 <a href={`mailto:${s.email}`} className="text-brand-400 hover:text-brand-500">{s.email}</a></p>}
                  {s.phone && <p>📞 {s.phone}</p>}
                  {s.address && <p className="text-gray-600 text-xs mt-1">{s.address}</p>}
                </div>
                {s.notes && <p className="text-xs text-gray-600 border-t border-gray-800 pt-3">{s.notes}</p>}
              </div>
            ))}
          </div>
        )}
        </div>
        )
      )}
    </div>
  );
}
