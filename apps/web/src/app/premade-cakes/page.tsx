"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { PlusIcon } from "@/components/icons";
import { FlavourManager, AddonManager } from "./CatalogManagers";

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="h-5 bg-rose-100 rounded w-3/4" />
          <div className="h-4 bg-rose-100 rounded w-1/2" />
          <div className="border-t border-rose-100 pt-3 h-4 bg-rose-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

export default function PremadeCakesPage() {
  const t = useTranslations("premadeCakes");

  const { data: cakes = [], isLoading } = api.premadeCakes.list.useQuery();
  const [catalogOpen, setCatalogOpen] = useState(false);

  const subtitle = cakes.length === 1
    ? t("subtitle").replace("{count}", "1")
    : t("subtitlePlural").replace("{count}", String(cakes.length));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t("title")}</h2>
        <Link
          href="/premade-cakes/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30 hover:text-brand-300 transition-colors text-sm font-medium"
        >
          <PlusIcon />
          {t("newCake")}
        </Link>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <>
          <p className="text-gray-500 -mt-2">{subtitle}</p>

          {cakes.length === 0 ? (
            <div className="card p-12 text-center text-gray-600">
              <p className="text-4xl mb-3">🎂</p>
              <p className="font-medium text-gray-400">{t("noCakesTitle")}</p>
              <p className="text-sm mt-2 text-gray-600">{t("noCakesHint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cakes.map((cake) => (
                <Link
                  key={cake.id}
                  href={`/premade-cakes/${cake.id}`}
                  className="card p-5 hover:border-brand-200 hover:bg-rose-50/50 transition-all flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-800 leading-snug flex-1">{cake.name}</h3>
                    {!cake.isActive && (
                      <span className="badge bg-gray-100 text-gray-500 border-gray-200">inactive</span>
                    )}
                  </div>
                  {cake.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{cake.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm border-t border-rose-100 pt-3">
                    <span className="font-bold text-brand-700">{cake.basePrice} kr</span>
                    {cake.leadTimeDays > 0 && (
                      <span className="text-xs text-gray-500">
                        {t("leadTimeShort").replace("{days}", String(cake.leadTimeDays))}
                      </span>
                    )}
                  </div>
                  {(cake.sizes.length > 0 || cake.flavours.length > 0) && (
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {cake.sizes.length > 0 && <span>📐 {cake.sizes.length}</span>}
                      {cake.flavours.length > 0 && <span>🍰 {cake.flavours.length}</span>}
                      {cake.addons.length > 0 && <span>➕ {cake.addons.length}</span>}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCatalogOpen((v) => !v)}
            className="w-full text-left text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors flex items-center justify-between px-1"
          >
            <span>{t("manageFlavoursAndAddons")}</span>
            <span className="text-brand-400">{catalogOpen ? "▾" : "▸"}</span>
          </button>

          {catalogOpen && (
            <div className="space-y-4">
              <FlavourManager />
              <AddonManager />
            </div>
          )}
        </>
      )}
    </div>
  );
}
