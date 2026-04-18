"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";

function AddSupplierForm({ onClose }: { onClose: () => void }) {
  const t  = useTranslations("suppliers");
  const tc = useTranslations("common");
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
    if (!name.trim()) return setError(t("supplierName") + " required");
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
        <h3 className="section-title">{t("newSupplierTitle")}</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("supplierName")}</label>
            <input className="form-input" placeholder="e.g. Bergen Mel AS" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="form-label">{t("contactPerson")}</label>
            <input className="form-input" placeholder="Full name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">{t("emailLabel")}</label>
            <input className="form-input" type="email" placeholder="orders@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t("phoneLabel")}</label>
            <input className="form-input" placeholder="+47 000 00 000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">{t("addressLabel")}</label>
          <input className="form-input" placeholder="Street, city" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="form-label">{t("notesLabel")}</label>
          <input className="form-input" placeholder={t("deliveryNotes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={create.isPending}
            className="px-5 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 text-sm font-medium transition-colors disabled:opacity-50">
            {create.isPending ? t("saving") : t("addSupplier")}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors">{tc("cancel")}</button>
        </div>
      </form>
    </div>
  );
}

export default function SuppliersPage() {
  const t = useTranslations("suppliers");
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const utils = api.useUtils();

  const { data: suppliers = [], isLoading } = api.suppliers.getAll.useQuery({ limit: 100 });

  const toggle = api.suppliers.update.useMutation({
    onSuccess: () => utils.suppliers.getAll.invalidate(),
  });

  const subtitle = suppliers.length === 1
    ? t("subtitle").replace("{count}", "1")
    : t("subtitlePlural").replace("{count}", String(suppliers.length));

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{subtitle}</p>
        </div>
        <button
          onClick={() => setShowAddSupplier((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          {t("newSupplier")}
        </button>
      </div>

      {showAddSupplier && <AddSupplierForm onClose={() => setShowAddSupplier(false)} />}

      {isLoading ? (
        <div className="card p-10 text-center text-gray-600">{t("loading")}</div>
      ) : suppliers.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <p className="text-4xl mb-3">🚚</p>
          <p className="font-medium">{t("noSuppliersYet")}</p>
          <p className="text-sm mt-1">{t("addFirstHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-800 leading-snug">{s.name}</h3>
                <button
                  onClick={() => toggle.mutate({ id: s.id, data: { isActive: !s.isActive } })}
                  disabled={toggle.isPending}
                  className={`badge shrink-0 cursor-pointer transition-colors ${s.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"}`}
                >
                  {s.isActive ? t("active") : t("inactive")}
                </button>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                {s.contactName && <p>👤 {s.contactName}</p>}
                {s.email && <p>📧 <a href={`mailto:${s.email}`} className="text-brand-500 hover:text-brand-700">{s.email}</a></p>}
                {s.phone && <p>📞 {s.phone}</p>}
                {s.address && <p className="text-brand-400 text-xs mt-1">{s.address}</p>}
              </div>
              {s.notes && <p className="text-xs text-brand-400 border-t border-rose-100 pt-3">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
