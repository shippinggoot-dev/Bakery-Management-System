"use client";

/**
 * SECURITY — Instagram media uploads
 *
 * `handleFileChange` below performs CLIENT-SIDE checks: a 10 MB size cap,
 * a MIME allowlist (jpeg/png/webp), and a per-user storage prefix
 * (`posts/${userId}/...`). These are defense-in-depth ONLY — a determined
 * attacker can bypass any client-side check.
 *
 * The Supabase Storage bucket "instagram-media" MUST ALSO have an RLS
 * policy that:
 *   1. Restricts INSERT/UPDATE to authenticated, non-anonymous users.
 *   2. Restricts the path to the uploading user's own prefix
 *      (e.g. `name like 'posts/' || auth.uid()::text || '/%'`).
 *   3. Caps file size and MIME at the bucket level.
 * Without those bucket-level policies, the protections in this file can be
 * trivially bypassed by hitting the storage API directly.
 */

import { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { usePersonalization } from "@/components/ThemeProvider";

const MAX_CAPTION = 2200;

// ─── Utilities ────────────────────────────────────────────────────────────────

function buildCatalogTemplate(item: {
  name:        string;
  description: string | null;
  price:       string | null;
  allergens:   string[];
}): string {
  const lines: string[] = [];
  lines.push(`✨ ${item.name}`);
  if (item.description) lines.push(item.description);
  if (item.price)       lines.push(`📍 ${item.price} kr`);
  if (item.allergens.length > 0) lines.push(`Contains: ${item.allergens.join(", ")}`);
  lines.push("");
  lines.push("#bakery #freshbread");
  return lines.join("\n");
}

function formatDateTime(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** YYYY-MM-DD in local time — used as a stable day key for grouping posts */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert local "YYYY-MM-DDTHH:mm" string from a datetime-local input into a Date */
function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a Date for a datetime-local input (YYYY-MM-DDTHH:mm in local time) */
function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Connect prompt (unchanged from original) ─────────────────────────────────

function ConnectPrompt() {
  const appId       = process.env.NEXT_PUBLIC_META_APP_ID;
  const redirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/api/instagram/callback`
    : "";

  const oauthUrl = appId
    ? `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement&response_type=code`
    : null;

  return (
    <div className="card p-8 text-center space-y-4 max-w-md mx-auto">
      <div className="text-5xl">📸</div>
      <h2 className="text-lg font-semibold text-gray-800">Connect Instagram</h2>
      <p className="text-sm text-gray-500">
        Link your Instagram Business or Creator account to post directly from your bakery dashboard.
      </p>
      {oauthUrl ? (
        <a
          href={oauthUrl}
          className="inline-block px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm hover:from-purple-600 hover:to-pink-600 transition-all"
        >
          Connect Instagram
        </a>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Setup required</p>
          <p className="mt-1">
            Add <span className="font-mono">NEXT_PUBLIC_META_APP_ID</span> to your environment variables,
            then redeploy. See Settings → Instagram for instructions.
          </p>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Requires an Instagram Business or Creator account linked to a Facebook Page.
      </p>
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

type DraftRow = {
  id:           string;
  imageUrl:     string | null;
  caption:      string | null;
  scheduledFor: Date | null;
  status:       string;
  errorMessage: string | null;
  publishedAt:  Date | null;
};

interface CalendarProps {
  drafts:        DraftRow[];
  viewYear:      number;
  viewMonth:     number; // 0-11
  selectedDate:  Date | null;
  onPrev:        () => void;
  onNext:        () => void;
  onPickDay:     (date: Date) => void;
}

function Calendar({ drafts, viewYear, viewMonth, selectedDate, onPrev, onNext, onPickDay }: CalendarProps) {
  const t      = useTranslations("social");
  const locale = useLocale();

  // Group drafts by YYYY-MM-DD for fast lookup
  const dayMap = useMemo(() => {
    const map = new Map<string, DraftRow[]>();
    for (const d of drafts) {
      if (!d.scheduledFor) continue;
      const k = ymd(new Date(d.scheduledFor));
      const arr = map.get(k) ?? [];
      arr.push(d);
      map.set(k, arr);
    }
    return map;
  }, [drafts]);

  // Build day grid for the visible month. First row may include trailing days
  // of the previous month so the grid starts on Monday.
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // Monday-start: 0 = Mon … 6 = Sun
    const dayOfWeek = (first.getDay() + 6) % 7;
    const gridStart = new Date(viewYear, viewMonth, 1 - dayOfWeek);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return cells;
  }, [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, {
    month: "long",
    year:  "numeric",
  });

  // Localised short day names, Monday first
  const dayNames = useMemo(() => {
    // Build by formatting a known Monday (2024-01-01 was a Monday)
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale]);

  const today    = ymd(new Date());
  const selected = selectedDate ? ymd(selectedDate) : null;

  return (
    <div className="card overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-rose-100">
        <button
          onClick={onPrev}
          className="w-8 h-8 rounded-lg hover:bg-rose-50 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={t("calendar.prevMonth")}
        >
          ←
        </button>
        <p className="font-semibold text-gray-800 text-sm capitalize">{monthLabel}</p>
        <button
          onClick={onNext}
          className="w-8 h-8 rounded-lg hover:bg-rose-50 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={t("calendar.nextMonth")}
        >
          →
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 border-b border-rose-100">
        {dayNames.map((name) => (
          <div key={name} className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const k        = ymd(d);
          const inMonth  = d.getMonth() === viewMonth;
          const isToday  = k === today;
          const isPicked = k === selected;
          const dayPosts = dayMap.get(k) ?? [];
          const scheduledCount = dayPosts.filter((p) => p.status === "scheduled").length;
          const publishedCount = dayPosts.filter((p) => p.status === "published").length;
          const failedCount    = dayPosts.filter((p) => p.status === "failed").length;

          return (
            <button
              key={i}
              onClick={() => onPickDay(d)}
              className={`
                relative aspect-square p-1.5 border-r border-b border-rose-50 text-left transition-colors
                ${!inMonth ? "bg-gray-50/50 text-gray-300" : "hover:bg-rose-50"}
                ${isPicked ? "ring-2 ring-brand-500 ring-inset bg-rose-50" : ""}
                ${isToday ? "font-bold" : ""}
              `}
            >
              <div className={`text-xs ${isToday ? "text-brand-600" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                {d.getDate()}
              </div>
              {/* Status dots */}
              {(scheduledCount + publishedCount + failedCount) > 0 && (
                <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5 justify-start">
                  {Array.from({ length: Math.min(scheduledCount, 3) }).map((_, j) => (
                    <div key={`s${j}`} className="w-1.5 h-1.5 rounded-full bg-purple-400" title="Scheduled" />
                  ))}
                  {Array.from({ length: Math.min(publishedCount, 3) }).map((_, j) => (
                    <div key={`p${j}`} className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Published" />
                  ))}
                  {Array.from({ length: Math.min(failedCount, 3) }).map((_, j) => (
                    <div key={`f${j}`} className="w-1.5 h-1.5 rounded-full bg-red-400" title="Failed" />
                  ))}
                  {(scheduledCount + publishedCount + failedCount) > 9 && (
                    <span className="text-[9px] text-gray-400 leading-none">+</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-t border-rose-100 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> {t("calendar.legendScheduled")}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {t("calendar.legendPublished")}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> {t("calendar.legendFailed")}</span>
      </div>
    </div>
  );
}

// ─── Day detail modal ─────────────────────────────────────────────────────────

interface DayDetailModalProps {
  date:    Date;
  posts:   DraftRow[];
  onClose: () => void;
  onEdit:  (draft: DraftRow) => void;
}

function DayDetailModal({ date, posts, onClose, onEdit }: DayDetailModalProps) {
  const t      = useTranslations("social");
  const locale = useLocale();
  const utils  = api.useUtils();

  const deleteDraft = api.instagram.deleteDraft.useMutation({
    onSuccess: () => utils.instagram.listDrafts.invalidate(),
  });

  const publishNow = api.instagram.publishDraftNow.useMutation({
    onSuccess: () => utils.instagram.listDrafts.invalidate(),
  });

  const dateLabel = date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-rose-100 flex items-center justify-between">
          <p className="font-semibold text-gray-800 text-sm capitalize">{dateLabel}</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {posts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-500 text-center">{t("dayModal.empty")}</p>
          ) : (
            <div className="divide-y divide-rose-50">
              {posts.map((p) => (
                <div key={p.id} className="px-5 py-3 flex gap-3">
                  {p.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={p.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-rose-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 line-clamp-2">{p.caption}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        p.status === "scheduled"  ? "bg-purple-100 text-purple-700" :
                        p.status === "published"  ? "bg-emerald-100 text-emerald-700" :
                        p.status === "publishing" ? "bg-amber-100 text-amber-700" :
                        p.status === "failed"     ? "bg-red-100 text-red-700" :
                                                    "bg-gray-100 text-gray-600"
                      }`}>
                        {t(`status.${p.status}` as never, { default: p.status } as never)}
                      </span>
                      <span className="text-[10px] text-gray-400">{formatDateTime(p.scheduledFor)}</span>
                    </div>
                    {p.errorMessage && (
                      <p className="text-[10px] text-red-500 mt-1 line-clamp-2">{p.errorMessage}</p>
                    )}
                    {/* Actions */}
                    <div className="flex gap-1.5 mt-2">
                      {(p.status === "scheduled" || p.status === "failed" || p.status === "draft") && (
                        <>
                          <button
                            onClick={() => { onEdit(p); onClose(); }}
                            className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-gray-600 hover:bg-rose-100"
                          >
                            {t("actions.edit")}
                          </button>
                          <button
                            onClick={() => { if (confirm(t("actions.deleteConfirm"))) deleteDraft.mutate(p.id); }}
                            className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            {t("actions.delete")}
                          </button>
                          {p.imageUrl && p.caption && (
                            <button
                              onClick={() => publishNow.mutate(p.id)}
                              disabled={publishNow.isPending}
                              className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                            >
                              {publishNow.isPending ? "…" : t("actions.publishNow")}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drafts list ──────────────────────────────────────────────────────────────

interface DraftsListProps {
  drafts: DraftRow[];
  onEdit: (draft: DraftRow) => void;
}

function DraftsList({ drafts, onEdit }: DraftsListProps) {
  const t     = useTranslations("social");
  const utils = api.useUtils();

  const deleteDraft = api.instagram.deleteDraft.useMutation({
    onSuccess: () => utils.instagram.listDrafts.invalidate(),
  });

  // Unscheduled drafts only — scheduled ones already appear on the calendar
  const unscheduled = drafts.filter((d) => !d.scheduledFor && d.status === "draft");
  const failed      = drafts.filter((d) => d.status === "failed");

  if (unscheduled.length === 0 && failed.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {t("drafts.title")}
      </div>

      {/* Unscheduled drafts */}
      {unscheduled.length > 0 && (
        <div className="divide-y divide-rose-50">
          {unscheduled.map((d) => (
            <div key={d.id} className="px-5 py-3 flex gap-3 items-start">
              {d.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={d.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-rose-100" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 line-clamp-2">{d.caption || <span className="italic text-gray-400">{t("drafts.noCaption")}</span>}</p>
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={() => onEdit(d)}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-gray-600 hover:bg-rose-100"
                  >
                    {t("actions.edit")}
                  </button>
                  <button
                    onClick={() => { if (confirm(t("actions.deleteConfirm"))) deleteDraft.mutate(d.id); }}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    {t("actions.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed posts */}
      {failed.length > 0 && (
        <>
          <div className="px-5 py-2 bg-red-50/50 border-t border-rose-100 text-[10px] font-bold text-red-600 uppercase tracking-wider">
            {t("drafts.failed")}
          </div>
          <div className="divide-y divide-rose-50">
            {failed.map((d) => (
              <div key={d.id} className="px-5 py-3 flex gap-3 items-start">
                {d.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={d.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-rose-100" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 line-clamp-2">{d.caption}</p>
                  <p className="text-[10px] text-red-500 mt-0.5 line-clamp-1">{d.errorMessage}</p>
                  <div className="flex gap-1.5 mt-1.5">
                    <button
                      onClick={() => onEdit(d)}
                      className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-gray-600 hover:bg-rose-100"
                    >
                      {t("actions.edit")}
                    </button>
                    <button
                      onClick={() => { if (confirm(t("actions.deleteConfirm"))) deleteDraft.mutate(d.id); }}
                      className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      {t("actions.delete")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  /** When non-null, the composer renders in "edit" mode for that draft */
  editing:      DraftRow | null;
  /** Pre-fill schedule date from the calendar selection */
  prefilledDate: Date | null;
  onDone:       () => void;
  recipes:      Array<{ id: string; name: string; description: string | null; sellingPrice: string | null }>;
  premades:     Array<{ id: string; name: string; description: string | null; basePrice: string; allergens: string | null }>;
}

function Composer({ editing, prefilledDate, onDone, recipes, premades }: ComposerProps) {
  const t      = useTranslations("social");
  const locale = useLocale();
  const utils  = api.useUtils();
  const { bakeryName } = usePersonalization();

  // Form state
  const [caption,       setCaption]       = useState("");
  const [imageUrl,      setImageUrl]      = useState("");
  const [previewUrl,    setPreviewUrl]    = useState<string | null>(null);
  const [scheduledFor,  setScheduledFor]  = useState<string>(""); // local datetime input value
  const [uploading,     setUploading]     = useState(false);
  const [uploadErr,     setUploadErr]     = useState<string | null>(null);
  const [showCatalog,   setShowCatalog]   = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  // AI caption state — separate panel; mutually exclusive with catalog picker
  const [showAi,        setShowAi]        = useState(false);
  const [aiToneHint,    setAiToneHint]    = useState<string>("");
  /** Preview of a generated caption awaiting user accept/discard */
  const [aiPreview,     setAiPreview]     = useState<{ caption: string; hashtags: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI plumbing
  const { data: aiConfig }  = api.aiAssistant.getConfigStatus.useQuery();
  const { data: quota }     = api.aiAssistant.getQuotaUsage.useQuery();
  const { data: brandVoice } = api.aiAssistant.getBrandVoice.useQuery();
  const [showVoiceDetail, setShowVoiceDetail] = useState(false);

  const generateCaption     = api.aiAssistant.generateCaption.useMutation({
    onSuccess: (data) => {
      setAiPreview(data);
      utils.aiAssistant.getQuotaUsage.invalidate();
    },
    onError: () => {
      utils.aiAssistant.getQuotaUsage.invalidate();  // failed calls still consume quota
    },
  });

  const learnBrandVoice = api.aiAssistant.learnBrandVoice.useMutation({
    onSuccess: () => {
      utils.aiAssistant.getBrandVoice.invalidate();
      utils.aiAssistant.getQuotaUsage.invalidate();
    },
    onError: () => {
      utils.aiAssistant.getQuotaUsage.invalidate();
    },
  });

  const voiceQuotaExhausted = quota ? quota.byFeature.brand_voice.used >= quota.byFeature.brand_voice.limit : false;

  const aiNormalizedLocale: "en" | "nb" = locale === "nb" ? "nb" : "en";
  const captionQuotaExhausted = quota ? quota.byFeature.caption.used >= quota.byFeature.caption.limit : false;
  const captionQuotaText = quota
    ? `${quota.byFeature.caption.used} / ${quota.byFeature.caption.limit}`
    : "—";

  // Initialise form from editing draft or prefilled date
  useEffect(() => {
    if (editing) {
      setCaption(editing.caption ?? "");
      setImageUrl(editing.imageUrl ?? "");
      setPreviewUrl(editing.imageUrl);
      setScheduledFor(editing.scheduledFor ? toLocalInput(new Date(editing.scheduledFor)) : "");
    } else if (prefilledDate) {
      // Default to 10:00 on the picked day if user only clicked a date
      const pre = new Date(prefilledDate);
      pre.setHours(10, 0, 0, 0);
      setScheduledFor(toLocalInput(pre));
    }
  }, [editing, prefilledDate]);

  const createDraft = api.instagram.createDraft.useMutation({
    onSuccess: () => {
      utils.instagram.listDrafts.invalidate();
      resetForm();
      onDone();
    },
  });

  const updateDraft = api.instagram.updateDraft.useMutation({
    onSuccess: () => {
      utils.instagram.listDrafts.invalidate();
      resetForm();
      onDone();
    },
  });

  const createPost = api.instagram.createPost.useMutation({
    onSuccess: () => {
      utils.instagram.getPosts.invalidate();
      utils.instagram.listDrafts.invalidate();
      resetForm();
      onDone();
    },
  });

  function resetForm() {
    setCaption("");
    setImageUrl("");
    setPreviewUrl(null);
    setScheduledFor("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function insertFromRecipe(recipe: typeof recipes[number]) {
    const tmpl = buildCatalogTemplate({
      name:        recipe.name,
      description: recipe.description,
      price:       recipe.sellingPrice,
      allergens:   [],
    });
    setCaption((c) => (c.trim() ? `${c.trimEnd()}\n\n${tmpl}` : tmpl));
    setShowCatalog(false);
  }

  function insertFromPremade(cake: typeof premades[number]) {
    const allergens = cake.allergens
      ? cake.allergens.split(",").map((a) => a.trim()).filter(Boolean)
      : [];
    const tmpl = buildCatalogTemplate({
      name:        cake.name,
      description: cake.description,
      price:       cake.basePrice,
      allergens,
    });
    setCaption((c) => (c.trim() ? `${c.trimEnd()}\n\n${tmpl}` : tmpl));
    setShowCatalog(false);
  }

  /** Apply a generated caption: replace the textarea content, append hashtags */
  function acceptAiPreview() {
    if (!aiPreview) return;
    const hashtagLine = aiPreview.hashtags.length > 0
      ? "\n\n" + aiPreview.hashtags.map((h) => `#${h}`).join(" ")
      : "";
    setCaption(aiPreview.caption + hashtagLine);
    setAiPreview(null);
    setShowAi(false);
  }

  function triggerAiGeneration(args: { productType: "recipe" | "premade"; productId: string }) {
    setAiPreview(null);
    generateCaption.mutate({
      productType: args.productType,
      productId:   args.productId,
      language:    aiNormalizedLocale,
      toneHint:    aiToneHint || undefined,
      bakeryName,
    });
  }

  const filterTerm       = catalogSearch.toLowerCase().trim();
  const filteredRecipes  = filterTerm ? recipes.filter((r) => r.name.toLowerCase().includes(filterTerm))  : recipes.slice(0, 20);
  const filteredPremades = filterTerm ? premades.filter((c) => c.name.toLowerCase().includes(filterTerm)) : premades.slice(0, 20);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Defense-in-depth: see file-header comment. Bucket RLS is the real gate.
    const MAX_BYTES   = 10 * 1024 * 1024; // 10 MB
    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
    const EXT_BY_MIME: Record<(typeof ALLOWED_MIME)[number], string> = {
      "image/jpeg": "jpg",
      "image/png":  "png",
      "image/webp": "webp",
    };

    if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
      setUploadErr(t("composer.upload.wrongType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadErr(t("composer.upload.tooLarge"));
      return;
    }

    setUploading(true);
    setUploadErr(null);
    try {
      const supabase = createClientSupabase();
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setUploadErr(t("composer.upload.notSignedIn"));
        return;
      }
      if (userData.user.is_anonymous) {
        setUploadErr(t("composer.upload.demoAccount"));
        return;
      }
      const ext  = EXT_BY_MIME[file.type as (typeof ALLOWED_MIME)[number]];
      const path = `posts/${userData.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("instagram-media")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: { publicUrl } } = supabase.storage.from("instagram-media").getPublicUrl(path);
      setImageUrl(publicUrl);
      setPreviewUrl(publicUrl);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const scheduledDate = fromLocalInput(scheduledFor);
  const isScheduled   = !!scheduledDate;
  const canSubmit     = !!imageUrl && !!caption.trim();
  const isPending     = createDraft.isPending || updateDraft.isPending || createPost.isPending;

  function handleSaveDraft() {
    if (editing) {
      updateDraft.mutate({
        id:           editing.id,
        imageUrl:     imageUrl || null,
        caption:      caption || null,
        scheduledFor: scheduledDate,
      });
    } else {
      createDraft.mutate({
        imageUrl:     imageUrl || null,
        caption:      caption || null,
        scheduledFor: scheduledDate,
      });
    }
  }

  function handlePostNow() {
    if (!canSubmit) return;
    if (editing) {
      // For an existing draft, we'd need a "publish this draft" action.
      // For simplicity here: save edits as draft, then user can use the
      // "Publish now" button on the day modal. Could be improved later.
      handleSaveDraft();
      return;
    }
    createPost.mutate({ imageUrl, caption: caption.trim() });
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">{editing ? t("composer.editTitle") : t("composer.newTitle")}</h2>
        {editing && (
          <button
            onClick={() => { resetForm(); onDone(); }}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            {t("composer.cancelEdit")}
          </button>
        )}
      </div>

      {/* Image picker */}
      <div>
        <label className="form-label">{t("composer.photoLabel")}</label>
        {previewUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="w-full max-h-56 object-cover rounded-xl border border-rose-200" />
            <button
              type="button"
              onClick={() => { setPreviewUrl(null); setImageUrl(""); if (fileRef.current) fileRef.current.value = ""; }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-rose-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-300 hover:bg-rose-50/50"
            onClick={() => fileRef.current?.click()}
          >
            <div className="text-2xl mb-1">📷</div>
            <p className="text-xs text-gray-500">{uploading ? t("composer.uploading") : t("composer.uploadHint")}</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        {uploadErr && <p className="text-xs text-red-500 mt-1">{uploadErr}</p>}
      </div>

      {/* Caption */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="form-label">{t("composer.captionLabel")}</label>
          <span className={`text-xs ${caption.length > MAX_CAPTION * 0.9 ? "text-amber-600" : "text-gray-400"}`}>
            {caption.length} / {MAX_CAPTION}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setShowCatalog((v) => !v); setShowAi(false); }}
            className="text-xs px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-brand-600 hover:bg-rose-100"
          >
            {showCatalog ? `× ${t("hideCatalog")}` : `🧁 ${t("insertFromCatalog")}`}
          </button>
          {/* AI caption button — disabled with explanation if not configured / quota hit */}
          <button
            type="button"
            onClick={() => { setShowAi((v) => !v); setShowCatalog(false); }}
            disabled={!aiConfig?.configured || captionQuotaExhausted}
            title={
              !aiConfig?.configured ? t("ai.notConfigured")
              : captionQuotaExhausted ? t("ai.quotaExhausted")
              : ""
            }
            className={`text-xs px-2.5 py-1 rounded-lg border ${
              !aiConfig?.configured || captionQuotaExhausted
                ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 text-purple-700 hover:from-purple-100 hover:to-pink-100"
            }`}
          >
            {showAi ? `× ${t("ai.hide")}` : `✨ ${t("ai.button")} (${captionQuotaText})`}
          </button>
        </div>

        {/* AI panel — shows preview if available, otherwise the picker */}
        {showAi && (
          <div className="mb-2 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/40 to-pink-50/40 p-3 space-y-3">

            {/* Brand voice indicator — sits above generation controls */}
            <div className="rounded-lg bg-white/60 border border-purple-100 px-2.5 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-purple-700 font-semibold">🎨 {t("ai.voice.label")}:</span>
                <span className="text-gray-700 flex-1">
                  {brandVoice?.voiceDescription
                    ? t("ai.voice.learned", { date: brandVoice.generatedAt ? new Date(brandVoice.generatedAt).toLocaleDateString() : "—" })
                    : t("ai.voice.default")}
                </span>
                {brandVoice?.voiceDescription && (
                  <button
                    type="button"
                    onClick={() => setShowVoiceDetail((v) => !v)}
                    className="text-purple-600 hover:text-purple-800 text-[11px] underline"
                  >
                    {showVoiceDetail ? t("ai.voice.hide") : t("ai.voice.view")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (learnBrandVoice.isPending) return;
                    if (!confirm(t("ai.voice.confirmRefresh"))) return;
                    learnBrandVoice.mutate({
                      language:   aiNormalizedLocale,
                      bakeryName,
                    });
                  }}
                  disabled={
                    !aiConfig?.configured ||
                    voiceQuotaExhausted ||
                    !brandVoice?.eligible ||
                    learnBrandVoice.isPending
                  }
                  title={
                    !aiConfig?.configured ? t("ai.notConfigured")
                    : voiceQuotaExhausted ? t("ai.voice.quotaExhausted")
                    : !brandVoice?.eligible ? t("ai.voice.notEnoughPosts", { have: brandVoice?.captionCount ?? 0, need: brandVoice?.minRequired ?? 5 })
                    : ""
                  }
                  className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500 text-white font-semibold hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {learnBrandVoice.isPending ? t("ai.voice.analyzing") : t("ai.voice.refresh")}
                </button>
              </div>

              {/* Expanded voice description */}
              {showVoiceDetail && brandVoice?.voiceDescription && (
                <div className="mt-2 pt-2 border-t border-purple-100 space-y-2">
                  <p className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {brandVoice.voiceDescription}
                  </p>
                  {brandVoice.exampleCaptions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">
                        {t("ai.voice.examples")}
                      </p>
                      <ul className="space-y-1">
                        {brandVoice.exampleCaptions.map((ex, i) => (
                          <li key={i} className="text-[10px] text-gray-600 italic line-clamp-2">
                            &ldquo;{ex}&rdquo;
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {learnBrandVoice.error && (
                <p className="mt-1 text-[10px] text-red-600">{learnBrandVoice.error.message}</p>
              )}
            </div>

            {aiPreview ? (
              /* Preview state — show generated caption + hashtags, let user accept */
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                  ✨ {t("ai.previewTitle")}
                </p>
                <div className="rounded-lg bg-white border border-purple-100 p-3 text-sm text-gray-800 whitespace-pre-wrap">
                  {aiPreview.caption}
                </div>
                {aiPreview.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {aiPreview.hashtags.map((h) => (
                      <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">#{h}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={acceptAiPreview}
                    className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold hover:from-purple-600 hover:to-pink-600"
                  >
                    {t("ai.useIt")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiPreview(null)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-purple-200 text-purple-700 text-xs hover:bg-purple-50"
                  >
                    {t("ai.tryAgain")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAiPreview(null); setShowAi(false); }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 text-xs hover:bg-gray-50"
                  >
                    {t("ai.discard")}
                  </button>
                </div>
              </div>
            ) : (
              /* Picker state — choose tone + product to trigger generation */
              <>
                <div>
                  <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">
                    {t("ai.toneLabel")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {["", "warm", "playful", "professional", "celebratory"].map((tone) => (
                      <button
                        key={tone || "default"}
                        type="button"
                        onClick={() => setAiToneHint(tone)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          aiToneHint === tone
                            ? "bg-purple-500 text-white border-purple-500"
                            : "bg-white border-purple-200 text-purple-700 hover:bg-purple-50"
                        }`}
                      >
                        {tone === "" ? t("ai.toneDefault") : t(`ai.tone.${tone}` as never)}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="search"
                  placeholder={t("catalogSearchPlaceholder")}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="form-input text-sm"
                />

                {generateCaption.isPending && (
                  <p className="text-xs text-purple-700 text-center py-2 animate-pulse">{t("ai.generating")}</p>
                )}
                {generateCaption.error && (
                  <p className="text-xs text-red-600 text-center py-1">{generateCaption.error.message}</p>
                )}

                <div className="max-h-44 overflow-y-auto space-y-2">
                  {filteredPremades.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">🧁 {t("premadeCakes")}</p>
                      <div className="space-y-1">
                        {filteredPremades.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={generateCaption.isPending}
                            onClick={() => triggerAiGeneration({ productType: "premade", productId: c.id })}
                            className="w-full text-left px-2 py-1.5 rounded-md text-xs text-gray-700 hover:bg-white hover:text-purple-700 disabled:opacity-50"
                          >
                            {c.name}<span className="ml-2 text-purple-400">kr {parseFloat(c.basePrice).toFixed(0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {filteredRecipes.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">📖 {t("recipes")}</p>
                      <div className="space-y-1">
                        {filteredRecipes.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            disabled={generateCaption.isPending}
                            onClick={() => triggerAiGeneration({ productType: "recipe", productId: r.id })}
                            className="w-full text-left px-2 py-1.5 rounded-md text-xs text-gray-700 hover:bg-white hover:text-purple-700 disabled:opacity-50"
                          >
                            {r.name}
                            {r.sellingPrice && <span className="ml-2 text-purple-400">kr {parseFloat(r.sellingPrice).toFixed(0)}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {filteredRecipes.length === 0 && filteredPremades.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-2">{t("catalogNoResults")}</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mb-2">
          {showCatalog && (
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-2 max-h-56 overflow-y-auto">
              <input
                type="search"
                placeholder={t("catalogSearchPlaceholder")}
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="form-input text-sm"
              />
              {filteredPremades.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-1">🧁 {t("premadeCakes")}</p>
                  <div className="space-y-1">
                    {filteredPremades.map((c) => (
                      <button key={c.id} type="button" onClick={() => insertFromPremade(c)}
                              className="w-full text-left px-2 py-1.5 rounded-md text-xs text-gray-700 hover:bg-white hover:text-brand-600">
                        {c.name}<span className="ml-2 text-brand-400">kr {parseFloat(c.basePrice).toFixed(0)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {filteredRecipes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-1">📖 {t("recipes")}</p>
                  <div className="space-y-1">
                    {filteredRecipes.map((r) => (
                      <button key={r.id} type="button" onClick={() => insertFromRecipe(r)}
                              className="w-full text-left px-2 py-1.5 rounded-md text-xs text-gray-700 hover:bg-white hover:text-brand-600">
                        {r.name}
                        {r.sellingPrice && <span className="ml-2 text-brand-400">kr {parseFloat(r.sellingPrice).toFixed(0)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {filteredRecipes.length === 0 && filteredPremades.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">{t("catalogNoResults")}</p>
              )}
            </div>
          )}
        </div>
        <textarea
          className="form-input resize-none"
          rows={4}
          placeholder={t("composer.captionPlaceholder")}
          value={caption}
          maxLength={MAX_CAPTION}
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>

      {/* Schedule */}
      <div>
        <label className="form-label">{t("composer.scheduleLabel")}</label>
        <input
          type="datetime-local"
          className="form-input"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-1">{t("composer.scheduleHint")}</p>
      </div>

      {(createDraft.error || updateDraft.error || createPost.error) && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {(createDraft.error?.message ?? updateDraft.error?.message ?? createPost.error?.message)}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveDraft}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-brand-600 text-sm font-medium hover:bg-rose-100 disabled:opacity-40"
        >
          {isPending
            ? t("composer.saving")
            : isScheduled
              ? (editing ? t("composer.updateSchedule") : t("composer.schedule"))
              : (editing ? t("composer.updateDraft")   : t("composer.saveDraft"))
          }
        </button>
        {!editing && !isScheduled && (
          <button
            onClick={handlePostNow}
            disabled={!canSubmit || isPending}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-40"
          >
            {createPost.isPending ? t("composer.posting") : t("composer.postNow")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Recent posts ─────────────────────────────────────────────────────────────

// ─── Weekly plan card ─────────────────────────────────────────────────────────

/** Map Claude's "suggestedTime" enum to a wall-clock hour for scheduling */
const TIME_OF_DAY_HOUR: Record<string, number> = {
  morning:   8,
  midday:    12,
  afternoon: 15,
  evening:   18,
};

/** Next Monday from today, as YYYY-MM-DD (local time) */
function nextMondayYmd(): string {
  const d = new Date();
  const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type PlannedPost = {
  date:           string;
  theme:          string;
  suggestedTime:  "morning" | "midday" | "afternoon" | "evening";
  captionDraft:   string;
  hashtags:       string[];
  rationale:      string;
  productName:    string | null;
  productId:      string | null;
  productType:    "recipe" | "premade" | null;
};

function WeeklyPlanCard() {
  const t      = useTranslations("social");
  const locale = useLocale();
  const utils  = api.useUtils();
  const { bakeryName } = usePersonalization();

  const [weekStart,  setWeekStart]  = useState(nextMondayYmd());
  const [plan,       setPlan]       = useState<PlannedPost[] | null>(null);
  /** Tracks which posts have been turned into drafts. Index into plan array. */
  const [accepted,   setAccepted]   = useState<Set<number>>(new Set());

  const { data: aiConfig } = api.aiAssistant.getConfigStatus.useQuery();
  const { data: quota }    = api.aiAssistant.getQuotaUsage.useQuery();

  const generatePlan = api.aiAssistant.generateWeeklyPlan.useMutation({
    onSuccess: (data) => {
      setPlan(data.posts);
      setAccepted(new Set());
      utils.aiAssistant.getQuotaUsage.invalidate();
    },
    onError: () => {
      utils.aiAssistant.getQuotaUsage.invalidate();
    },
  });

  const createDraft = api.instagram.createDraft.useMutation({
    onSuccess: () => {
      utils.instagram.listDrafts.invalidate();
    },
  });

  const planQuotaExhausted = quota ? quota.byFeature.weekly_plan.used >= quota.byFeature.weekly_plan.limit : false;
  const planQuotaText = quota
    ? `${quota.byFeature.weekly_plan.used} / ${quota.byFeature.weekly_plan.limit}`
    : "—";

  function acceptPost(idx: number) {
    if (!plan) return;
    const post = plan[idx];
    if (!post) return;

    const hour = TIME_OF_DAY_HOUR[post.suggestedTime] ?? 10;
    // Build local-time datetime from the post's date string + suggested hour
    const [y, m, d] = post.date.split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return;
    const scheduledFor = new Date(y, m - 1, d, hour, 0, 0, 0);

    // Refuse past-dated scheduling — the createDraft endpoint enforces this
    // too, but bail early to give the user a clearer UX.
    if (scheduledFor.getTime() < Date.now()) {
      alert(t("plan.pastDateWarning"));
      return;
    }

    const hashtagSuffix = post.hashtags.length > 0
      ? "\n\n" + post.hashtags.map((h) => `#${h}`).join(" ")
      : "";

    createDraft.mutate({
      caption:      post.captionDraft + hashtagSuffix,
      scheduledFor,
      platforms:    ["instagram"],
    }, {
      onSuccess: () => {
        setAccepted((s) => new Set(s).add(idx));
      },
    });
  }

  const aiNormalizedLocale: "en" | "nb" = locale === "nb" ? "nb" : "en";

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-rose-100 flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
          ✨ {t("plan.title")}
        </p>
        {plan && (
          <button
            type="button"
            onClick={() => { setPlan(null); setAccepted(new Set()); }}
            className="text-[10px] text-gray-400 hover:text-gray-700 underline"
          >
            {t("plan.clear")}
          </button>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        {!plan ? (
          <>
            <p className="text-xs text-gray-500">{t("plan.intro")}</p>
            <div>
              <label className="form-label text-xs">{t("plan.weekStart")}</label>
              <input
                type="date"
                className="form-input text-sm"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
            {generatePlan.error && (
              <p className="text-xs text-red-600">{generatePlan.error.message}</p>
            )}
            <button
              type="button"
              onClick={() => generatePlan.mutate({
                language:   aiNormalizedLocale,
                bakeryName,
                weekStart,
              })}
              disabled={!aiConfig?.configured || planQuotaExhausted || generatePlan.isPending}
              title={
                !aiConfig?.configured ? t("ai.notConfigured")
                : planQuotaExhausted   ? t("plan.quotaExhausted")
                : ""
              }
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generatePlan.isPending
                ? t("plan.generating")
                : t("plan.generate", { quota: planQuotaText })}
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              {t("plan.costHint")}
            </p>
          </>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {plan.map((p, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 space-y-2 transition-opacity ${
                  accepted.has(i)
                    ? "bg-emerald-50/40 border-emerald-200 opacity-70"
                    : "bg-white border-purple-100"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-purple-700">{p.date}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-600">{p.theme}</span>
                  <span className="ml-auto text-[10px] text-gray-400 capitalize">
                    {t(`plan.time.${p.suggestedTime}` as never)}
                  </span>
                </div>

                {p.productName && (
                  <div className="text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded ${
                      p.productId
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {p.productId ? `${p.productType === "recipe" ? "📖" : "🧁"} ` : "❓ "}
                      {p.productName}
                    </span>
                  </div>
                )}

                <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {p.captionDraft}
                </p>

                {p.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.hashtags.map((h) => (
                      <span key={h} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">#{h}</span>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-gray-400 italic">{p.rationale}</p>

                <div className="flex gap-1.5 pt-1">
                  {accepted.has(i) ? (
                    <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                      ✓ {t("plan.scheduled")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => acceptPost(i)}
                      disabled={createDraft.isPending}
                      className="flex-1 text-[10px] px-2 py-1 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
                    >
                      {t("plan.schedule")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentPostsList() {
  const t = useTranslations("social");
  const { data: posts = [], isLoading } = api.instagram.getPosts.useQuery();

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {t("recent.title")}
      </div>
      {isLoading ? (
        <div className="px-5 py-6 text-sm text-gray-400 text-center animate-pulse">{t("recent.loading")}</div>
      ) : posts.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-400 text-center">{t("recent.empty")}</div>
      ) : (
        <div className="divide-y divide-rose-50 max-h-96 overflow-y-auto">
          {posts.map((post) => (
            <div key={post.id} className="px-5 py-3 flex gap-3 items-start">
              {post.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={post.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-rose-100" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                    post.status === "posted"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-600 border-red-200"
                  }`}>
                    {post.status === "posted" ? t("status.published") : t("status.failed")}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {post.postedAt ? formatDateTime(post.postedAt) : formatDateTime(post.createdAt)}
                  </span>
                </div>
                {post.errorMessage && <p className="text-[10px] text-red-500 mt-1">{post.errorMessage}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SocialPage() {
  const t = useTranslations("social");
  const { data: conn,  isLoading: connLoading }  = api.instagram.getConnection.useQuery();
  const { data: drafts = [] }                    = api.instagram.listDrafts.useQuery(undefined, { enabled: conn?.connected });
  const { data: recipes  = [] }                  = api.recipes.getAll.useQuery({ limit: 200 });
  const { data: premades = [] }                  = api.premadeCakes.list.useQuery({ isActive: true });

  // Calendar state
  const today = new Date();
  const [viewYear,   setViewYear]   = useState(today.getFullYear());
  const [viewMonth,  setViewMonth]  = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);

  // Composer state
  const [editing, setEditing] = useState<DraftRow | null>(null);

  // Normalise dates from server (they come over the wire as strings or Date depending on superjson)
  const draftsNormalised: DraftRow[] = useMemo(
    () => drafts.map((d) => ({
      id:           d.id,
      imageUrl:     d.imageUrl,
      caption:      d.caption,
      scheduledFor: d.scheduledFor ? new Date(d.scheduledFor) : null,
      status:       d.status,
      errorMessage: d.errorMessage,
      publishedAt:  d.publishedAt ? new Date(d.publishedAt) : null,
    })),
    [drafts],
  );

  function pickDay(d: Date) {
    setSelectedDate(d);
    // Open modal if there are posts on this day
    const k = ymd(d);
    const hasPosts = draftsNormalised.some((p) => p.scheduledFor && ymd(p.scheduledFor) === k);
    if (hasPosts) setDayModalOpen(true);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  if (connLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-8 bg-rose-100 rounded w-40" />
        <div className="h-48 bg-rose-100 rounded-xl" />
      </div>
    );
  }

  if (!conn?.connected) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="page-title">Social</h1>
        <ConnectPrompt />
      </div>
    );
  }

  const postsForSelectedDay = selectedDate
    ? draftsNormalised.filter((p) => p.scheduledFor && ymd(p.scheduledFor) === ymd(selectedDate))
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Social</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("postingAs")}{" "}
            <span className="font-medium text-gray-700">
              {conn.igUsername ? `@${conn.igUsername}` : conn.pageName ?? "Instagram"}
            </span>
          </p>
        </div>
        <Link href="/settings" className="text-xs text-gray-400 hover:text-gray-700">
          {t("manageConnection")} →
        </Link>
      </div>

      {/* Two-column layout — calendar+drafts on left, composer+recent on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3 width on lg+) */}
        <div className="lg:col-span-2 space-y-6">
          <Calendar
            drafts={draftsNormalised}
            viewYear={viewYear}
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            onPrev={prevMonth}
            onNext={nextMonth}
            onPickDay={pickDay}
          />
          <DraftsList
            drafts={draftsNormalised}
            onEdit={(d) => setEditing(d)}
          />
        </div>

        {/* Right column (1/3 width on lg+) */}
        <div className="space-y-6">
          <WeeklyPlanCard />
          <Composer
            editing={editing}
            prefilledDate={selectedDate}
            onDone={() => setEditing(null)}
            recipes={recipes.map((r) => ({ id: r.id, name: r.name, description: r.description, sellingPrice: r.sellingPrice }))}
            premades={premades.map((p) => ({ id: p.id, name: p.name, description: p.description, basePrice: p.basePrice, allergens: p.allergens }))}
          />
          <RecentPostsList />
        </div>
      </div>

      {/* Day detail modal */}
      {dayModalOpen && selectedDate && (
        <DayDetailModal
          date={selectedDate}
          posts={postsForSelectedDay}
          onClose={() => setDayModalOpen(false)}
          onEdit={(d) => setEditing(d)}
        />
      )}
    </div>
  );
}
