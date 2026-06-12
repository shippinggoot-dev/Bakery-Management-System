"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";
import { XIcon } from "@/components/icons";

type Category = "bug" | "idea" | "question" | "other";

const CATEGORIES: Category[] = ["bug", "idea", "question", "other"];

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Floating feedback button + modal, mounted globally via root layout.
 *
 * Flow on submit:
 *   1. (optional) Capture current page via html2canvas
 *   2. Upload screenshot + attachment to `feedback-screenshots` bucket
 *      using the user's authenticated Supabase session
 *   3. Call feedback.submit mutation with the storage paths
 *   4. Server fires Discord webhook (minimal payload — see router)
 *
 * The widget hides itself before screenshot capture so the button does
 * not appear in the image.
 */
export function FeedbackWidget() {
  const t = useTranslations("feedback");
  const locale = useLocale();
  const pathname = usePathname();
  const widgetRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = api.feedback.submit.useMutation();

  // Reset state when modal closes (after the close animation).
  useEffect(() => {
    if (!open && sent) {
      const timer = setTimeout(() => {
        setMessage("");
        setCategory("bug");
        setIncludeScreenshot(true);
        setAttachment(null);
        setSent(false);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, sent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClientSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not-signed-in");

      let screenshotPath: string | null = null;
      let attachmentPath: string | null = null;

      // 1) Capture page screenshot if enabled.
      if (includeScreenshot) {
        try {
          // Hide the modal + button so the screenshot shows the underlying page.
          if (widgetRef.current) widgetRef.current.style.visibility = "hidden";
          const html2canvas = (await import("html2canvas")).default;
          const canvas = await html2canvas(document.body, {
            logging:    false,
            useCORS:    true,
            scale:      Math.min(window.devicePixelRatio || 1, 2),
            ignoreElements: (el) => el.hasAttribute?.("data-feedback-widget"),
          });
          const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png", 0.9)
          );
          if (blob) {
            const path = `${user.id}/${crypto.randomUUID()}.png`;
            const { error: upErr } = await supabase.storage
              .from("feedback-screenshots")
              .upload(path, blob, { contentType: "image/png", upsert: false });
            if (upErr) throw upErr;
            screenshotPath = path;
          }
        } catch {
          // Screenshot capture is best-effort. If it fails we still send the text.
          screenshotPath = null;
        } finally {
          if (widgetRef.current) widgetRef.current.style.visibility = "";
        }
      }

      // 2) Upload manual attachment if any.
      if (attachment) {
        if (attachment.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("attachment-too-large");
        }
        const ext = attachment.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("feedback-screenshots")
          .upload(path, attachment, {
            contentType: attachment.type || "application/octet-stream",
            upsert:      false,
          });
        if (upErr) throw upErr;
        attachmentPath = path;
      }

      // 3) Record the feedback row.
      await submit.mutateAsync({
        category,
        message: message.trim(),
        pageUrl: pathname,
        language: locale,
        userAgent: navigator.userAgent.slice(0, 500),
        screenshotPath,
        attachmentPath,
      });

      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "attachment-too-large") setError(t("errorAttachmentTooLarge"));
      else if (msg === "not-signed-in") setError(t("errorNotSignedIn"));
      else setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={widgetRef} data-feedback-widget>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 active:scale-95 transition-all flex items-center gap-2 text-sm font-medium"
          aria-label={t("openButton")}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0-8-8c0 1.302.31 2.532.86 3.619l-.821 2.871a.5.5 0 0 0 .618.618l2.871-.821A7.96 7.96 0 0 0 10 18Z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">{t("openButton")}</span>
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-rose-100 overflow-hidden">
            {sent ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 5.296a1 1 0 0 1 0 1.408l-7.5 7.5a1 1 0 0 1-1.408 0l-3.5-3.5a1 1 0 1 1 1.408-1.408L8.5 12.092l6.796-6.796a1 1 0 0 1 1.408 0Z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="section-title">{t("thanksTitle")}</h3>
                <p className="text-sm text-gray-600">{t("thanksBody")}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-primary w-full"
                >
                  {t("close")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="section-title">{t("modalTitle")}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{t("modalSubtitle")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-1 rounded hover:bg-rose-50 text-gray-500"
                    aria-label={t("close")}
                  >
                    <XIcon />
                  </button>
                </div>

                <div>
                  <label className="form-label">{t("category")}</label>
                  <select
                    className="form-input text-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{t(`categories.${c}`)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">{t("message")}</label>
                  <textarea
                    className="form-input text-sm resize-none"
                    rows={4}
                    placeholder={t("messagePlaceholder")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={5000}
                    required
                  />
                </div>

                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={includeScreenshot}
                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                  />
                  <span className="text-gray-700">{t("includeScreenshot")}</span>
                </label>

                <div>
                  <label className="form-label">{t("attachment")}</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="text-sm w-full"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t("attachmentHint")}</p>
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="btn-ghost flex-1"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || submitting}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {submitting ? t("sending") : t("send")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
