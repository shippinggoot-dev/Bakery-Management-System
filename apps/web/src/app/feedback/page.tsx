"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format-date";

type Status = "new" | "handled" | "dismissed";
type Category = "bug" | "idea" | "question" | "other";

const STATUSES: Status[] = ["new", "handled", "dismissed"];

const CATEGORY_COLOUR: Record<Category, string> = {
  bug:      "bg-red-50 text-red-700 border-red-200",
  idea:     "bg-amber-50 text-amber-700 border-amber-200",
  question: "bg-blue-50 text-blue-700 border-blue-200",
  other:    "bg-gray-100 text-gray-600 border-gray-200",
};

function formatTimestamp(iso: Date | string | null): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${formatDate(d.toISOString().slice(0, 10))} ${d.toTimeString().slice(0, 5)}`;
}

/**
 * Resolves a storage path inside `feedback-screenshots` to a temporary
 * signed URL. Done client-side using the admin's own Supabase session,
 * which has SELECT permission on the bucket via the matching RLS policy.
 */
function useSignedUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClientSupabase();
      const { data } = await supabase.storage
        .from("feedback-screenshots")
        .createSignedUrl(path, 60 * 60); // 1 hour
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [path]);

  return url;
}

function FeedbackImage({ path, label }: { path: string; label: string }) {
  const url = useSignedUrl(path);
  if (!url) return <span className="text-xs text-gray-500">{label}…</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={label}
        className="max-w-full max-h-48 rounded border border-rose-100 hover:border-brand-400 transition-colors"
      />
    </a>
  );
}

export default function FeedbackAdminPage() {
  const t = useTranslations("feedbackAdmin");
  const [filter, setFilter] = useState<Status>("new");

  const amAdmin = api.feedback.amSuperAdmin.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  // If the user is definitively not a super admin, hide the page entirely.
  // While the check is loading we render the skeleton — never the page contents
  // — so a non-admin briefly opening this URL never sees actual feedback.
  if (amAdmin.isError || amAdmin.data === false) notFound();

  const list = api.feedback.list.useQuery(
    { status: filter, limit: 200 },
    { enabled: amAdmin.data === true },
  );

  const setStatus = api.feedback.setStatus.useMutation({
    onSuccess: () => list.refetch(),
  });

  if (amAdmin.isLoading || !amAdmin.data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-rose-100 rounded animate-pulse" />
        <div className="h-32 bg-rose-100 rounded animate-pulse" />
      </div>
    );
  }

  const rows = list.data ?? [];

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h2 className="page-title">{t("title")}</h2>
        <p className="text-gray-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="card p-1 flex gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s
                ? "bg-brand-600 text-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-rose-50"
            }`}
          >
            {t(`filters.${s}`)}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="card px-5 py-8 text-sm text-gray-600 text-center animate-pulse">
          {t("loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="card px-5 py-8 text-sm text-gray-600 text-center">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const cat = (CATEGORY_COLOUR[row.category as Category] ?? CATEGORY_COLOUR.other);
            return (
              <div key={row.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge border ${cat}`}>
                      {t(`categories.${row.category}`)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(row.createdAt)}
                    </span>
                    {row.language && (
                      <span className="text-xs text-gray-400 uppercase">{row.language}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {row.status !== "handled" && (
                      <button
                        onClick={() => setStatus.mutate({ id: row.id, status: "handled" })}
                        disabled={setStatus.isPending}
                        className="text-xs px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                      >
                        {t("markHandled")}
                      </button>
                    )}
                    {row.status !== "dismissed" && (
                      <button
                        onClick={() => setStatus.mutate({ id: row.id, status: "dismissed" })}
                        disabled={setStatus.isPending}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-rose-50 transition-colors"
                      >
                        {t("dismiss")}
                      </button>
                    )}
                    {row.status !== "new" && (
                      <button
                        onClick={() => setStatus.mutate({ id: row.id, status: "new" })}
                        disabled={setStatus.isPending}
                        className="text-xs px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        {t("reopen")}
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-800 whitespace-pre-wrap">{row.message}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400">{t("from")}: </span>
                    {row.submittedByEmail ?? t("anonymous")}
                  </div>
                  {row.pageUrl && (
                    <div className="truncate">
                      <span className="text-gray-400">{t("page")}: </span>
                      <a href={row.pageUrl} className="text-brand-600 hover:underline">
                        {row.pageUrl}
                      </a>
                    </div>
                  )}
                </div>

                {(row.screenshotPath || row.attachmentPath) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-rose-100">
                    {row.screenshotPath && (
                      <div>
                        <p className="form-label">{t("screenshot")}</p>
                        <FeedbackImage path={row.screenshotPath} label={t("screenshot")} />
                      </div>
                    )}
                    {row.attachmentPath && (
                      <div>
                        <p className="form-label">{t("attachment")}</p>
                        <FeedbackImage path={row.attachmentPath} label={t("attachment")} />
                      </div>
                    )}
                  </div>
                )}

                {row.userAgent && (
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700">{t("technical")}</summary>
                    <p className="mt-1 font-mono break-all">{row.userAgent}</p>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
