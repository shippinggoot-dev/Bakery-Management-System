"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface CopyFieldProps {
  value: string;
  label?: string;
}

/** Read-only field with a copy-to-clipboard button. */
export function CopyField({ value, label }: CopyFieldProps) {
  const t = useTranslations("wizard");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers / insecure contexts — fall back to no-op; the field
      // is select-all so the user can copy manually.
    }
  }

  return (
    <div>
      {label && (
        <p className="text-xs font-medium text-gray-600 mb-1.5">{label}</p>
      )}
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="flex-1 form-input font-mono text-xs bg-rose-50 cursor-text select-all"
        />
        <button
          type="button"
          onClick={handleCopy}
          aria-live="polite"
          className="px-4 py-2 rounded-xl bg-brand-100 text-brand-700 border border-brand-200 hover:bg-brand-200 text-sm font-medium transition-colors flex-shrink-0"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}
