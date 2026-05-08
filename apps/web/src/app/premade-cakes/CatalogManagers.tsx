"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { TrashIcon, PlusIcon } from "@/components/icons";

export function FlavourManager() {
  const t  = useTranslations("premadeCakes");
  const tc = useTranslations("common");
  const utils = api.useUtils();
  const { data: flavours = [], isLoading } = api.premadeCakes.flavours.list.useQuery();
  const createMutation = api.premadeCakes.flavours.create.useMutation({
    onSuccess: () => { utils.premadeCakes.flavours.list.invalidate(); setName(""); setDesc(""); },
  });
  const deleteMutation = api.premadeCakes.flavours.delete.useMutation({
    onSuccess: () => utils.premadeCakes.flavours.list.invalidate(),
  });
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    createMutation.mutate({
      name:         name.trim(),
      description:  desc.trim() || null,
      isActive:     true,
      displayOrder: flavours.length,
    });
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="section-title">{t("manageFlavours")}</h3>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <input
          className="form-input text-sm col-span-12 sm:col-span-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("flavourName")}
          maxLength={255}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        />
        <input
          className="form-input text-sm col-span-12 sm:col-span-6"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t("flavourDescription")}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim() || createMutation.isPending}
          className="col-span-12 sm:col-span-2 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <PlusIcon /> {tc("save")}
        </button>
      </div>

      {isLoading ? (
        <div className="h-8 bg-rose-100 rounded animate-pulse" />
      ) : flavours.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-2">{t("noFlavoursYet")}</p>
      ) : (
        <ul className="divide-y divide-rose-100">
          {flavours.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                {f.description && <p className="text-xs text-gray-500 truncate">{f.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(f.id)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AddonManager() {
  const t  = useTranslations("premadeCakes");
  const tc = useTranslations("common");
  const utils = api.useUtils();
  const { data: addons = [], isLoading } = api.premadeCakes.addons.list.useQuery();
  const createMutation = api.premadeCakes.addons.create.useMutation({
    onSuccess: () => { utils.premadeCakes.addons.list.invalidate(); setName(""); setDelta("0"); setDesc(""); },
  });
  const deleteMutation = api.premadeCakes.addons.delete.useMutation({
    onSuccess: () => utils.premadeCakes.addons.list.invalidate(),
  });
  const [name,  setName]  = useState("");
  const [delta, setDelta] = useState("0");
  const [desc,  setDesc]  = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    createMutation.mutate({
      name:         name.trim(),
      priceDelta:   delta.trim() || "0",
      description:  desc.trim() || null,
      isActive:     true,
      displayOrder: addons.length,
    });
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="section-title">{t("manageAddons")}</h3>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <input
          className="form-input text-sm col-span-12 sm:col-span-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("addonName")}
          maxLength={255}
        />
        <input
          className="form-input text-sm col-span-6 sm:col-span-2"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder={t("addonPriceDelta")}
          inputMode="decimal"
        />
        <input
          className="form-input text-sm col-span-6 sm:col-span-4"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t("addonDescription")}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim() || createMutation.isPending}
          className="col-span-12 sm:col-span-2 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <PlusIcon /> {tc("save")}
        </button>
      </div>

      {isLoading ? (
        <div className="h-8 bg-rose-100 rounded animate-pulse" />
      ) : addons.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-2">{t("noAddonsYet")}</p>
      ) : (
        <ul className="divide-y divide-rose-100">
          {addons.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {a.name} <span className="text-xs text-brand-600 font-semibold">+{a.priceDelta} kr</span>
                </p>
                {a.description && <p className="text-xs text-gray-500 truncate">{a.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(a.id)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
